/**
 * API型定義
 */

// 投資信託
export type Fund = {
  id: string;
  name: string;
  createdAt: string;
};

export type RegisterFundInput = {
  name: string;
};

// 基準価額
export type Nav = {
  fundId: string;
  date: string;
  value: number;
};

export type RegisterNavInput = {
  date: string;
  value: number;
};

// 取引
export type Transaction = {
  id: string;
  fundId: string;
  type: "SPOT_PURCHASE" | "RECURRING_PURCHASE";
  date: string;
  amount: number;
  navValue: number;
  units: number;
  idempotencyKey: string | null;
  createdAt: string;
};

export type ExecuteSpotPurchaseInput = {
  date: string;
  amount: number;
  fee?: number;
};

// 積立設定
export type RecurringPurchase = {
  id: string;
  fundId: string;
  monthlyAmount: number;
  executionDay: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
};

export type RegisterRecurringPurchaseInput = {
  fundId: string;
  monthlyAmount: number;
  executionDay: number;
  startDate: string;
  endDate?: string;
};

export type ExecuteRecurringPurchasesInput = {
  targetDate: string;
};

// 保有情報
export type Holding = {
  fundId: string;
  fundName: string;
  totalUnits: number;
  averageCost: number;
  totalInvestment: number;
  currentNavValue: number | null;
  currentNavDate: string | null;
  currentValue: number | null;
  unrealizedGain: number | null;
  unrealizedGainRate: number | null;
};

// ポートフォリオ
export type Portfolio = {
  holdings: Holding[];
  summary: {
    totalInvestment: number;
    totalCurrentValue: number | null;
    totalUnrealizedGain: number | null;
    totalUnrealizedGainRate: number | null;
  };
};

// エラー
export type ApiError = {
  type: string;
  message: string;
};
