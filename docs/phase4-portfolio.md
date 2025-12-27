# Phase 4: ポートフォリオ

## 概要

保有口数、平均取得単価、評価額、損益を計算するポートフォリオ機能を実装する。

## 実装項目

### 1. Domain層

#### 1.1 Holding エンティティ (`src/domain/holding/`)

**Holding（保有情報）:**
```typescript
type Holding = {
  readonly fundId: FundId;
  readonly fundName: FundName;
  readonly totalUnits: Units;           // 保有口数
  readonly averageCost: Money;          // 平均取得単価（1万口あたり）
  readonly totalInvestment: Money;      // 投資総額
  readonly currentNavValue: NavValue;   // 最新基準価額
  readonly currentValue: Money;         // 評価額
  readonly unrealizedGain: Money;       // 含み損益
  readonly unrealizedGainRate: Percentage; // 損益率
};
```

#### 1.2 Portfolio エンティティ (`src/domain/portfolio/`)

**Portfolio（ポートフォリオ全体）:**
```typescript
type Portfolio = {
  readonly holdings: readonly Holding[];
  readonly totalInvestment: Money;      // 投資総額
  readonly totalCurrentValue: Money;    // 評価額合計
  readonly totalUnrealizedGain: Money;  // 含み損益合計
  readonly totalUnrealizedGainRate: Percentage; // 全体損益率
};
```

#### 1.3 計算サービス (`src/domain/holding/services/`)

**HoldingCalculator:**

```typescript
/**
 * 保有情報を計算する
 *
 * @param fund - 投資信託
 * @param transactions - 取引履歴
 * @param latestNav - 最新基準価額
 * @returns 保有情報
 */
function calculateHolding(
  fund: Fund,
  transactions: readonly Transaction[],
  latestNav: Nav | null
): Result<Holding, ValidationError>
```

**AverageCostCalculator:**

```typescript
/**
 * 平均取得単価を計算する
 *
 * 計算式: 平均取得単価 = 投資総額 / 保有口数 × 10000
 *
 * @param transactions - 取引履歴
 * @returns 平均取得単価（1万口あたり円）
 */
function calculateAverageCost(
  transactions: readonly Transaction[]
): Result<Money, ValidationError>
```

**計算式:**
| 項目 | 計算式 |
|------|--------|
| 保有口数 | Σ(各取引の取得口数) |
| 投資総額 | Σ(各取引の購入金額) |
| 平均取得単価 | 投資総額 / 保有口数 × 10000 |
| 評価額 | 保有口数 / 10000 × 最新基準価額 |
| 含み損益 | 評価額 - 投資総額 |
| 損益率 | 含み損益 / 投資総額 × 100 |

**端数処理:**
| 項目 | 処理 |
|------|------|
| 平均取得単価 | 四捨五入 |
| 評価額 | 四捨五入 |
| 損益率 | 小数第4位で四捨五入（例: 12.3456% → 12.35%） |

### 2. UseCase層

#### 2.1 getHolding

**入力:** `{ fundId: string }`
**出力:** `{ holding: Holding }`

**処理フロー:**
1. Fund取得
2. 取引履歴取得
3. 最新NAV取得
4. 保有情報計算

#### 2.2 getPortfolioSummary

**入力:** なし
**出力:** `{ portfolio: Portfolio }`

**処理フロー:**
1. 全Fund取得
2. 各Fundの取引・NAV取得
3. 各Fundの保有情報計算
4. ポートフォリオ集計

### 3. Presentation層

#### 3.1 DTO定義

**HoldingResponseDto:**
```typescript
type HoldingResponseDto = {
  fundId: string;
  fundName: string;
  totalUnits: number;
  averageCost: number;
  totalInvestment: number;
  currentNavValue: number | null;
  currentNavDate: string | null;
  currentValue: number | null;
  unrealizedGain: number | null;
  unrealizedGainRate: number | null;  // パーセント（例: 12.35）
};
```

**PortfolioResponseDto:**
```typescript
type PortfolioResponseDto = {
  holdings: HoldingResponseDto[];
  summary: {
    totalInvestment: number;
    totalCurrentValue: number | null;
    totalUnrealizedGain: number | null;
    totalUnrealizedGainRate: number | null;
  };
};
```

#### 3.2 APIエンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/funds/:fundId/holding | 個別保有情報 |
| GET | /api/portfolio | ポートフォリオ全体 |

### 4. 計算例

