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

### ビルド

```bash
pnpm run build
```

### GASへ反映

```bash
pnpm exec clasp push --force
```

## 画面のデプロイ方法と開き方

### デプロイ方法（Webアプリ）

1. Apps Scriptエディタを開きます。
2. 右上の`デプロイ` → `新しいデプロイ`を選択します。
3. 種類で`ウェブアプリ`を選択します。
4. `次のユーザーとして実行`は`自分`、`アクセスできるユーザー`は`自分のみ`を選択します。
5. `デプロイ`を実行し、表示されたURLを控えます。

### 画面の開き方

- デプロイ時に表示されたWebアプリのURLにアクセスします。
- 既存のデプロイURLを確認する場合は、`デプロイ` → `デプロイを管理`から確認できます。

## 使い方

1. スプレッドシートを開き、メニューの`Trustfolio`から`シート初期化`を実行します。
2. 画面から銘柄・基準価額・スポット購入・積立を登録します。
3. 保有情報とポートフォリオサマリーを確認します。

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
| `pnpm run build` | GAS用にバンドルして`dist/`へ出力 |
| `pnpm exec clasp push --force` | GASプロジェクトへ反映 |
| `pnpm lint` | ESLintでコード検査 |
| `pnpm lint:fix` | ESLintで自動修正 |

## ライセンス

ISC
