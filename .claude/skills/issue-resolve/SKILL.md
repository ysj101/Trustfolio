---
name: issue-resolve
description: "GitHub issue を起点に「実装 → 品質ゲート(/code-review・/security-review・/simplify) → Codexレビュー収束 → PR作成 → CI緑＋Claude botコメント解消の確認 → squashマージ → GASデプロイ(pnpm push)」までを一気通貫で実行する。引数に issue 番号を渡して使う。キーワード: issue対応, issue resolve, issue対応スキル, PRまで自動, デプロイまで自動."
---

# issue対応フロー

GitHub issue 1件を、実装からマージ完了まで以下の確定フローで処理する。各工程は**前工程の完了を確認してから**次へ進む（推測で先行しない）。

## 入力

- **必須**: 対応対象の issue 番号（例: `/issue-resolve 113`）。
  - 番号が渡されていない場合は**作業を開始せず**、ユーザーに issue 番号を確認する。

## リポジトリ前提（このリポジトリの実態。確認済み事実）

- マージ方式: **squash のみ許可**（merge commit / rebase は不許可）。マージ時に**ブランチ自動削除**。
- 既定ブランチ: `main`。
- PR には GitHub Actions の `claude-code-review.yml` により **`claude` bot がレビューコメントを1件投稿**する（`opened` / `synchronize` 時に発火）。
- CI ワークフロー: `lint.yml` / `test.yml` / `security.yml` / `claude-code-review.yml`。
- **ブランチ保護（必須ステータスチェック）は無料プランのため利用不可**。
  - このため GitHub の `gh pr merge --auto` は「チェック合格待ち」が機能せず**即マージ**になる。
  - したがって本スキルは `--auto` を**使わず**、スキル自身が「CI緑」「Claude botコメント解消」を確認してから明示的にマージする。
- Edit/Write 後に `pnpm lint` が PostToolUse フックで自動実行される（lint エラーは即時検出される）。

## 全体フロー

```
[0 issue取得] → [1 ブランチ作成] → [2 実装] → [3 品質ゲート] → [4 Codexレビュー]
→ [5 コミット&PR作成] → [6 CI+Claude botコメント解消ループ] → [7 マージ] → [8 デプロイ] → [9 レポート]
```

---

## 0. issue取得

```bash
gh issue view <issue番号> --json number,title,body,labels,comments
```

- 本文・コメント・ラベルを読み、**対応内容（受け入れ条件）を箇条書きで言語化**してから着手する。
- 不明点・仕様の曖昧さがあれば、実装前にユーザーへ確認する（曖昧なまま実装しない）。

## 1. ブランチ作成

`main` を最新化してから新規ブランチを切る（worktree は使わず通常ブランチ）。

```bash
git switch main && git pull --ff-only
git switch -c <type>/<slug>
```

- `<type>`: issue ラベル・内容から `feat` / `fix` / `refactor` / `chore` / `docs` / `test` のいずれかを選ぶ。
- `<slug>`: 内容を表す英小文字ケバブケース（既存例: `refactor/g5-scripts-render-factory`）。
- issue 番号は PR タイトル・本文で参照する（ブランチ名には必須ではない）。

## 2. 実装

- issue の受け入れ条件を満たす最小の変更を実装する。
- CLAUDE.md の原則（実コード・実データ優先 / fail fast / 暗黙フォールバック禁止 / 日本語TSDoc・コメント）を厳守する。
- Edit/Write のたびに lint フックが走る。**lint エラーは必ずその場で解消**してから次へ進む。
- テストが存在する範囲では実行し、緑を確認する（`pnpm test` 等、リポジトリの実コマンドに従う）。

### Codex への委譲時のハング対策（確認済み事実に基づく）

グローバル CLAUDE.md の方針に従い実装を Codex（codex-rescue）へ委譲する場合、以下を必ず行う。

> **背景（2026-08-09 の issue #20 対応で確認済みの実例）**: codex-rescue ジョブは、ランタイム側が異常終了するとジョブ台帳が「running / verifying」のまま残り、完了通知も来ないことがある（実例では最終検証コマンド `pnpm lint && pnpm test` の実行中にプロセスが消滅し、ログ無更新のまま 80 分以上「running」表示が継続した）。一方、**成果物（作業ツリーの差分）は完成していた**ため、ハング＝作業喪失ではない。

1. **予防（委譲の仕方）**:
   - 委譲プロンプトの完了条件を「変更の適用まで」とし、**最終検証（`pnpm lint && pnpm test`）は委譲に含めず Claude 側で実行する**（ハングは長時間の検証コマンド実行中に起きやすく、検証を外せばハングしても失うものがほぼない）。
   - 大きな変更（目安: 20 ファイル超）は層ごと（domain+repository → usecase+api → ui+テスト）に分割して委譲する。
