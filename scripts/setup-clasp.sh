#!/bin/bash
# .env から環境変数を読み込み、.clasp.json を生成するスクリプト

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# .env ファイルを読み込む
if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
else
  echo "エラー: .env ファイルが見つかりません。"
  echo ".env.example をコピーして .env を作成し、値を設定してください。"
  exit 1
fi

# GAS_SCRIPT_ID が設定されているか確認
if [ -z "$GAS_SCRIPT_ID" ]; then
  echo "エラー: GAS_SCRIPT_ID が .env に設定されていません。"
  exit 1
fi

# .clasp.json を生成
cat > "$PROJECT_ROOT/.clasp.json" << EOF
{"scriptId":"${GAS_SCRIPT_ID}","rootDir":"./dist"}
EOF

echo ".clasp.json を生成しました。"
