# Vite+ 全面移行計画

## Context（背景・目的）

本計画は、Trustfolio（`trustfolio-gas`）の開発ツールチェーンを [Vite+（vp）](https://viteplus.dev/) へ全面移行するためのものです。

### なぜ移行するのか

Vite+ は VoidZero が提供する統合ツールチェーン CLI で、ビルド（Vite 8 / Rolldown）・テスト（Vitest）・lint（Oxlint）・フォーマット（Oxfmt）・型チェック（tsgo）を単一の `vp` コマンドへ集約します。

本プロジェクトは**すでに VoidZero スタックの大半を個別採用済み**です。

- Oxlint 1.65.0（`package.json:39`）— Vite+ 同梱
- Vitest 4.1.6（`package.json:43`）— Vite+ 同梱
- Rollup 4.60（`package.json:40`）— Vite 8 の採用するバンドラ Rolldown の前身

非 VoidZero のツールは Biome（フォーマッタのみ）・Tailwind CSS・clasp のみです。したがって本移行は「ばらばらに採用済みのツール群を `vp` という単一インターフェースへ統一し、唯一の異物である Biome を Oxfmt へ置き換える」作業が本質であり、リスクは局所的です。

### 意図する成果

- ビルド・テスト・lint・フォーマット・型チェックを `vp` 1コマンドへ統一し、開発者体験を簡素化する。
- 型チェックを明示ステップとして独立させ、現状の暗黙的な型検証（後述）の欠陥を是正する。
- Rust 製ツール（Rolldown / Oxfmt）採用によるビルド・整形の高速化。

## 前提（重要 — 必読）

本プロジェクトは **Google Apps Script（GAS）プロジェクト**です。Vite+ の目玉である `vp dev`（HMR 付き開発サーバー）/ ブラウザ向け `vp build` は、GAS には `index.html` エントリも開発サーバーも存在しないため**そのままでは適合しません**。本移行では Vite を**ライブラリモード**で用い、現行 Rollup と同じ IIFE バンドル（`dist/Code.js`）を生成します。

### 確定した方針（ユーザー回答済み）

| 論点 | 決定 |
| --- | --- |
| 移行範囲 | **全面移行** — GAS バンドル（`dist/Code.js`）生成も Rollup → Vite ライブラリモードへ移行 |
| フォーマッタ | **Oxfmt に置換** — Biome を全廃 |
| 展開先 | **ローカルのみ・CI 据え置き** — GitHub Actions の YAML（`lint.yml` / `test.yml`）に `vp` バイナリを導入しない |

### アーキテクチャ方針：`vp` と `pnpm` scripts の併存

「CI 据え置き」を満たすため、以下の二層構成とします。

- **`package.json` の scripts** は npm 解決可能なバイナリ（`vite` / `oxlint` / `oxfmt` / `vitest` / `tsc`）を直接呼ぶ。CI（`pnpm lint` / `pnpm format:check` / `pnpm test`）は `vp` バイナリ無しで従来どおり動作する。
- **`vp` コマンド**（`vp build` / `vp check` / `vp test`）はローカル開発者の統一 UX として併存。これらは scripts と**同一の設定ファイル**（`vite.config.ts` / `vitest.config.ts` / Oxlint・Oxfmt 設定）を読むため、両経路の結果は一致する。

> 注：フォーマッタ変更（Biome → Oxfmt）に伴い、CI の `pnpm format:check` は `oxfmt` を呼ぶようになります。`oxfmt` は **npm 単体パッケージとして配布済み**（[npmjs.com/package/oxfmt](https://www.npmjs.com/package/oxfmt)）のため、`vp` バイナリ無しで CI でも実行可能です。Oxfmt は現在 beta 版であり、バージョンを固定して管理します。

## 現状の把握（移行の起点）

| 項目 | 現状ファイル | 移行後 |
| --- | --- | --- |
| バンドル | `rollup.config.js`（IIFE `dist/Code.js`、GAS グローバル関数 `footer`、UI/マニフェストコピープラグイン） | `vite.config.ts`（ライブラリモード IIFE） |
| 型チェック | **暗黙的** — `@rollup/plugin-typescript`（`rollup.config.js:119-121`）がビルド時に型検証 | **明示ステップ化**（後述・要是正） |
| lint | `oxlint`（`package.json:19`）+ 独自スクリプト2本 | Oxlint 維持（独自スクリプトも維持） |
| フォーマット | `biome format`（`package.json:23-24`、`biome.json`） | `oxfmt` |
| テスト | `vitest`（`package.json:25`、`vitest.config.ts`） | Vitest 維持 |
| CSS | `scripts/build-styles.sh`（Tailwind CLI → `dist/styles.html` へインライン） | **据え置き**（GAS 固有処理、Vite+ の対象外） |
| デプロイ | `clasp push --force`（`package.json:14`） | 据え置き |

### 是正が必要な既存の欠陥：型チェックが暗黙的

現状、独立した型チェック（`tsc --noEmit`）は存在しません。型エラーは `@rollup/plugin-typescript` によりビルド時にのみ検出されます（`scripts/check-typescript-rules.mjs` は独自ルール検査であり全体の型検査ではありません）。

Vite はトランスパイル時に**型を剥がすのみで型検査を行いません**。Rollup を廃止すると、この暗黙の型検証が失われます。本移行では型チェックを**明示的な独立ステップ**として復元します（CLAUDE.md の「Fail fast」原則に合致）。

## 移行ステップ

### Step 0：事前検証（実装前の必須確認）

実装着手前に以下をローカルで検証し、想定外の非互換を早期に潰します。

1. **Oxfmt の対象ファイル種別**：`oxfmt` は JS/TS/JSON を整形対象とする。現状 Biome は `src/ui/**/*.html` と `src/ui/**/*.css` も整形対象（`biome.json:11-12`）。Oxfmt が HTML/CSS を整形対象としない場合、これらは整形対象外とする（`styles.html` はプレースホルダ、`input.css` は Tailwind ディレクティブ＋フォント import の3行のみで実害は小さい）。`npx oxfmt@latest --help` で対応拡張子を確認する。
2. **Vite ライブラリモードでの IIFE 出力**：最小構成の `vite.config.ts`（`build.lib` + `formats: ['iife']` + `output.footer`）で `dist/Code.js` を生成し、IIFE 形式・グローバル名 `TrustfolioApp`・`footer` が現行と等価に出力されることを確認する。

### Step 1：Vite+（vp）の導入

- グローバル `vp` をインストール：`curl -fsSL https://vite.plus | bash`（インストール後 `vp help` で確認）。
- プロジェクトローカル版 `vite-plus` を devDependency として追加（バージョン固定）。
- `vp` はローカル開発者向け。CI には導入しない。

### Step 2：ビルド移行（`rollup.config.js` → `vite.config.ts`）

新規 `vite.config.ts` を作成し、`rollup.config.js` の全機能を移植します。

- **入力・出力**：`build.lib = { entry: 'src/main.ts', formats: ['iife'], name: 'TrustfolioApp', fileName: () => 'Code.js' }`。`build.outDir = 'dist'`。
- **footer**：`rollup.config.js:5-60` の `footer` 定数（`doGet` / `doPost` / `onOpen` / 各トリガー約20関数のグローバルトランポリン）を `build.rollupOptions.output.footer` へ**そのまま移植**。GAS から名前で呼ばれる契約のため、一字一句変更しない。
- **UI / マニフェストコピー**：`rollup.config.js:62-108` の `copyUiFiles()` / `copyManifest()` / `copyDirectory()` を Vite プラグインへ移植。Vite プラグインは Rollup プラグイン互換のため `copyDirectory` ヘルパはそのまま再利用可。ただし Vite はビルド前に `dist/` を空にする（`emptyOutDir`）ため、コピー処理は `closeBundle` フック（Vite が `dist/Code.js` を書き出した後）で実行し、順序事故を防ぐ。
- **型チェック非依存化**：`@rollup/plugin-typescript` は使わない（Vite が esbuild/oxc でトランスパイル）。型検査は Step 4 で独立ステップ化する。
- **minify**：移行直後の diff レビュー容易性のため `build.minify = false` とし、現行 Rollup（非 minify）の挙動を踏襲する。
- `pnpm build:js` を `rollup -c` から `vite build` へ変更。`vp build` でも同一の `vite.config.ts` で実行可能。

### Step 3：フォーマッタ移行（Biome → Oxfmt）

- devDependency に `oxfmt`（バージョン固定）を追加、`@biomejs/biome` を削除。
- `biome.json` を削除し、Oxfmt 設定ファイル（`oxfmt.json` 等）を新規作成。現行 Biome スタイル（`biome.json`：インデント2 / 行幅100 / LF / シングルクォート / セミコロン必須 / 末尾カンマ es5）へ可能な限り合わせ、再整形 diff を最小化する。
- `package.json` の `format` / `format:check` を `oxfmt` / `oxfmt --check` へ変更。
- **初回再整形の大規模 diff に注意**：Oxfmt と Biome は整形ルールが完全一致しないため、全 TS/JS/JSON ファイルに差分が出る。この再整形は**機能変更コミットと分離した独立コミット**として実施し、レビュー可能性を保つ。
- `vp check` はこの Oxfmt 設定を読み、lint・フォーマット・型チェックを統合実行する。

### Step 4：型チェックの明示ステップ化（欠陥是正）

Step 2 で失われる型検証を独立ステップとして復元します。

- `package.json` に `typecheck` スクリプトを追加：`tsc --noEmit -p tsconfig.build.json`（`typescript` は既存 devDependency、`tsconfig.build.json` は既存）。
- CI の YAML を変更せずに型エラーを検出させるため、`typecheck` を既存 `lint` スクリプトチェーン（`package.json:17`）の末尾へ連結する。これにより CI の `pnpm lint` ステップが型チェックも実行する（YAML 据え置きを満たす）。
- ローカルでは `vp check` が tsgo（TypeScript ネイティブ実装）で同等の型チェックを高速実行する。

### Step 5：lint / test の vp 化

- **lint**：Oxlint は Vite+ 同梱だが、`package.json:19` の `lint:oxlint` は npm の `oxlint` を直接呼ぶ形を維持（CI 互換）。独自スクリプト `scripts/check-architecture.mjs` / `scripts/check-typescript-rules.mjs` は Vite+ と無関係のため**そのまま維持**。ローカルでは `vp check` が Oxlint 部分を担う。
- **test**：`vitest.config.ts` は変更不要（`fileParallelism: false` 等の GAS/ネイティブモジュール対応設定を維持）。`pnpm test` は `vitest` を直接呼ぶ形を維持。ローカルでは `vp test` が同一設定で実行可能。

### Step 6：`package.json` scripts / lint-staged / husky 更新

| 対象 | 変更内容 |
| --- | --- |
| `build:js` | `rollup -c` → `vite build` |
| `format` / `format:check` | `biome format` → `oxfmt` / `oxfmt --check` |
| `typecheck`（新規） | `tsc --noEmit -p tsconfig.build.json` |
| `lint` | 末尾に `pnpm typecheck` を連結 |
| `lint:oxlint` ほか | `rollup.config.js` を対象から外し `vite.config.ts` を追加 |
| lint-staged（`package.json:45-59`） | `biome format --write` → `oxfmt`。`{vitest.config.ts,rollup.config.js}` グロブを `{vitest.config.ts,vite.config.ts}` へ変更 |
| `.husky/pre-commit` | `pnpm lint-staged` 実行のまま変更不要（中身の lint-staged 定義のみ更新） |

### Step 7：依存関係の整理

- **削除**：`rollup`、`@rollup/plugin-typescript`、`@biomejs/biome`。
- **追加**：`vite`（v8 系）、`vite-plus`、`oxfmt`。すべてバージョン固定。
- **pnpm overrides の更新**（`package.json:62-76`）：現状 `vite: 7.3.2` 固定（Vitest 4 の依存 Vite をセキュリティ目的でピン）。Vite 8 を直接 devDependency 化するため、この override をセキュアな Vite 8.x へ更新、または `vite` を直接依存にした上で override を見直す。`ignoredBuiltDependencies` の `esbuild` は Vite 8/Rolldown 採用後に不要化する可能性があるため、ビルド成功確認後に整理する。
- `pnpm install` 後、`pnpm-lock.yaml` を再生成しコミット。

### Step 8：CI 据え置きの確認

- `.github/workflows/lint.yml` / `test.yml` の YAML は**変更しない**。
- ただし `pnpm lint`（→ Step 4 で型チェック追加）・`pnpm format:check`（→ `oxfmt`）・`pnpm test` の実体が変わるため、CI が `vp` バイナリ無し・npm 解決バイナリのみで緑になることをブランチ push で実証する。

## 変更対象ファイル一覧

| ファイル | 操作 |
| --- | --- |
| `vite.config.ts` | 新規作成（`rollup.config.js` の全機能を移植） |
| `rollup.config.js` | 削除 |
| `oxfmt.json`（または同等の Oxfmt 設定） | 新規作成 |
| `biome.json` | 削除 |
| `package.json` | scripts / devDependencies / lint-staged / pnpm.overrides を更新 |
| `pnpm-lock.yaml` | 再生成 |
| `tsconfig.build.json` | 据え置き（`typecheck` から参照） |
| `vitest.config.ts` | 据え置き |
| `scripts/build-styles.sh` | 据え置き（GAS 固有の CSS インライン処理） |
| `.github/workflows/*.yml` | 据え置き |

## リスクと留意点

- **Vite+ は alpha 版**（2026年3月公開）。`vp` はローカル限定とし、CI・デプロイには npm 解決バイナリのみ使う構成でリスクを局所化する。
- **Oxfmt は beta 版**。CI の `format:check` が beta ツールに依存するため、バージョンを固定し、アップグレードは手動で管理する。
- **初回再整形の大規模 diff**：Step 3 で全 TS/JS/JSON が再整形される。機能変更と分離した独立コミットで実施する。
- **型チェックの欠落（移行中の一時的リスク）**：Step 2 完了から Step 4 完了までの間、型検証が無い状態が生じる。Step 2 と Step 4 は同一 PR・連続作業で実施し、間隙を残さない。
- **HTML/CSS の整形対象外化**：Oxfmt が HTML/CSS 非対応の場合、`src/ui/*.html` / `input.css` は整形対象から外れる（Step 0 で確認）。実害は小さいが、必要なら別ツール検討。
- **GAS グローバル関数契約**：`footer` の約20関数は GAS から名前で呼ばれる。移植時に関数名・シグネチャを一切変更しない。
- **Tailwind CSS は移行対象外**：`build-styles.sh` の「Tailwind CLI → `dist/styles.html` へ `<style>` インライン」は GAS 固有要件であり Vite+ は代替しない。据え置く。

## 検証手順（エンドツーエンド）

1. **`vp` 導入確認**：`vp help` / `vp --version` が動作する。
2. **ビルド検証**：`pnpm build` を実行し、`dist/` を確認する。
   - `dist/Code.js`：IIFE 形式、グローバル名 `TrustfolioApp`、`footer` の約20関数が末尾に存在。
   - `dist/Index.html` / `Performance.html` / `scripts.html` / `performance-scripts.html` がコピー済み。
   - `dist/appsscript.json` がコピー済み。
   - `dist/styles.html` に Tailwind CSS がインライン済み。
   - 移行前の `dist/Code.js`（Rollup 版）と新版を diff し、機能等価であることを確認する。
3. **`vp build` 経路確認**：`vp build` でも同一の `dist/` 成果物が生成されることを確認する。
4. **テスト**：`pnpm test --run` および `vp test` が全件緑。
5. **lint / format / typecheck**：`pnpm lint`（型チェック連結後）・`pnpm format:check`・`vp check` がいずれも緑。型エラーを意図的に1件埋め込み、`pnpm typecheck` が**失敗する**ことを確認（Fail fast の実証）。
6. **GAS デプロイ検証**：`clasp push --force` でテスト用デプロイへ反映し、Web アプリを開く。
   - `doGet` でポートフォリオ UI（`Index.html`）が描画される。
   - API リクエスト（`handleApiRequest` 経由）が応答する。
   - スタイル（インライン CSS）が適用されている。
7. **CI 検証**：本ブランチを push し、`lint.yml` / `test.yml` が `vp` 無しで緑になることを確認する。

## サマリー

本計画は、GAS プロジェクト Trustfolio の開発ツールチェーンを Vite+ へ**全面移行**するものです。要点は以下のとおりです。

- **本質はツール統合**：本プロジェクトはすでに Oxlint・Vitest・Rollup を採用済みで、Vite+ 移行は「既存 VoidZero スタックを `vp` へ統一し、唯一の異物 Biome を Oxfmt へ置換する」作業。
- **GAS 固有制約への対応**：`vp dev` / ブラウザ向け `vp build` は GAS に不適合。Vite を**ライブラリモード**で用い、現行 Rollup と等価の IIFE バンドル（`dist/Code.js`）を生成。`footer` の GAS グローバル関数・UI/マニフェストコピー・Tailwind CSS インライン処理はすべて移植または据え置く。
- **二層構成で CI を据え置き**：`package.json` scripts は npm 解決バイナリを直接呼び CI を `vp` 非依存に保つ。`vp` はローカル統一 UX として併存し、同一設定ファイルを共有。
- **既存欠陥の是正**：Rollup 廃止で失われる暗黙の型検証を、独立した `typecheck` ステップ（`tsc --noEmit`）として復元し `lint` チェーンへ連結。Fail fast 原則を強化。
- **主要リスク**：Vite+（alpha）・Oxfmt（beta）はバージョン固定で管理。初回再整形の大規模 diff は独立コミット化。型検証の間隙を残さないため Step 2–4 を連続実施。

---

## 実装結果（2026-05-22 / ブランチ `feat/vite-plus-migration`）

### 完了した作業

| 項目 | 結果 |
| --- | --- |
| ビルド移行 | `rollup.config.js` 削除 → `vite.config.ts` 新規作成（ライブラリモード IIFE）。`pnpm build` 成功。`dist/Code.js` は IIFE `var TrustfolioApp = (function(exports){...return exports;})({})`、GAS グローバル関数 18 個（footer）、export 18 個をすべて検証。 |
| フォーマッタ移行 | `@biomejs/biome` / `biome.json` 削除。`oxfmt@0.51.0` 追加、`oxfmt --migrate=biome` で `.oxfmtrc.json` 生成。`pnpm format` 適用済（`format:check` 通過）。整形対象は `src tests scripts vite.config.ts vitest.config.ts package.json` に明示限定（Oxfmt は Markdown/YAML も整形対象のため）。 |
| 型チェック | `typecheck`（`tsc --noEmit -p tsconfig.build.json`）を新規追加し `lint` チェーンに連結。`pnpm lint --quiet`（フック）対応のためチェーン末尾を引数耐性のある `lint:typescript-rules` に再配置。 |
| 依存整理 | `rollup` / `@rollup/plugin-typescript` / `@biomejs/biome` 削除。`vite@8.0.14` / `vite-plus@0.1.22` / `oxfmt@0.51.0` 追加。`pnpm.overrides.vite` を `8.0.14` へ更新。`esbuild`（Vite 8/Rolldown 採用で依存ツリーから消失）を `ignoredBuiltDependencies` から除去。 |
| 検証 | `pnpm build` / `pnpm test --run`（31 ファイル 207 テスト全通過）/ `pnpm lint` / `pnpm format:check` すべて green。`vp build` / `vp test` も動作確認済（`pnpm exec vp` 経由）。 |

### 計画からの差分・留意点

- **グローバル `vp` 未インストール**：`curl … | bash`（リモートスクリプトの直接実行）はセキュリティ上の自動承認で拒否された。代わりに `vite-plus@0.1.22` を devDependency として導入し、`pnpm exec vp` で `vp` を利用可能。開発者がグローバル `vp` を使う場合は公式インストーラを各自で実行する。
- **`vp check` は Node ≥22.18.0 が必要**：Vite+ が `.ts` 設定ファイルを読み込む際 Node `^20.19.0 || >=22.18.0` を要求する。実行環境は v22.14.0 のため `vp check` のみ失敗（`vp build` / `vp test` は v22.14.0 で動作）。このため `engines.node` を `>=22.18 <23` へ更新した。正準チェック経路（`pnpm lint` / `format:check` / `typecheck`）は v22.14.0 でも全て動作する。
- **`.bin` 衝突は単体パッケージ優先で解決**：`vite-plus` も `oxfmt` / `oxlint` バイナリを提供するが、`node_modules/.bin` は固定版の単体パッケージ（`oxfmt@0.51.0` / `oxlint@1.65.0`）を指す。CI 経路の再現性は保たれる。
- **GAS デプロイ未実施**：`clasp push` による実デプロイ検証は外部影響を伴うため未実施。`dist/Code.js` の機能等価性（IIFE・footer・export）は検証済。実機確認は利用者が `clasp push --force` で実施すること。

### コミット方針（推奨）

初回 Oxfmt 再整形は大規模 diff（`src/ui/*.html` 等）を含むため、機能移行コミットと整形コミットを分離することを推奨する。