2. **検知（ウォッチドッグ）**: 委譲直後に `scripts/codex-watch.sh`（リポジトリ内。同一内容のグローバル版が `~/.claude/scripts/codex-watch.sh` にもある）を Bash ツールの `run_in_background: true` で起動する:
   ```bash
   ./scripts/codex-watch.sh <job-id> --stale-min 15 --cancel
   ```
   - exit 0 = ジョブ完了（`result` で結果取得へ）。exit 2 = ハング判定（status が running のままログ mtime が 15 分無更新。`--cancel` によりキャンセル済み）。
   - 単純なタイムアウトと異なり、ログが更新され続ける限り待つため、時間がかかっているだけの正常ジョブを誤検知しない。
3. **引き取り（ハング検知後の復旧手順）**: 推測で再委譲せず、この順で確認する。
   1. ジョブログ末尾で進捗を確認する（ウォッチドッグが tail を自動表示する）。
   2. `git diff --stat` で作業ツリーの成果物の有無を確認する。
   3. `pnpm lint && pnpm test` を Claude 側で直接実行し、緑なら成果物を引き取って工程3へ進む。
   4. 成果物が不完全な場合のみ、残作業を明示して再委譲する。

## 3. 品質ゲート（/code-review → /security-review → /simplify）

以下を**この順で**実行する。**全指摘を自動修正**する方針（severity を問わず、可能な限り修正してから次工程へ）。

> 工程3 は PR 作成前の**ローカル作業差分**に対するゲート。PR を前提とする `/review` ではなく、ローカル diff を対象に correctness バグを検出できる `/code-review` を用いる。

1. **`/code-review high`** — ローカル作業差分の correctness バグ＋再利用・簡素化・効率の検出。指摘は全て修正する（必要に応じ `--fix` で適用）。
2. **`/security-review`** — 現ブランチの保留変更に対するセキュリティレビュー。指摘は全て修正する。
3. **`/simplify`** — 再利用・簡素化・効率・粒度の整理を適用する（`/code-review` と重なるが、`simplify` は品質のみで残りの整理を担う）。

各ゲートで修正を加えたら、lint・テストを再確認する。修正により別の指摘が生まれ得るため、**前ゲートで修正が入った場合は当該ゲートを再実行**して指摘がなくなるまで収束させる（最大3周。収束しない残件はレポートに明記してユーザー判断を仰ぐ）。

## 4. Codexレビュー（収束ゲート）

`codex-review` スキルを呼び出し、`ok: true` になるまで「Codexレビュー → 修正 → 再レビュー」を反復する。

- 既定の `max_iters` は 5。
- Codex の blocking 指摘は全て修正する。advisory はレポートに記載する。
- Codex 実行中は完了を待ち、次工程へ進まない（推測での中断禁止）。

## 5. コミット & PR作成

1. 変更をコミットする。コミットメッセージ末尾に必ず付与する:
   ```
   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   ```
2. プッシュする: `git push -u origin <branch>`
3. PR を作成する（squash マージ前提）:
   ```bash
   gh pr create --base main --title "<type>(...): <要約> (#<issue番号>)" --body-file <本文ファイル>
   ```
   - 本文は Write ツールでファイルに書き出してから `--body-file` で渡す（バッククォート・改行の崩れ防止）。
   - 本文には `Closes #<issue番号>` を含め、issue と紐づける。
   - 本文末尾に付与する:
     ```
     🤖 Generated with [Claude Code](https://claude.com/claude-code)
     ```

## 6. CI ＋ Claude botコメント解消ループ

PR 作成（および以降の各 push）後、**CI 完了と Claude bot コメントの解消を確認**する。GitHub の自動マージは使わない。

各ラウンドで以下を行う:

