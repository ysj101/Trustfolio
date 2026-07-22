# 依存関係更新戦略

## 概要

本ドキュメントは、Trustfolio GASプロジェクトにおける依存関係のバージョンアップ戦略を定義します。特にメジャーバージョンアップにおいて、問題の特定と解決を容易にするための段階的なアプローチを採用します。

## 基本方針

### メジャーバージョンアップは段階的に実施

メジャーバージョンを複数跨いで一気に上げると、問題が発生した際に原因の切り分けが困難になります。

**悪い例:**
```
v2.0.0 → v4.0.0 に直接アップグレード
```
問題が発生した場合、v3.0.0での変更とv4.0.0での変更のどちらが原因か特定しづらい。

**良い例:**
```
v2.0.0 → v3.0.0 → v4.0.0 と段階的にアップグレード
```
各バージョンで動作確認を行うことで、問題の原因を特定しやすくなる。

### Dependabotによる自動化

- **patchバージョン**: Dependabotが自動的にPRを作成し、CIが成功すれば自動マージ（[dependabot-auto-merge.yml](../.github/workflows/dependabot-auto-merge.yml)）
- **minorバージョン**: Dependabotが自動的にPRを作成（手動でレビュー・マージ）
- **majorバージョン**: 手動で段階的にアップグレードを実施

依存関係の正本は `pnpm-lock.yaml` です。開発者は `npm` を使わず、`pnpm` と `package.json` の `packageManager` / `engines` に従って作業します。

#### 自動マージの条件

パッチバージョンの更新は以下の条件を満たすと自動的にマージされます：

1. Dependabotが作成したPRであること
2. パッチバージョン（`x.y.z`の`z`部分）の更新であること
3. Lint（ESLint）が成功すること
4. Test（Vitest）が成功すること

これにより、セキュリティパッチやバグフィックスが迅速に適用されます。

## メジャーバージョンアップ手順

### 1. 事前準備

- [ ] 現在のバージョンから目標バージョンまでの間にあるメジャーバージョンをリストアップ
- [ ] 各バージョンのCHANGELOGまたはリリースノートを確認
- [ ] 破壊的変更(Breaking Changes)の内容を把握

### 2. ローカル環境での段階的アップグレード

**2.1. 最初のメジャーバージョンにアップグレード**

```bash
# 例: @google/clasp v2 → v3 へのアップグレード
pnpm add @google/clasp@3
```

**2.2. ビルドとテストの実行**

```bash
# ビルドが成功するか確認
pnpm build

# テストが通過するか確認
pnpm test
```

**2.3. GASへのデプロイと動作確認**

```bash
# ステージング環境へデプロイ（存在する場合）
pnpm push

# または本番環境へデプロイ
pnpm push
```

**2.4. 主要機能の動作確認チェックリスト**

- [ ] スプレッドシートの基本操作が正常に動作する
- [ ] トリガー設定が正常に動作する
- [ ] データ取得・更新処理が正常に動作する
- [ ] エラーハンドリングが正常に動作する
- [ ] ログ出力が正常に動作する

**2.5. 問題がなければコミット**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: upgrade [package-name] from vX to vY"
```

**2.6. 次のメジャーバージョンがある場合は2.1に戻る**

### 3. 問題が発生した場合のロールバック手順

**3.1. 即座にロールバック**

```bash
# 直前のコミットへ作業ツリーを戻す
git checkout HEAD~1 -- package.json pnpm-lock.yaml

# 依存関係を再インストール
pnpm install --frozen-lockfile

# ビルド
pnpm build

