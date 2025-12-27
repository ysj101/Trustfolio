# Trustfolio

投資信託ポートフォリオ管理アプリケーション

## 概要

個人投資家が保有する投資信託を一元管理し、積立・スポット購入・評価額・損益を正確に把握するためのアプリケーションです。TypeScriptを用いたレイヤーアーキテクチャ設計の学習を目的としています。

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| 言語 | TypeScript 5.9 |
| ランタイム | Node.js |
| DB | SQLite + Drizzle ORM |
| Backend | Hono |
| Frontend | React + Vite（予定） |
| テスト | Vitest |
| エラーハンドリング | neverthrow (Result型) |
| ID生成 | ULID |

## アーキテクチャ

レイヤードアーキテクチャを採用し、各層の責務を明確に分離しています。

```
src/
├── shared/              # 全レイヤー共通（Branded Types, エラー型）
├── domain/              # ビジネスロジック（エンティティ, 値オブジェクト）
├── usecase/             # アプリケーションロジック（ユースケース）
├── infrastructure/      # 外部システム連携（DB, リポジトリ実装）
└── presentation/        # API層（Honoルート, DTO）
```

### レイヤー依存ルール

ESLint boundaries pluginにより、以下の依存関係を強制しています。

- **shared**: 外部依存なし
- **domain**: shared のみ依存可能
- **usecase**: domain, shared のみ依存可能
- **infrastructure**: usecase, domain, shared のみ依存可能
- **presentation**: usecase, domain, shared のみ依存可能

## 設計方針

### コーディング規約

| 項目 | 方針 |
|------|------|
| enum | 禁止（`as const`を使用） |
| class | 禁止（関数とオブジェクトを使用） |
| throw | 禁止（Result型を使用） |
| try/catch | 腐敗防止層でのみ許可 |
| any | 禁止 |

### エラーハンドリング

neverthrowのResult型を使用し、例外を投げずにエラーを値として扱います。

```typescript
// 成功・失敗を型で表現
function createFund(input: CreateFundInput): Result<Fund, ValidationError>
```

### 値オブジェクト

Branded Typesを使用し、プリミティブ型の混同を防ぎます。

```typescript
type FundId = Branded<string, "FundId">;
type Money = Branded<number, "Money">;  // 円単位の整数
```

## APIエンドポイント

| メソッド | パス | 説明 |
|----------|------|------|
| GET | /health | ヘルスチェック |
| POST | /api/funds | 投資信託登録 |
| GET | /api/funds | 投資信託一覧取得 |
| POST | /api/funds/:fundId/navs | 基準価額登録 |
| GET | /api/funds/:fundId/navs | 基準価額履歴取得 |
| POST | /api/funds/:fundId/transactions/spot | スポット購入実行 |
| GET | /api/funds/:fundId/transactions | 取引履歴取得 |
| POST | /api/recurring | 積立設定登録 |
| GET | /api/recurring | 積立設定一覧取得 |
| POST | /api/recurring/execute | 積立一括実行 |
| GET | /api/funds/:fundId/holding | 個別保有情報取得 |
| GET | /api/portfolio | ポートフォリオ全体取得 |

## セットアップ

### 必要環境

- Node.js 20以上
- pnpm 10以上

### インストール

```bash
# 依存関係のインストール
pnpm install

# ネイティブモジュールのビルド許可（better-sqlite3）
pnpm approve-builds
```

### 開発サーバー起動

```bash
# ビルド
pnpm build

# サーバー起動（デフォルト: http://localhost:3000）
node dist/index.js

# 環境変数でカスタマイズ可能
PORT=8080 DATABASE_PATH=./mydata.db node dist/index.js
```

## スクリプト一覧

| コマンド | 説明 |
|----------|------|
| `pnpm build` | TypeScriptをコンパイル |
| `pnpm dev` | ウォッチモードでコンパイル |
| `pnpm test` | テストをウォッチモードで実行 |
| `pnpm test:run` | テストを1回実行 |
| `pnpm test:coverage` | カバレッジ付きでテスト実行 |
| `pnpm typecheck` | 型チェックのみ実行 |
| `pnpm lint` | ESLintでコード検査 |
| `pnpm lint:fix` | ESLintで自動修正 |

## テスト

### テスト構成

- **単体テスト**: Domain層の値オブジェクト・エンティティ
- **結合テスト**: UseCase層（インメモリDBを使用）

### 実行

```bash
# 全テスト実行
pnpm test:run

# カバレッジ確認
pnpm test:coverage
```

## DBスキーマ

### funds（投資信託）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | TEXT PK | ULID |
| name | TEXT UNIQUE | 銘柄名 |
| created_at | INTEGER | 登録日時（Unix timestamp） |

### navs（基準価額）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | TEXT PK | ULID |
| fund_id | TEXT FK | 投資信託ID |
| date | TEXT | 日付（YYYY-MM-DD） |
| value | INTEGER | 基準価額（1万口あたり円） |
| created_at | INTEGER | 登録日時（Unix timestamp） |
| UNIQUE(fund_id, date) | | 同一銘柄・日付は1件 |

### transactions（取引）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | TEXT PK | ULID |
| fund_id | TEXT FK | 投資信託ID |
| type | TEXT | 取引タイプ（SPOT_PURCHASE, RECURRING_PURCHASE） |
| date | TEXT | 取引日（YYYY-MM-DD） |
| amount | INTEGER | 購入金額（円） |
| nav_value | INTEGER | 約定時基準価額 |
| units | INTEGER | 取得口数 |
| idempotency_key | TEXT UNIQUE | 冪等性キー（積立用） |
| created_at | INTEGER | 登録日時（Unix timestamp） |

### recurring_purchases（積立設定）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | TEXT PK | ULID |
| fund_id | TEXT FK | 投資信託ID |
| monthly_amount | INTEGER | 月額購入金額（円） |
| execution_day | INTEGER | 実行日（1〜28） |
| start_date | TEXT | 開始日（YYYY-MM-DD） |
| end_date | TEXT | 終了日（YYYY-MM-DD、nullで無期限） |
| is_active | INTEGER | アクティブフラグ（1/0） |
| created_at | INTEGER | 登録日時（Unix timestamp） |

## 計算ルール

### 購入口数計算

```
口数 = (購入金額 - 手数料) / 基準価額 × 10000
```

- 口数の小数点以下は切り捨て

### 端数処理

| 対象 | 処理 |
|------|------|
| 口数 | 切り捨て |
| 金額 | 四捨五入 |
| 損益率 | 小数第4位で四捨五入 |

## 実装状況

- [x] Phase 1: 基盤構築（shared, Money VO, ESLint設定）
- [x] Phase 2: 投資信託・基準価額（Fund, NAV, API）
- [x] Phase 3: 取引機能（スポット購入, 積立）
- [x] Phase 4: ポートフォリオ（保有計算, 損益）
- [x] Phase 5: フロントエンド（React）
- [x] Phase 6: 品質向上（テストカバレッジ, ドキュメント）

## ライセンス

ISC
