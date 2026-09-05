# Trustfolio (GAS)

投資信託ポートフォリオ管理アプリケーション（Google Apps Script + Google Sheets）

## リポジトリ

ソースコードは [GitHub の Trustfolio リポジトリ](https://github.com/ysj101/Trustfolio) で管理しています。

## 概要

Trustfolioは、投資信託の銘柄・基準価額・取引・積立・保有情報・ポートフォリオを
Google Sheets上で管理するGASアプリケーションです。

### 主な機能

- 📊 **銘柄・NAV管理**: 投資信託銘柄の登録と基準価額の記録・自動取得（楽天証券連携）
- 💰 **取引管理**: スポット購入・積立設定の登録と自動実行
- 📈 **保有・パフォーマンス分析**: 銘柄ごとの保有状況と時系列パフォーマンスの可視化
- 📧 **週次レポート**: 投資実績を自動でメール送信
- 🎨 **モダンなUI**: Tailwind CSSを使用したダークモード対応のWebアプリ

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| 言語 | TypeScript 5.5+ |
| ランタイム | Google Apps Script (V8) |
| データストア | Google Sheets |
| ビルド | Rollup + TypeScript |
| デプロイ | clasp |
| テスト | Vitest |
| UI | Tailwind CSS |
| エラーハンドリング | Result型（オブジェクト） |
| ID生成 | ULID |

## ディレクトリ構成

```
.
├── appsscript.json          # GAS マニフェスト
├── rollup.config.js         # Rollup ビルド設定
├── tsconfig.json            # TypeScript 設定
├── vitest.config.ts         # Vitest テスト設定
├── src/
│   ├── main.ts              # エントリーポイント
│   ├── Config.ts            # 設定管理
│   ├── api/                 # APIルーター
│   ├── domain/              # ドメインロジック（計算、型定義）
│   ├── repository/          # データアクセス層（Sheets操作）
│   ├── service/             # 外部サービス連携（楽天証券、メール）
│   ├── usecase/             # ユースケース層（ビジネスロジック）
│   ├── ui/                  # HTML/CSS（Webアプリ画面）
│   ├── utils/               # ユーティリティ（ULID生成など）
│   ├── scripts/             # スクリプト用型定義
│   └── integration/         # 統合テスト
├── tests/                   # テストコード（Vitest）
│   ├── api/
│   ├── domain/
│   ├── repository/
│   ├── service/
│   ├── usecase/
│   └── utils/
├── scripts/                 # ビルド・セットアップスクリプト
│   ├── build-styles.sh      # CSS ビルド
│   ├── setup-clasp.sh       # clasp 設定生成
│   ├── sync-env-to-gas.mjs  # 環境変数同期スクリプト
│   ├── rakuten-integration-test.mjs  # 楽天証券統合テスト
│   └── nav-fetch-test.mjs   # NAV取得統合テスト
├── docs/                    # ドキュメント
└── dist/                    # ビルド出力（GASへデプロイ）
```

## シート構成

| シート名 | 説明 |
|----------|------|
| `_funds` | 投資信託マスタ（銘柄情報） |
| `_nav_records` | 基準価額（NAV）履歴 |
| `_recurring` | 積立設定（自動購入設定） |
| `_tx_{suffix}` | 取引履歴（銘柄ごと、suffixはファンドIDの末尾3文字） |
| `_performance` | パフォーマンスデータ（全銘柄集計） |
| `_perf_{suffix}` | パフォーマンスデータ（銘柄ごと、suffixはファンドIDの末尾3文字） |

`_funds`シートは、`id`、`name`、`rakutenFundId`、`settlementBusinessDays`、`navSource`、`navSourceCode`、`assetClass`、`createdAt`の8列で構成されます。列移行はシート初期化または銘柄の登録・更新時に実行され、夜間のNAV自動取得では実行されません。読み取り時はヘッダー名で列を対応付けるため、移行前の旧5列・旧7列や利用者が追加した列を変更せずに読み取れます。一方、書き込みを伴う操作（銘柄の登録・更新、銘柄一覧からの資産クラスの設定、シート初期化）では列移行が実行され、定義外のヘッダーを持つ列（利用者が追加したメモ列や空ヘッダーの列）はその値ごと削除されます。`_funds`シートに独自の列を追加して運用しないでください。`assetClass`には株式を表す`equity`または金を表す`gold`を保存します。空セルは導入前の銘柄に残る未設定状態を表します。資産クラスは銘柄一覧からいつでも変更できます。本機能では銘柄一覧・保有一覧のバッジ表示に使用します。資産クラス別の集計は issue #231 で扱います。

## セットアップ

### 必要環境

- [mise](https://mise.jdx.dev/)（Node.js のバージョン管理）
- Corepack（Node.js 24 に同梱。pnpm の取得・SHA 検証に利用）
- clasp（`pnpm exec clasp login`で認証）
- Google Apps Scriptプロジェクト
- Google スプレッドシート

`mise.toml` で Node.js `24.19` 系（現行の Active LTS 線。patch は自動追従）を推奨ランタイムとして固定しています（issue #199 で 22.22 系から移行）。pnpm は `package.json` の `packageManager` (`pnpm@10.30.2+sha512...`) を Corepack が SHA まで検証してインストールするため、バージョン定義を 1 箇所に集約しています。これらは `engines.node` (`>=22.22.1 <23 || >=24.11.0 <25`)、`engines.pnpm` (`>=10.30.2 <11`) と整合しています。engines のレンジは、22 系の下限が lint-staged@17 の要求（`>=22.22.1`）、24 系の下限が vite-plus の要求（`>=24.11.0`）に由来し、EOL 済みの非 LTS Node 23 系を除外しています（テスト CI は 22 系・24 系の両方で検証)。依存関係の追加・更新・実行は `pnpm` だけを使用してください。

### インストール

mise が未導入であれば、まずインストールし、シェルへの activate を済ませてください（zsh の場合は `~/.zshrc` に `eval "$(mise activate zsh)"` を追加）。

```bash
# macOS（Homebrew）
brew install mise

# Linux または macOS の代替
curl https://mise.run | sh

# ~/.zshrc に: eval "$(mise activate zsh)"
exec zsh
```

プロジェクトルートで以下を実行します。

```bash
mise install     # mise.toml に従って Node.js 24.19.x をインストール
corepack enable  # Corepack を有効化（Node 24 に同梱）
pnpm install     # Corepack が package.json の packageManager フィールドから
                 # pnpm@10.30.2 を SHA 検証付きで自動解決
```

### 環境変数の設定

1. `.env.example`をコピーして`.env`を作成します。

```bash
cp .env.example .env
```

2. `.env`ファイルに以下の値を設定します。

| 環境変数 | 説明 | 取得方法 |
|----------|------|----------|
| `GAS_SCRIPT_ID` | GASプロジェクトのScript ID | GASエディタのURL `https://script.google.com/home/projects/{SCRIPT_ID}/edit` から取得 |
| `WEEKLY_REPORT_EMAIL` | 週次レポート送信先メールアドレス | 投資実績レポートを受信するメールアドレスを指定 |

3. `.clasp.json`を生成します。

```bash
pnpm setup:clasp
```

### ビルド

TypeScriptのコンパイル、HTMLのコピー、CSSのビルドを一括実行します。

```bash
pnpm build
```

個別にビルドする場合：

```bash
pnpm build:js    # TypeScriptのバンドル
pnpm build:html  # HTMLファイルのコピー
pnpm build:css   # Tailwind CSSのビルド
```

### テスト

```bash
pnpm test              # Vitestでユニットテスト実行
pnpm test:rakuten     # 楽天証券NAV取得の統合テスト
pnpm test:nav-fetch   # NAV自動取得の統合テスト
```

### コード品質チェック

```bash
pnpm lint             # oxlintと専用チェックでコード検査
pnpm lint:fix         # oxlintの自動修正とBiome整形を実行
pnpm format           # Biomeでコード整形
pnpm format:check     # Biomeでフォーマットチェックのみ
```

## デプロイ

### 開発フロー

```bash
pnpm push
```

このコマンドで以下が自動実行されます：

1. oxlintと専用チェックによるコードチェック
2. TypeScriptのビルド
3. GASへのコードpush（`@HEAD`デプロイメント更新）

### 本番反映

GASエディタで既存デプロイメントを更新します（URLが固定されます）：

1. GASエディタを開く
2. 「デプロイ」→「デプロイを管理」
3. 編集（鉛筆アイコン）をクリック
4. バージョンで「新バージョン」を選択
5. 「デプロイ」をクリック

### 初回Webアプリデプロイ（新規プロジェクトのみ）

1. GASエディタで「デプロイ」→「新しいデプロイ」
2. 種類で「ウェブアプリ」を選択
3. 実行ユーザー・アクセス権限を設定
4. 「デプロイ」をクリック

### 画面の開き方

- GASエディタの「デプロイ」→「デプロイを管理」からWebアプリURLを確認できます。

## 使い方

### 初期セットアップ

1. スプレッドシートを開き、メニューの`Trustfolio`から`シート初期化`を実行します。
2. 必要なシート（`_funds`、`_nav_records`、`_recurring`など）が自動作成されます。

### Webアプリの使用

Webアプリでは以下の操作が可能です：

- **銘柄管理**: 投資信託銘柄の登録・編集（楽天証券ファンドID連携）
- **基準価額（NAV）管理**: 手動でのNAV登録・履歴確認
- **スポット購入**: 単発の購入取引の登録
- **積立設定**: 定期的な自動購入の設定（月次、実行日指定）
- **保有情報**: 銘柄ごとの保有口数・評価額の確認
- **ポートフォリオ**: 全銘柄の投資配分・パフォーマンスの確認
- **パフォーマンス分析**: 時系列でのパフォーマンス推移の確認

### NAV自動取得の設定

保有銘柄の基準価額（NAV）を毎日自動で取得するには、以下の手順でトリガーを設定します。

詳細な手順は [docs/NAV_AUTO_FETCH_SETUP.md](docs/NAV_AUTO_FETCH_SETUP.md) を参照してください。

#### 方法1: スクリプトによる設定（推奨）

1. Google Apps Scriptエディタを開く
2. 関数選択ドロップダウンから`setupNavFetchTrigger`を選択
3. 「実行」ボタンをクリック
4. 初回実行時は権限を承認

#### 方法2: 手動設定

1. Google Apps Scriptエディタの「トリガー」から「+ トリガーを追加」
2. 関数: `fetchAllNavs`、イベント: `時間主導型`、時刻: `午後9時〜10時`を設定

### 積立購入の自動実行設定

登録した積立設定に基づき、毎日自動で購入を実行するには、以下の手順でトリガーを設定します。

#### トリガーを設定

1. Google Apps Scriptエディタを開く
2. 関数選択ドロップダウンから`setupRecurringPurchasesTrigger`を選択
3. 「実行」ボタンをクリック
4. 初回実行時は権限を承認

これで毎日午前9:00-10:00に積立設定がチェックされ、実行日に該当する場合は自動購入が実行されます。

### 週次レポートの設定

投資実績を毎週土曜日にメールで受信するには、以下の手順を実行します。

#### 1. スクリプトプロパティの設定

1. Google Apps Scriptエディタを開く
2. プロジェクトの設定（歯車アイコン）をクリック
3. 「スクリプトプロパティ」タブを選択
4. 「スクリプトプロパティを追加」をクリック
5. 以下を入力して保存
   - プロパティ: `WEEKLY_REPORT_EMAIL`
   - 値: メール送信先アドレス（例: `your_email@example.com`）

#### 2. トリガーを設定

1. Google Apps Scriptエディタを開く
2. 関数選択ドロップダウンから`setupWeeklyReportTrigger`を選択
3. 「実行」ボタンをクリック

これで毎週土曜日の7:00-8:00に投資実績レポートが指定したメールアドレスに送信されます。

#### トリガーの削除

週次レポートの送信を停止したい場合は、`deleteWeeklyReportTrigger`関数を実行してください。

## 開発体制

### CI/CD

GitHub Actionsで以下を自動実行しています：

- **Lint**: oxlintと専用チェック、Biomeフォーマット検証（[.github/workflows/lint.yml](.github/workflows/lint.yml)）
- **Test**: Vitestによる単体テスト実行（[.github/workflows/test.yml](.github/workflows/test.yml)）
- **Security Check**: `pnpm audit --audit-level moderate` による依存関係監査（[.github/workflows/security.yml](.github/workflows/security.yml)）
- **Code Review**: Claudeによる自動コードレビュー（プルリクエスト時）
- **Dependabot Auto Merge**: パッチバージョンの自動マージ（[.github/workflows/dependabot-auto-merge.yml](.github/workflows/dependabot-auto-merge.yml)）

### コミットフック

Huskyとlint-stagedを使用し、コミット前に以下を自動実行：

- oxlintによる自動修正
- Biomeによるコード整形
- 関連するテストの実行

## コーディング規約

| 項目 | 方針 |
|------|------|
| enum | 禁止（`as const`を使用） |
| class | 禁止（関数とオブジェクトを使用） |
| throw | 禁止（Result型を使用） |
| try/catch | 腐敗防止層でのみ許可 |
| any | 禁止 |

### アーキテクチャ

レイヤードアーキテクチャを採用：

- **UI層** ([src/ui/](src/ui/)): HTML/CSS（Webアプリ画面）
- **API層** ([src/api/](src/api/)): HTTPリクエストのルーティング
- **UseCase層** ([src/usecase/](src/usecase/)): ビジネスロジック
- **Domain層** ([src/domain/](src/domain/)): ドメインロジック・型定義
- **Repository層** ([src/repository/](src/repository/)): データアクセス（Sheets操作）
- **Service層** ([src/service/](src/service/)): 外部サービス連携（楽天証券、メール）

## スクリプト一覧

| コマンド | 説明 |
|----------|------|
| `pnpm push` | lint→ビルド→GASへpush（メインコマンド） |
| `pnpm setup:clasp` | `.env`から`.clasp.json`を生成 |
| `pnpm sync:env` | `.env`からGASスクリプトプロパティ設定用の関数を出力 |
| `pnpm build` | GAS用にバンドルして`dist/`へ出力 |
| `pnpm build:js` | TypeScriptをバンドル |
| `pnpm build:html` | HTMLファイルを`dist/`へコピー |
| `pnpm build:css` | Tailwind CSSをビルド |
| `pnpm lint` | oxlintと専用チェックでコード検査 |
| `pnpm lint:fix` | oxlintの自動修正とBiome整形を実行 |
| `pnpm format` | Biomeでコード整形 |
| `pnpm format:check` | Biomeでフォーマットチェック |
| `pnpm test` | Vitestでテスト実行 |
| `pnpm test:rakuten` | 楽天証券NAV取得の統合テスト（1銘柄） |
| `pnpm test:nav-fetch` | NAV自動取得の統合テスト（複数銘柄） |

## ライセンス

ISC
