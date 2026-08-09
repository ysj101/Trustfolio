#!/bin/bash
# codex-watch.sh — Codex プラグインのバックグラウンドジョブをハング検知つきで監視する。
#
# 背景:
#   codex-rescue ジョブは、ランタイム側が異常終了するとジョブ台帳が「running」の
#   まま残り、完了通知も来ないことがある（実例: 2026-08-09、最終検証コマンド実行中に
#   プロセスが消滅し、ログ更新停止のまま 80 分以上「running / verifying」表示が継続）。
#   本スクリプトは「status が running」かつ「ジョブログの mtime が stale-min 分以上
#   更新されていない」状態をハングと判定し、終了コードで呼び出し側へ伝える。
#
# 使い方:
#   codex-watch.sh <job-id> [--stale-min N] [--interval N] [--cancel]
#     --stale-min N : ログ無更新をハングとみなす閾値（分）。既定 15
#     --interval N  : ポーリング間隔（秒）。既定 30
#     --cancel      : ハング判定時にジョブを自動キャンセルする
#
# 終了コード:
#   0 = ジョブが running でなくなった（完了・失敗・キャンセルいずれか。status を出力）
#   2 = ハング判定（ログ stale）。--cancel 指定時はキャンセル済み
#   3 = ジョブが見つからない／companion スクリプトが見つからない
#
# Claude Code からの推奨実行方法: Bash ツールの run_in_background: true で起動し、
# 完了通知の終了コードで「完了」と「ハング」を区別する。ハング（exit 2）の場合は
# 作業ツリーの成果物を直接検証（git diff / lint / test）して引き取りを判断する。

set -u

JOB_ID="${1:-}"
if [ -z "$JOB_ID" ]; then
  echo "usage: codex-watch.sh <job-id> [--stale-min N] [--interval N] [--cancel]" >&2
  exit 3
fi
shift

STALE_MIN=15
INTERVAL=30
AUTO_CANCEL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --stale-min) STALE_MIN="$2"; shift 2 ;;
    --interval)  INTERVAL="$2";  shift 2 ;;
    --cancel)    AUTO_CANCEL=1;  shift ;;
    *) echo "unknown option: $1" >&2; exit 3 ;;
  esac
done

# 最新バージョンの companion スクリプトを解決する（プラグイン更新でパスが変わるため）
COMPANION=$(ls -1d "$HOME"/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs 2>/dev/null | sort -V | tail -1)
if [ -z "$COMPANION" ]; then
  echo "codex-companion.mjs が見つかりません" >&2
  exit 3
fi

status_output=""
fetch_status() {
  status_output=$(node "$COMPANION" status "$JOB_ID" 2>&1)
}

fetch_status
if echo "$status_output" | grep -q 'No job found'; then
  echo "$status_output"
  exit 3
fi

# status 出力からログパスを取得する（例: 「  Log: /path/to/job.log」）。
# 委譲直後はジョブがまだログを生成しておらず Log: 行が無いことがあるため、
# 取得できるまで毎ループ再取得する（1回きりの取得だとハング検知が無効化されたまま
# 動き続けるサイレントな機能欠落になる）。
LOG_PATH=""
START_TIME=$(date +%s)

resolve_log_path() {
  if [ -z "$LOG_PATH" ]; then
    LOG_PATH=$(echo "$status_output" | sed -n 's/^[[:space:]]*Log:[[:space:]]*//p' | head -1)
  fi
}
resolve_log_path

while :; do
  if ! echo "$status_output" | grep -q '| running |'; then
    echo "=== ジョブは running ではなくなりました ==="
    echo "$status_output"
    exit 0
  fi

  # ログパスが未取得のまま閾値時間を超えた場合も、検知不能のまま待ち続けず
  # ハング相当として fail fast で通知する。
  if [ -z "$LOG_PATH" ] || [ ! -f "$LOG_PATH" ]; then
    now=$(date +%s)
    elapsed_min=$(( (now - START_TIME) / 60 ))
    if [ "$elapsed_min" -ge "$STALE_MIN" ]; then
      echo "=== ハング判定: 起動から ${elapsed_min} 分経過してもジョブログを取得できません（閾値 ${STALE_MIN} 分） ==="
      echo "$status_output"
      if [ "$AUTO_CANCEL" -eq 1 ]; then
        echo "--- 自動キャンセルを実行します ---"
        node "$COMPANION" cancel "$JOB_ID" 2>&1
      fi
      echo "成果物は作業ツリーに残っている可能性があります。git diff と lint / test で直接検証して引き取りを判断してください。"
      exit 2
    fi
  fi

  if [ -n "$LOG_PATH" ] && [ -f "$LOG_PATH" ]; then
    now=$(date +%s)
    mtime=$(stat -f %m "$LOG_PATH" 2>/dev/null || stat -c %Y "$LOG_PATH" 2>/dev/null)
    if [ -n "$mtime" ]; then
      age_min=$(( (now - mtime) / 60 ))
      if [ "$age_min" -ge "$STALE_MIN" ]; then
        echo "=== ハング判定: ログが ${age_min} 分間更新されていません（閾値 ${STALE_MIN} 分） ==="
        echo "--- ログ末尾 ---"
        tail -5 "$LOG_PATH"
        if [ "$AUTO_CANCEL" -eq 1 ]; then
          echo "--- 自動キャンセルを実行します ---"
          node "$COMPANION" cancel "$JOB_ID" 2>&1
        fi
        echo "成果物は作業ツリーに残っている可能性があります。git diff と lint / test で直接検証して引き取りを判断してください。"
        exit 2
      fi
    fi
  fi

  sleep "$INTERVAL"
  fetch_status
  resolve_log_path
done
