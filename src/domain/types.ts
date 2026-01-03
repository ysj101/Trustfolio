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
  /**
   * 約定までの営業日数。
   * 積立の約定日計算に使用する。
   * 未設定の場合はnull。
   */
  settlementBusinessDays: number | null;
  createdAt: string;
};

/**
 * 基準価額履歴。
 */
export type Nav = {
  fundId: string;
  date: string;
  value: number;
  createdAt: string;
};

/**
 * 取引履歴。
 *
 * 購入時:
 * - amount: 購入金額（円）
 * - navValue: 適用基準価額（円/1万口）
 * - units: 取得口数（正の値）
 *
 * 売却時:
 * - amount: 売却金額（円）※売却口数×基準価額で計算された金額
 * - navValue: 適用基準価額（円/1万口）
 * - units: 売却口数（正の値、計算時にtypeで判別して減算）
 */
export type Transaction = {
  id: string;
  fundId: string;
  type: 'SPOT_PURCHASE' | 'RECURRING_PURCHASE' | 'REDEMPTION';
  date: string;
  amount: number;
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
  totalSaleAmount: number;
  remainingInvestment: number;
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
  /** 累計投入額（購入のみの合計） */
  totalInvestment: number;
  /** 売却総額（売却金額の合計） */
  totalSaleAmount: number;
  /** 実現損益（売却による確定損益） */
  realizedGain: number;
  /** 残存投資額（購入金額 - 売却金額） */
  remainingInvestment: number;
  /** 評価額（現在の保有分） */
  totalCurrentValue: number | null;
  /** 未実現損益（評価額 - 残存投資額） */
  totalUnrealizedGain: number | null;
  /** 未実現損益率 */
  totalUnrealizedGainRate: number | null;
  /** 総損益（実現損益 + 未実現損益） */
  totalGain: number | null;
  /** 総損益率 */
  totalGainRate: number | null;
  holdings: Holding[];
};

/**
 * 実績記録。
 * ファンドごとまたは全体の日次実績を記録する。
 */
export type PerformanceRecord = {
  /** ファンドID（全体実績の場合は空文字列） */
  fundId: string;
  /** 記録日付（YYYY-MM-DD形式） */
  date: string;
  /** 保有口数 */
  totalUnits: number;
  /** 残存投資額（累計投資額 - 売却金額） */
  remainingInvestment: number;
  /** 評価額（現在の保有口数 × 基準価格） */
  currentValue: number;
  /** 損益（評価額 - 残存投資額） */
  totalGain: number;
  /** 未実現損益率 */
  unrealizedGainRate: number;
  /** 作成日時 */
  createdAt: string;
};
