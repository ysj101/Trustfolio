# Phase 3: 取引機能

## 概要

スポット購入と積立購入の取引機能を実装する。口数計算ロジックと積立の冪等性保証がコア要件。

## 実装項目

### 1. Domain層

#### 1.1 Transaction エンティティ (`src/domain/transaction/`)

**TransactionType:**
```typescript
const TRANSACTION_TYPES = {
  SPOT_PURCHASE: "SPOT_PURCHASE",     // スポット購入
  RECURRING_PURCHASE: "RECURRING_PURCHASE", // 積立購入
} as const;
```

**Transaction エンティティ:**
```typescript
type Transaction = {
  readonly id: TransactionId;
  readonly fundId: FundId;
  readonly type: TransactionType;
  readonly date: TransactionDate;     // YYYY-MM-DD
  readonly amount: Money;             // 購入金額（円）
  readonly fee: Money;                // 手数料（円）
  readonly navValue: NavValue;        // 適用基準価額
  readonly units: Units;              // 取得口数
  readonly recurringPurchaseId: RecurringPurchaseId | null;
  readonly idempotencyKey: IdempotencyKey | null;
  readonly createdAt: Date;
};
```

#### 1.2 RecurringPurchase エンティティ (`src/domain/recurring/`)

**RecurringPurchase エンティティ:**
```typescript
type RecurringPurchase = {
  readonly id: RecurringPurchaseId;
  readonly fundId: FundId;
  readonly monthlyAmount: Money;      // 月額（円）
  readonly executionDay: ExecutionDay; // 実行日（1-28）
  readonly startDate: RecurringDate;  // 開始日
  readonly endDate: RecurringDate | null; // 終了日（null=無期限）
  readonly isActive: boolean;
  readonly createdAt: Date;
};
```

**ExecutionDay 値オブジェクト:**
- 1〜28の整数のみ許可（29-31は月によって存在しないため除外）

#### 1.3 PurchaseCalculator サービス (`src/domain/transaction/services/`)

**口数計算ロジック:**
```typescript
/**
 * 購入口数を計算する
 *
 * 計算式: 口数 = (購入金額 - 手数料) / 基準価額 × 10000
 * 端数処理: 切り捨て
 *
 * @param amount - 購入金額（円）
 * @param fee - 手数料（円）
 * @param navValue - 基準価額（1万口あたり円）
 * @returns 取得口数
 */
function calculateUnits(
  amount: Money,
  fee: Money,
  navValue: NavValue
): Result<Units, ValidationError>
```

**単体テスト例:**
| 購入金額 | 手数料 | 基準価額 | 期待口数 |
|---------|--------|---------|---------|
| 10,000円 | 0円 | 10,000円 | 10,000口 |
| 10,000円 | 100円 | 10,000円 | 9,900口 |
| 33,333円 | 0円 | 12,345円 | 27,001口（切り捨て） |

#### 1.4 Units 値オブジェクト

```typescript
type Units = Branded<number, "Units">;
```

- 正の整数のみ
- 小数不可

### 2. Infrastructure層

#### 2.1 DBスキーマ

**transactions テーブル:**
```typescript
export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  fundId: text("fund_id").notNull().references(() => funds.id),
  type: text("type").notNull(),
  date: text("date").notNull(),
  amount: integer("amount").notNull(),
  fee: integer("fee").notNull(),
  navValue: integer("nav_value").notNull(),
  units: integer("units").notNull(),
  recurringPurchaseId: text("recurring_purchase_id").references(() => recurringPurchases.id),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
```

**recurring_purchases テーブル:**
```typescript
export const recurringPurchases = sqliteTable("recurring_purchases", {
  id: text("id").primaryKey(),
  fundId: text("fund_id").notNull().references(() => funds.id),
  monthlyAmount: integer("monthly_amount").notNull(),
  executionDay: integer("execution_day").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
```

#### 2.2 Repository実装

**TransactionRepository:**
| メソッド | 説明 |
|---------|------|
| `save(transaction)` | 取引保存 |
| `findByIdempotencyKey(key)` | 冪等性チェック |
| `findByFund(fundId, options?)` | 取引履歴取得 |

**RecurringPurchaseRepository:**
| メソッド | 説明 |
|---------|------|
| `save(recurring)` | 積立設定保存 |
| `findById(id)` | ID検索 |
| `findActiveByFund(fundId)` | アクティブな積立取得 |
| `findAll()` | 全件取得 |

### 3. UseCase層

#### 3.1 executeSpotPurchase

**入力:**
```typescript
type ExecuteSpotPurchaseInput = {
  fundId: string;
  date: string;       // 購入日
  amount: number;     // 購入金額
  fee?: number;       // 手数料（デフォルト0）
};
```

**出力:** `{ transaction: Transaction }`

**処理フロー:**
1. Fund存在確認
2. 購入日のNAV取得
3. 口数計算
4. Transaction生成・保存