**入力データ:**
| 日付 | 購入金額 | 手数料 | 基準価額 | 口数 |
|------|---------|--------|---------|------|
| 2024-01-15 | 10,000円 | 0円 | 10,000円 | 10,000口 |
| 2024-02-15 | 10,000円 | 0円 | 11,000円 | 9,090口 |
| 2024-03-15 | 10,000円 | 0円 | 9,000円 | 11,111口 |

**計算結果:**
| 項目 | 計算 | 結果 |
|------|------|------|
| 保有口数 | 10,000 + 9,090 + 11,111 | 30,201口 |
| 投資総額 | 10,000 + 10,000 + 10,000 | 30,000円 |
| 平均取得単価 | 30,000 / 30,201 × 10,000 | 9,933円 |

**最新NAV = 10,500円の場合:**
| 項目 | 計算 | 結果 |
|------|------|------|
| 評価額 | 30,201 / 10,000 × 10,500 | 31,711円 |
| 含み損益 | 31,711 - 30,000 | +1,711円 |
| 損益率 | 1,711 / 30,000 × 100 | +5.70% |

## ディレクトリ構造（完成時）

```
src/
├── domain/
│   ├── holding/
│   │   ├── entities/holding.ts
│   │   ├── services/
│   │   │   ├── holding-calculator.ts
│   │   │   └── average-cost-calculator.ts
│   │   ├── holding.test.ts
│   │   └── index.ts
│   └── portfolio/
│       ├── entities/portfolio.ts
│       ├── portfolio.test.ts
│       └── index.ts
├── usecase/
│   ├── holding/
│   │   ├── get-holding.ts
│   │   ├── holding.integration.test.ts
│   │   └── index.ts
│   └── portfolio/
│       ├── get-portfolio-summary.ts
│       ├── portfolio.integration.test.ts
│       └── index.ts
└── presentation/api/
    ├── dto/
    │   ├── holding-dto.ts
    │   └── portfolio-dto.ts
    └── routes/
        ├── holding-routes.ts
        └── portfolio-routes.ts
```

## テスト

### 単体テスト（Domain層）

**AverageCostCalculator:**
- 単一取引での計算
- 複数取引での平均計算
- 取引なしの場合

**HoldingCalculator:**
- 正常な保有情報計算
- NAVなしの場合（評価額null）
- 端数処理の確認

### 結合テスト（UseCase層）

**getHolding:**
- 正常取得
- 取引なしの場合
- NAVなしの場合

**getPortfolioSummary:**
- 複数銘柄の集計
- 一部NAVなしの銘柄がある場合

## 結合テストシナリオ

### シナリオ: 1年間の積立実行

```typescript
it("1年間の積立実行後、ポートフォリオが正しく計算される", async () => {
  // 準備: 投資信託登録
  const fund = await registerFund({ name: "テストファンド" });

  // 準備: 積立設定（毎月1日、10,000円）
  const recurring = await registerRecurringPurchase({
    fundId: fund.id,
    monthlyAmount: 10000,
    executionDay: 1,
    startDate: "2024-01-01",
  });

  // 準備: 12ヶ月分のNAV登録
  const navValues = [10000, 10500, 9800, 10200, ...]; // 12件
  for (let month = 1; month <= 12; month++) {
    await registerNav({
      fundId: fund.id,
      date: `2024-${String(month).padStart(2, "0")}-01`,
      value: navValues[month - 1],
    });
  }

  // 実行: 12ヶ月分の積立実行
  for (let month = 1; month <= 12; month++) {
    await executeRecurringPurchases({
      targetDate: `2024-${String(month).padStart(2, "0")}-01`,
    });
  }

  // 検証: ポートフォリオ取得
  const portfolio = await getPortfolioSummary();

  // 検証: 投資総額 = 10,000円 × 12ヶ月 = 120,000円
  expect(portfolio.summary.totalInvestment).toBe(120000);

  // 検証: 保有口数の合計が正しい
  const holding = portfolio.holdings[0];
  expect(holding.totalUnits).toBeGreaterThan(0);

  // 検証: 評価額・損益が計算されている
  expect(holding.currentValue).toBeDefined();
  expect(holding.unrealizedGain).toBeDefined();
});
```

## 完了条件

- [ ] `pnpm lint` がエラーなく通る
- [ ] `pnpm test:run` で全テスト合格
- [ ] 個別保有APIが動作する
- [ ] ポートフォリオAPIが動作する
- [ ] 1年間積立シナリオテストが合格
