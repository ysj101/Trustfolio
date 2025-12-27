# Trustfolio GAS移行計画

## 概要

ローカルで動作しているTrustfolio（投資信託ポートフォリオ管理アプリ）をGoogle Apps Script + Google Sheetsに完全移行する。

**移行方針:**
- バックエンド・フロントエンドともにGAS上で動作
- Google Sheetsをデータベースとして使用
- 既存データの移行は行わない（新規開始）
- 認証はGASデプロイ設定（「自分のみ」）で制限
- claspでデプロイ

---

## 1. プロジェクト構成

### ディレクトリ構造

```
Trustfolio/
├── gas/                          # GASプロジェクト（新設）
│   ├── .clasp.json               # clasp設定
│   ├── appsscript.json           # GASマニフェスト
│   ├── package.json              # 開発依存関係
│   ├── tsconfig.json             # TypeScript設定
│   ├── rollup.config.js          # バンドル設定
│   ├── src/
│   │   ├── main.ts               # エントリーポイント（doGet/doPost）
│   │   ├── Config.ts             # 設定（シート名等）
│   │   ├── utils/
│   │   │   └── ulid.ts           # ULID生成
│   │   ├── domain/
│   │   │   ├── types.ts          # 型定義
│   │   │   ├── PurchaseCalculator.ts
│   │   │   └── HoldingCalculator.ts
│   │   ├── repository/
│   │   │   ├── SheetRepository.ts
│   │   │   ├── FundRepository.ts
│   │   │   ├── NavRepository.ts
│   │   │   ├── TransactionRepository.ts
│   │   │   └── RecurringPurchaseRepository.ts
│   │   ├── usecase/
│   │   │   ├── FundUseCase.ts
│   │   │   ├── NavUseCase.ts
│   │   │   ├── TransactionUseCase.ts
│   │   │   ├── RecurringUseCase.ts
│   │   │   ├── HoldingUseCase.ts
│   │   │   └── PortfolioUseCase.ts
│   │   ├── api/
│   │   │   └── router.ts         # APIルーティング
│   │   └── ui/
│   │       ├── Index.html        # メインHTML
│   │       ├── templates/        # ページテンプレート
│   │       ├── styles.html       # CSS（<style>タグ）
│   │       └── scripts.html      # JavaScript（<script>タグ）
│   └── dist/                     # ビルド出力
├── src/                          # 既存バックエンド（参照用）
└── web/                          # 既存フロントエンド（参照用）
```

### ビルド構成

**Rollup + TypeScript** でバンドル：
- 複数のTSファイルを1つの `Code.js` に結合
- GASグローバル関数（doGet, doPost, onOpen）をバナーとして追加
- HTMLファイルは別途 `dist/` にコピー

---

## 2. データベース設計（Google Sheets）

### シート構成

| シート名 | 対応テーブル | 説明 |
|---------|-------------|------|
| `_funds` | funds | 投資信託マスタ |
| `_navs` | navs | 基準価額履歴 |
| `_transactions` | transactions | 取引履歴 |
| `_recurring` | recurring_purchases | 積立設定 |

### 列定義

#### `_funds`
| 列 | 名前 | 型 | 説明 |
|---|------|-----|------|
| A | id | String | ULID (PK) |
| B | name | String | 銘柄名 (UNIQUE) |
| C | createdAt | String | ISO8601 |

#### `_navs`
| 列 | 名前 | 型 | 説明 |
|---|------|-----|------|
| A | id | String | ULID (PK) |
| B | fundId | String | FK → _funds.id |
| C | date | String | YYYY-MM-DD |
| D | value | Number | 基準価額（1万口あたり円） |
| E | createdAt | String | ISO8601 |

**制約:** (fundId, date) で UNIQUE（アプリ側で検証）

#### `_transactions`
| 列 | 名前 | 型 | 説明 |
|---|------|-----|------|
| A | id | String | ULID (PK) |
| B | fundId | String | FK → _funds.id |
| C | type | String | SPOT_PURCHASE / RECURRING_PURCHASE |
| D | date | String | YYYY-MM-DD |
| E | amount | Number | 購入金額（円） |
| F | fee | Number | 手数料（円） |
| G | navValue | Number | 適用基準価額 |
| H | units | Number | 取得口数 |
| I | recurringPurchaseId | String | FK → _recurring.id (nullable) |
| J | idempotencyKey | String | 冪等性キー (UNIQUE, nullable) |
| K | createdAt | String | ISO8601 |

#### `_recurring`
| 列 | 名前 | 型 | 説明 |
|---|------|-----|------|
| A | id | String | ULID (PK) |
| B | fundId | String | FK → _funds.id |
| C | monthlyAmount | Number | 月額購入金額 |
| D | executionDay | Number | 実行日 (1-28) |
| E | startDate | String | YYYY-MM-DD |
| F | endDate | String | YYYY-MM-DD (nullable) |
| G | isActive | Boolean | アクティブ状態 |
| H | createdAt | String | ISO8601 |

---

## 3. 実装フェーズ

### Phase 1: 基盤構築

**目標:** GASプロジェクトの基盤とビルドパイプラインを構築