#### 3.2 registerRecurringPurchase

**入力:**
```typescript
type RegisterRecurringPurchaseInput = {
  fundId: string;
  monthlyAmount: number;
  executionDay: number;   // 1-28
  startDate: string;
  endDate?: string;
};
```

**出力:** `{ recurringPurchase: RecurringPurchase }`

#### 3.3 executeRecurringPurchases

**入力:**
```typescript
type ExecuteRecurringPurchasesInput = {
  targetDate: string;  // 実行対象日（YYYY-MM-DD）
};
```

**出力:**
```typescript
type ExecuteRecurringPurchasesOutput = {
  executed: Transaction[];  // 新規実行された取引
  skipped: {               // スキップされた積立
    recurringPurchaseId: string;
    reason: "ALREADY_EXECUTED" | "NO_NAV" | "INACTIVE";
  }[];
};
```

**冪等性保証:**
```typescript
// 冪等性キー形式
const idempotencyKey = `${recurringPurchaseId}_${targetDate}`;

// 既に実行済みの場合はスキップ
const existing = await transactionRepo.findByIdempotencyKey(idempotencyKey);
if (existing) {
  return { skipped: [{ reason: "ALREADY_EXECUTED" }] };
}
```

**処理フロー:**
1. 対象日の積立設定を取得（実行日一致 + アクティブ + 期間内）
2. 各積立に対して:
   - 冪等性チェック
   - NAV取得
   - 口数計算
   - Transaction生成・保存

#### 3.4 getTransactionHistory

**入力:** `{ fundId: string, limit?: number }`
**出力:** `{ transactions: Transaction[] }`

### 4. Presentation層

#### 4.1 DTO定義

**TransactionResponseDto:**
```typescript
type TransactionResponseDto = {
  id: string;
  fundId: string;
  type: "SPOT_PURCHASE" | "RECURRING_PURCHASE";
  date: string;
  amount: number;
  fee: number;
  navValue: number;
  units: number;
  recurringPurchaseId: string | null;
  createdAt: string;
};
```

**RecurringPurchaseResponseDto:**
```typescript
type RecurringPurchaseResponseDto = {
  id: string;
  fundId: string;
  monthlyAmount: number;
  executionDay: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
};
```

#### 4.2 APIエンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| POST | /api/funds/:fundId/transactions | スポット購入 |
| GET | /api/funds/:fundId/transactions | 取引履歴 |
| POST | /api/recurring | 積立設定登録 |
| GET | /api/recurring | 積立設定一覧 |
| POST | /api/recurring/execute | 積立一括実行 |

## ディレクトリ構造（完成時）

```
src/
├── domain/
│   ├── transaction/
│   │   ├── entities/transaction.ts
│   │   ├── value-objects/
│   │   │   ├── transaction-type.ts
│   │   │   ├── units.ts
│   │   │   └── idempotency-key.ts
│   │   ├── services/
│   │   │   └── purchase-calculator.ts
│   │   ├── transaction.test.ts
│   │   └── index.ts
│   └── recurring/
│       ├── entities/recurring-purchase.ts
│       ├── value-objects/
│       │   └── execution-day.ts
│       ├── recurring.test.ts
│       └── index.ts
├── infrastructure/
│   ├── database/schema/
│   │   ├── transactions.ts
│   │   └── recurring-purchases.ts
│   └── repositories/
│       ├── transaction-repository.ts
│       └── recurring-purchase-repository.ts
├── usecase/
│   ├── transaction/
│   │   ├── execute-spot-purchase.ts
│   │   ├── get-transaction-history.ts
│   │   ├── transaction.integration.test.ts
│   │   └── index.ts
│   └── recurring/
│       ├── register-recurring-purchase.ts
│       ├── execute-recurring-purchases.ts
│       ├── recurring.integration.test.ts
│       └── index.ts
└── presentation/api/
    ├── dto/
    │   ├── transaction-dto.ts
    │   └── recurring-dto.ts
    └── routes/
        ├── transaction-routes.ts
        └── recurring-routes.ts
```

## テスト

### 単体テスト（Domain層）

**PurchaseCalculator:**
- 正常な口数計算
- 端数切り捨て確認
- 手数料考慮
- ゼロ・負値エラー

**ExecutionDay:**
- 1-28は有効
- 0, 29-31は無効

### 結合テスト（UseCase層）

**executeSpotPurchase:**
- 正常購入
- NAV未登録エラー
- Fund未存在エラー

**executeRecurringPurchases:**
- 正常実行
- 冪等性（同日再実行でスキップ）
- 複数積立の一括実行

## 完了条件

- [ ] `pnpm lint` がエラーなく通る
- [ ] `pnpm test:run` で全テスト合格
- [ ] スポット購入APIが動作する
- [ ] 積立実行が冪等（同日再実行で重複なし）
