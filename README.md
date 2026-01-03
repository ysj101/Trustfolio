# Trustfolio (GAS)

投資信託ポートフォリオ管理アプリケーション（Google Apps Script + Google Sheets）

## 概要

Trustfolioは、投資信託の銘柄・基準価額・取引・積立・保有情報・ポートフォリオを
Google Sheets上で管理するGASアプリケーションです。

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| 言語 | TypeScript 5.5+ |
| ランタイム | Google Apps Script (V8) |
| データストア | Google Sheets |
| ビルド | Rollup + TypeScript |
| デプロイ | clasp |
| エラーハンドリング | Result型（オブジェクト） |
| ID生成 | ULID |

## ディレクトリ構成

```
.
├── appsscript.json
├── rollup.config.js
├── tsconfig.json
├── src/
│   ├── main.ts
│   ├── Config.ts
│   ├── utils/
│   ├── domain/
│   ├── repository/
│   ├── usecase/
│   ├── api/
│   └── ui/
└── dist/
```

## シート構成

| シート名 | 説明 |
|----------|------|
| `_funds` | 投資信託マスタ |
| `_navs` | 基準価額履歴 |
| `_transactions` | 取引履歴 |
| `_recurring` | 積立設定 |

## セットアップ

### 必要環境

- Node.js 20以上
- pnpm 10以上
- clasp（`pnpm exec clasp login`で認証）

### インストール

```bash
pnpm install
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

```bash
pnpm build
```

## デプロイ

### 開発フロー

```bash
pnpm push
```

このコマンドで以下が自動実行されます：

1. ESLintによるコードチェック
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

1. スプレッドシートを開き、メニューの`Trustfolio`から`シート初期化`を実行します。
2. 画面から銘柄・基準価額・スポット購入・積立を登録します。
3. 保有情報とポートフォリオサマリーを確認します。

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

これで毎週土曜日の9:00-10:00に投資実績レポートが指定したメールアドレスに送信されます。

#### トリガーの削除

週次レポートの送信を停止したい場合は、`deleteWeeklyReportTrigger`関数を実行してください。

## コーディング規約

| 項目 | 方針 |
|------|------|
| enum | 禁止（`as const`を使用） |
| class | 禁止（関数とオブジェクトを使用） |
| throw | 禁止（Result型を使用） |
| try/catch | 腐敗防止層でのみ許可 |
| any | 禁止 |

## スクリプト一覧

| コマンド | 説明 |
|----------|------|
| `pnpm push` | lint→ビルド→GASへpush（メインコマンド） |
| `pnpm setup:clasp` | `.env`から`.clasp.json`を生成 |
| `pnpm sync:env` | `.env`からGASスクリプトプロパティ設定用の関数を出力 |
| `pnpm build` | GAS用にバンドルして`dist/`へ出力 |
| `pnpm lint` | ESLintでコード検査 |
| `pnpm lint:fix` | ESLintで自動修正 |
| `pnpm test:rakuten` | 楽天証券NAV取得の統合テスト（1銘柄） |
| `pnpm test:nav-fetch` | NAV自動取得の統合テスト（複数銘柄） |

## ライセンス

ISC