1. **CI 完了待ち**:

   > **環境注意（確認済み事実）**: 本リポジトリの実行環境は macOS で、`timeout` コマンドは存在せず、coreutils の `gtimeout` も未インストールである。したがって `timeout 1200 ...` 形式での実時間上限の強制は**使えない**（`zsh: command not found: timeout` で即失敗する）。実時間上限が必要な待機は、`timeout` に頼らず**バックグラウンド実行＋完了通知**で行う。

   `gh pr checks --watch --fail-fast` は全チェック完了時（または `--fail-fast` で失敗時）に自分で終了するため、これを**バックグラウンド実行**し、ハーネスの完了通知を待つ:
   ```bash
   # 【実行方法】Claude Code の Bash ツール呼び出し時に run_in_background: true を
   #   指定して起動する（コマンド末尾に & を付ける方式ではない）。--watch は完了/失敗で
   #   自走終了するため timeout コマンドは不要。終了時にハーネスから完了通知が届く。
   # 【失敗パス】このコマンドは --fail-fast によりチェック失敗時に非ゼロ終了する。
   #   非ゼロ終了を検知したら原因を調査し、修正→push して本ラウンドをやり直す。
   #   完了通知が約20分以内に届かない場合はハングを疑い、--watch 無しで状態確認する。
   gh pr checks <PR番号> --watch --interval 30 --fail-fast
   ```
   - `claude-review` ジョブを含む全チェックの完了を待つ。
   - 完了通知が**約20分以内に届かない**場合は、ハングを疑い `gh pr checks <PR番号>`（--watch 無し）で現在状態を一度確認する。なお未完了が続くなら待機を打ち切り、ユーザーに状況を報告する（推測で次工程へ進まない）。
   - 失敗チェックがあれば原因を修正し、コミット→push して本ラウンドをやり直す。
2. **Claude bot コメント取得**:
   ```bash
   gh pr view <PR番号> --json comments \
     --jq '.comments[] | select(.author.login=="claude") | .body'
   ```
   - **最新の** `claude` レビューコメントを読む。
3. **指摘対応**:
   - コメントに対応可能な指摘（バグ・改善提案等）があれば、**全指摘を自動修正**する。
   - 修正をコミット→push する（`synchronize` で Claude review が再発火し、新しいコメントが付く）。
   - push したら **1 に戻る**（次ラウンド）。
4. **収束判定**:
   - 最新 Claude コメントに対応すべき指摘がなく、かつ全 CI チェックが緑なら、本ループを抜ける。
   - 無限ループ防止のため最大反復は 5。到達時はユーザーに残件を提示して判断を仰ぐ。

> 補足: このリポジトリでは Claude review は「必須チェック」ではなくコメント投稿のみだが、本スキルは**マージ前に必ずこのコメントを取得・解消する**ことで、ユーザー懸念（指摘確認前のマージ）を構造的に防ぐ。

## 7. マージ

**6 の収束を確認した後にのみ**実行する。

```bash
gh pr merge <PR番号> --squash --delete-branch
```

- 前提（このいずれかが欠けていればマージしない）:
  - 全 CI チェックが緑である。
  - 最新の Claude bot コメントの指摘が全て解消（または対応不要と判断しレポートに記録）されている。
- マージ後はリポジトリ設定によりリモートブランチが自動削除される。**ローカルブランチの削除確認まで完了して初めて工程7完了とする**（レポート提出前に必ず実施する）。

**マージ後のローカル後処理（必須。以下すべて 2026-07-27 の PR #192 対応で確認済みの事実に基づく手順）**

> **環境注意（確認済み事実）**:
> - `gh pr merge --squash --delete-branch` は「リモートでのマージ → リモートブランチ削除 → `git switch main` → **ローカルブランチ削除** → `git pull`」の順で動く。この環境は `pull.rebase` が有効なため、作業ツリーに未ステージ変更（例: ユーザーの `.claude/settings.json` ローカル変更）があると**最後の `git pull` だけが `cannot pull with rebase: You have unstaged changes` で失敗する**。この時点でマージ・リモートブランチ削除・ローカルブランチ削除は完了済みであり、未完了なのは「ローカル main の更新」と「リモート追跡参照の掃除」のみである。エラーメッセージだけを見て「マージ失敗」「ブランチ削除失敗」と誤認しない。
> - 同じ理由で `git pull --ff-only` も失敗する。**`git -c pull.rebase=false pull --ff-only origin main` なら未ステージ変更があっても ff 更新できる**（ff マージは変更ファイルと衝突しない限りクリーンな作業ツリーを要求しない）。

1. マージの成否をローカル後処理のエラーと切り分けて確認する:
   ```bash
   gh pr view <PR番号> --json state,mergedAt,mergeCommit
   ```
   - `state: MERGED` ならマージは成功している。手順2へ進む。
   - `state` が `MERGED` 以外（`OPEN` / `CLOSED`）の場合はマージ自体が失敗している。以降の後処理を行わず、エラー出力とチェック状態を添えてユーザーに報告して停止する（推測で進めない）。
2. ローカル main をマージコミットまで更新し、削除済みリモートブランチの追跡参照を掃除する:
   ```bash
   git -c pull.rebase=false pull --ff-only origin main
   git fetch --prune origin
   ```