**タスク:**
1. `gas/` ディレクトリ作成
2. `package.json` 作成（devDependencies: rollup, typescript, @rollup/plugin-typescript, clasp）
3. `tsconfig.json` 作成
4. `rollup.config.js` 作成
5. `appsscript.json` 作成
6. `.clasp.json` 作成（claspでプロジェクト作成後）
7. `src/main.ts` 作成（doGet/doPost基本実装）
8. `src/utils/ulid.ts` 作成（ULID生成）
9. `src/repository/SheetRepository.ts` 作成（共通シート操作）
10. `src/Config.ts` 作成（シート名定数）
11. シート初期化関数（initializeSheets）作成
12. ビルドスクリプト設定（`pnpm build`, `pnpm push`）

**成果物:** ビルド・デプロイが動作するGASプロジェクト

---

### Phase 2: Fund + NAV機能

**目標:** 投資信託と基準価額の基本CRUD

**タスク:**
1. `src/domain/types.ts` 作成（Fund, Nav, Result型定義）
2. `src/repository/FundRepository.ts` 作成
3. `src/repository/NavRepository.ts` 作成
4. `src/usecase/FundUseCase.ts` 作成（listFunds, createFund）
5. `src/usecase/NavUseCase.ts` 作成（getNavHistory, registerNav）
6. `src/api/router.ts` 更新（Fund, Nav APIハンドラ追加）
7. `src/ui/Index.html` 作成（基本レイアウト）
8. `src/ui/styles.html` 作成（CSS）
9. `src/ui/scripts.html` 作成（JS: API呼び出し、ルーティング）
10. Fund一覧・登録UI実装
11. NAV登録・履歴表示UI実装

**成果物:** 投資信託・基準価額の登録・表示が動作

---

### Phase 3: Transaction機能

**目標:** スポット購入の完全実装

**タスク:**
1. `src/domain/types.ts` 更新（Transaction型追加）
2. `src/domain/PurchaseCalculator.ts` 作成（calculateUnits, calculateValue）
3. `src/repository/TransactionRepository.ts` 作成
4. `src/usecase/TransactionUseCase.ts` 作成（getHistory, executeSpotPurchase）
5. `src/api/router.ts` 更新（Transaction APIハンドラ追加）
6. 取引履歴表示UI実装
7. スポット購入フォームUI実装

**成果物:** スポット購入の実行・履歴表示が動作

---

### Phase 4: Recurring機能

**目標:** 積立設定と一括実行

**タスク:**
1. `src/domain/types.ts` 更新（RecurringPurchase型追加）
2. `src/repository/RecurringPurchaseRepository.ts` 作成
3. `src/usecase/RecurringUseCase.ts` 作成（list, create, execute）
4. 冪等性チェック実装（idempotencyKey検証）
5. `src/api/router.ts` 更新（Recurring APIハンドラ追加）
6. 積立設定一覧・登録UI実装
7. 一括実行UI実装

**成果物:** 積立設定の登録・一括実行が動作

---

### Phase 5: Holding + Portfolio機能

**目標:** 保有情報とポートフォリオ表示

**タスク:**
1. `src/domain/types.ts` 更新（Holding, Portfolio型追加）
2. `src/domain/HoldingCalculator.ts` 作成
3. `src/usecase/HoldingUseCase.ts` 作成
4. `src/usecase/PortfolioUseCase.ts` 作成
5. `src/api/router.ts` 更新（Holding, Portfolio APIハンドラ追加）
6. 保有情報表示UI実装
7. ポートフォリオサマリーUI実装

**成果物:** ポートフォリオ全体の表示が動作

---

### Phase 6: UI改善とテスト

**目標:** UI/UXの改善と品質保証

**タスク:**
1. CSS/スタイル改善
2. エラーハンドリング改善（ユーザーフレンドリーなメッセージ）
3. ローディング状態の改善
4. レスポンシブ対応
5. 手動テストケース実行
6. エッジケース対応

**成果物:** 完成したWebアプリケーション

---

## 4. 重要な実装パターン

### エラーハンドリング

neverthrowからResult型オブジェクトパターンへ変換:

```typescript
type Result<T> = { success: true; value: T } | { success: false; error: AppError };
type AppError = { type: string; message: string; field?: string };
```

### API呼び出し（フロントエンド）

```javascript
google.script.run
  .withSuccessHandler(onSuccess)
  .withFailureHandler(onError)
  .handleApiRequest({ action: 'listFunds' });
```

### シート操作

```typescript
// 一括読み込み（効率的）
const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

// 一括書き込み（効率的）
sheet.getRange(startRow, 1, data.length, data[0].length).setValues(data);
```

---

## 5. 参照すべき既存ファイル

| 移植対象ロジック | 既存ファイル |
|----------------|-------------|
| 口数・評価額計算 | [purchase-calculator.ts](../src/domain/transaction/services/purchase-calculator.ts) |
| 保有情報計算 | [holding-calculator.ts](../src/domain/holding/services/holding-calculator.ts) |
| 積立実行・冪等性 | [execute-recurring-purchases.ts](../src/usecase/recurring/execute-recurring-purchases.ts) |
| リポジトリパターン | [transaction-repository.ts](../src/infrastructure/repositories/transaction-repository.ts) |
| APIルーティング | [app.ts](../src/presentation/api/app.ts) |

---

## 6. リスクと対策

| リスク | 対策 |
|-------|------|
| GAS実行時間制限（6分） | バッチ処理の分割、LockServiceによる排他制御 |
| API割り当て制限 | バッチ読み書き（getValues/setValues）の活用 |
| 型安全性の喪失 | 入力バリデーション強化、型ガード関数 |
| シート名変更による破損 | シート名を定数化、起動時検証 |
| 同時編集による競合 | LockService.getScriptLock() |
