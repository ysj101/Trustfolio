/**
 * 成功・失敗を明示する結果型。
 */
export type Result<T> = { success: true; value: T } | { success: false; error: AppError };

/**
 * APIで返却するエラー情報。
 */
export type AppError = {
  type: 'validation' | 'not_found' | 'conflict' | 'unexpected';
  message: string;
  field?: string;
};

/**
 * 投資信託マスタ。
 */
export type Fund = {
  id: string;
  /** 銘柄名 */
  name: string;
  /**
   * 楽天ファンドID（12桁）。
   * 基準価額の自動取得に使用する。
   * 未設定の場合はnull。
   */
  rakutenFundId: string | null;
  createdAt: string;
};

/**
 * 基準価額履歴。
 */
export type Nav = {
  id: string;
  fundId: string;
  date: string;
  value: number;
  createdAt: string;
};

/**
 * 取引履歴。
 */
export type Transaction = {
  id: string;
  fundId: string;
  type: 'SPOT_PURCHASE' | 'RECURRING_PURCHASE';
  date: string;
  amount: number;
  fee: number;
  navValue: number;
  units: number;
  recurringPurchaseId: string | null;
  idempotencyKey: string | null;
  createdAt: string;
};

/**
 * 積立設定。
 */
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

/**
 * 保有情報。
 */
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

/**
 * ポートフォリオサマリー。
 */
export type Portfolio = {
  totalInvestment: number;
  totalCurrentValue: number | null;
  totalUnrealizedGain: number | null;
  totalUnrealizedGainRate: number | null;
  holdings: Holding[];
};