# GASへ再デプロイ
pnpm push
```

**3.2. 問題の調査**

- エラーログの確認
- CHANGELOGで破壊的変更の再確認
- 必要に応じてissueを作成し、問題を記録

**3.3. 修正と再試行**

- コードの修正が必要な場合は修正を実施
- 再度手順2から実施

### 4. マージとデプロイ

- [ ] PRを作成
- [ ] レビュー（必要に応じて）
- [ ] mainブランチにマージ
- [ ] 本番環境での動作確認

## テスト戦略

### ローカルテスト

1. **TypeScriptの型チェック**: `pnpm build`でコンパイルエラーがないか確認
2. **ユニットテスト**: `pnpm test`で既存のテストが通過するか確認
3. **Lintチェック**: `pnpm lint`でコードスタイルの問題がないか確認

### GAS環境でのテスト

1. **デプロイの成功**: `pnpm push`が正常に完了するか確認
2. **基本機能の動作確認**: スプレッドシートを開いて主要機能が動作するか手動確認
3. **トリガーの動作確認**: 定期実行トリガーが正常に動作するか確認
4. **エラー監視**: GASログを確認し、新しいエラーが発生していないか確認

## トラブルシューティング

### よくある問題と対処法

| 問題 | 原因 | 対処法 |
|------|------|--------|
| ビルドエラー | APIの破壊的変更 | CHANGELOGを確認し、該当するコードを修正 |
| 型エラー | 型定義の変更 | `@types/*`パッケージも併せてアップグレード |
| ランタイムエラー | メソッド名の変更 | 新しいAPIドキュメントを参照してコードを修正 |
| デプロイ失敗 | `@google/clasp`の互換性問題 | `.clasp.json`や`appsscript.json`の設定を確認 |

## peer 依存の明示的許容（peerDependencyRules）の記録

`package.json` の `pnpm.peerDependencyRules.allowedVersions` に設定した許容ルールは、暗黙のフォールバックを避けるため、必ず本セクションに判断理由を記録します。

### `@formatjs/intl@3.1.8>typescript: ^6.0.0 || ^7.0.0`（2026-07-23 追加）

- **経緯**: TypeScript を 5.9.3 → 6.0.3 へ更新した際（issue #175 Phase 1）、`@google/clasp@3.3.0` の推移的依存 `@formatjs/intl@3.1.8` が peerDependencies に `typescript: ^5.6.0`（optional）を宣言しているため、`pnpm install` で unmet peer 警告が発生した。
- **判断理由**:
  - `@formatjs/intl` の typescript peer は `peerDependenciesMeta` で optional 宣言されており、TypeScript は同パッケージの型定義利用時のみ関与する。clasp は `@formatjs/intl` を CLI メッセージの国際化（実行時処理）に使用しており、本リポジトリの `tsc --noEmit` 型チェック対象（`src/`）にも含まれない。
  - `@formatjs/intl` は 4.1.x で typescript peer 宣言自体を撤廃済みだが、clasp が依存するのは 3.1.8 であり、メジャーを跨ぐ強制上書き（pnpm overrides）は clasp の実行時動作を壊すリスクがあるため採用しない。
  - `@google/clasp` の最新は 3.3.0（2026-07-23 時点）であり、`@formatjs/intl` の typescript peer 警告を解消するリリース済みの `@google/clasp` バージョンは存在しない。したがって「clasp を更新して警告を解消する」という選択肢は存在しない。
- **許容範囲の限定**: 許容ルールの親セレクタは、判断根拠として検証済みの `@formatjs/intl@3.1.8` に限定している。将来 `@google/clasp` の更新で `@formatjs/intl` の別バージョンが導入され新たな peer 非互換が生じた場合、本ルールでは抑制されず警告が再び顕在化する（fail fast）。
- **解除条件**: `@google/clasp` を更新した際は、その時点の推移的依存（`@formatjs/intl` のバージョンと peer 宣言）を再評価し、typescript peer 警告が発生しなくなっていれば本ルールを削除する。警告が残る場合は、検証したバージョンへ限定を付け替えた上で本セクションを更新する。
- **レンジ拡張（2026-07-23、issue #175 Phase 2）**: TypeScript を 6.0.3 → 7.0.2 へ更新した際、許容レンジを `^6.0.0` から `^6.0.0 || ^7.0.0` へ拡張した。判断理由・許容範囲の限定・解除条件は上記のとおり変わらない（TypeScript 7 でも `@formatjs/intl@3.1.8` の optional peer 宣言は `^5.6.0` のままであることを確認済み）。

## TypeScript 7（ネイティブ実装）と JS API の併存の記録

### エイリアス devDependency `typescript-js-api`（2026-07-23 追加、issue #175 Phase 2）

- **経緯**: TypeScript を 6.0.3 → 7.0.2（ネイティブ実装、通称 tsgo）へ更新した際、`typescript@7` の npm パッケージが従来の JS コンパイラ API（`ts.sys`・`ts.createSourceFile`・`ts.resolveModuleName` 等）を同梱しなくなっていることが判明した（パッケージのエクスポートは `version` と、明示的に不安定な `typescript/unstable/*` のみ）。本リポジトリでは `scripts/check-architecture.mjs` と `scripts/check-typescript-rules.mjs`（いずれも `pnpm lint` の構成要素）がこの JS API に依存しており、TS 7 単独では `pnpm lint` が失敗する。
- **対応**: `package.json` の devDependencies にエイリアス `"typescript-js-api": "npm:typescript@^6.0.3"` を追加し、上記2スクリプトの import を `typescript` から `typescript-js-api` へ変更した。型チェック（`pnpm typecheck` = `tsc --noEmit`）はネイティブ実装の `typescript@7` を使用する。
- **判断理由**:
  - TypeScript 7 の `typescript/unstable/*` API は名前のとおり不安定と明言されており、lint 基盤をそこへ移行するのは時期尚早である。
  - TypeScript 6 系は JS 実装ベースの最終系として API 利用者向けに提供され続けており、2スクリプトが使う API（tsconfig 解析・ソース解析・モジュール解決）は安定している。
  - エイリアス併存は devDependencies のみに閉じ、GAS へのビルド成果物・実行時挙動には一切影響しない。
- **解除条件**: TypeScript 本体が安定版の JS API（`unstable` プレフィックスの外れた API）を提供し、2スクリプトをそれへ移行した時点で `typescript-js-api` を削除する。もしくは2スクリプトを TS コンパイラ非依存の実装（oxc 等）へ置き換えた時点で削除する。

## 参考資料

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Dependabot documentation](https://docs.github.com/en/code-security/dependabot)

## 履歴

- 2026-01-16: 初版作成
- 2026-07-23: TypeScript 5.9 → 6.0 更新（issue #175 Phase 1）に伴い、peer 依存の明示的許容の記録セクションを追加
- 2026-07-23: TypeScript 6.0 → 7.0 更新（issue #175 Phase 2）に伴い、許容レンジを拡張し、エイリアス devDependency `typescript-js-api` の記録セクションを追加。型チェック（`tsc --noEmit -p tsconfig.build.json` を pnpm を介さず直接実行、同一マシン・ウォーム状態・連続3回計測の実測レンジ）は TS 6.0.3（JS 実装）の約0.47〜0.49秒から TS 7.0.2（ネイティブ実装）の約0.08秒へ短縮（約6倍高速化）