3. ローカルブランチの削除を**確認**する（通常は手動削除は不要）:
   ```bash
   git branch --list <branch>
   ```
   - 出力が空なら、`gh pr merge --delete-branch` がローカルブランチ削除まで完了している（確認済み事実: `git pull` 失敗時でもローカルブランチ削除自体は完了していた）。これで工程7完了。
   - 出力にブランチが残っている場合のみ手動で削除する。**このリポジトリは squash マージのみのため、ブランチ先端コミットは main の祖先にならず、`git branch -d` は「not fully merged」で失敗するのが正常な git の挙動である**。手順1で `state: MERGED` を外部確認済みであることを根拠に `git branch -D <branch>` を用いてよい（手順1の `MERGED` 確認なしに `-D` を使うことは禁止）。
   - **権限分類器による拒否時の対処（確認済み事実）**: auto モードの権限分類器が `git branch -d` / `-D` を拒否することがある。拒否された場合は回避策を試みず、工程9のレポートの「未解決・要判断事項」に削除コマンドと手順1の確認結果をそのまま記載してユーザーに実行を依頼する。恒久対応としては、ユーザーが settings の permissions に allow ルールを追加すれば以後は自動実行できる旨を併記する。

> マージは不可逆操作だが、ユーザーは「auto-merge 希望（ただし Claude 指摘確認前のマージは避けたい）」と合意済みのため、本スキルは 6 の解消確認を満たした時点で**確認を挟まず自動でマージ**する。6 が収束しない／CI が緑にならない場合はマージせずユーザーに報告する。

## 8. デプロイ（GAS への反映）

**工程7（マージとローカル後処理）の完了を確認した後にのみ**実行する。

> このリポジトリのデプロイ手段は `pnpm push` のみである（確認済み事実: package.json の `push` スクリプト = `pnpm lint && pnpm build && clasp push --force`。`clasp deploy` 等の別手段は定義されていない）。`pnpm push` は**作業ツリーの src からビルドした dist を GAS プロジェクトへ反映する**ため、必ずマージコミット上で実行する。

1. デプロイ対象がマージコミットであることを確認する:
   ```bash
   git log --oneline -1
   gh pr view <PR番号> --json mergeCommit --jq .mergeCommit.oid
   ```
   - 2つの出力（ローカル HEAD とマージコミット `mergeCommit.oid` の先頭）が一致しなければデプロイせず、工程7の後処理からやり直す。比較対象はセッション内の記憶に頼らず、上記コマンドでその場で再取得する。
2. デプロイを実行する:
   ```bash
   pnpm push
   ```
   - 成功判定: clasp の `Pushed <N> files at <時刻>` 出力を確認する（2026-07-27 の PR #192 対応では 8 ファイルが反映された）。
   - ビルド時の「caniuse-lite is outdated」警告は無害であり、デプロイ結果に影響しない（確認済み事実）。対処する場合は `npx update-browserslist-db@latest` をユーザーに案内する。
   - 失敗時（lint・ビルド・clasp のいずれかが非ゼロ終了）: 出力を添えてユーザーに報告して停止する。clasp の認証エラー等を推測で修復しない（`clasp login` や `pnpm setup:clasp` の実行はユーザー判断に委ねる）。

## 9. レポート（日本語・主語省略禁止）

最後に以下を日本語で報告する:

- 対応 issue: `#<番号> <タイトル>`、満たした受け入れ条件
- 作成 PR: `#<番号>`、マージ可否と結果
- 品質ゲート: `/code-review` `/security-review` `/simplify` の各指摘件数と対応
- Codex レビュー: 反復回数・最終ステータス・advisory
- Claude bot コメント解消ループ: ラウンド数・対応した指摘
- CI: 各チェックの最終結果
- デプロイ: `pnpm push` の実行結果（反映ファイル数・時刻、または失敗時の状況）
- 未解決・要判断事項（あれば。なければ「なし」と明記）

最後に高所からの要約セクションを置く。

---

## 停止・確認ポイント（推測で進めない）

以下では**作業を止めてユーザーに確認**する:

- issue 番号が未指定。
- issue の受け入れ条件に曖昧さがある。
- 品質ゲート / Codex / Claude bot の指摘が**仕様変更を伴う**、または自動修正で収束しない。
- CI が修正しても緑にならない。
- マージ前提条件（CI緑・Claude指摘解消）が満たせない。
- デプロイ（`pnpm push`）が失敗した（lint・ビルド・clasp のいずれの失敗でも、推測で修復せず報告する）。
