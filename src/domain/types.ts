/**
 * 失敗を表す {@link Result} のブランチ（`success: false` 側）。
 *
 * {@link Result} の失敗ブランチは型パラメータ `T` に依存せず常に同一構造であるため、
 * 名前付きの型として切り出し、{@link Result} の定義とエラー伝播ヘルパーの双方から参照する。
 */
export type FailureResult = { success: false; error: AppError };

/**
 * 成功・失敗を明示する結果型。
 */
export type Result<T> = { success: true; value: T } | FailureResult;

/**
 * APIで返却するエラー情報。
 */
export type AppError = {
  type: 'validation' | 'not_found' | 'conflict' | 'unexpected';
  message: string;
  field?: string;
};

/**
 * 銘柄に設定できる資産クラスの許可集合。
 * 実行時検証と型定義が乖離しないよう、この配列を唯一の定義源とする。
 */
export const ASSET_CLASSES = ['equity', 'gold'] as const;

/**
 * 銘柄が属する資産の種類。
 * `equity`は株式、`gold`は金を表す。
 */
export type AssetClass = (typeof ASSET_CLASSES)[number];

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
   * NAV取得元種別。
   * `wealthadvisor`はWealth Advisorから取得することを表す。
   * nullはwealthadvisor以外であり、楽天ファンドIDによる楽天証券からの取得、または取得元未設定を表す。
   */
  navSource: 'wealthadvisor' | null;
  /**
   * {@link Fund.navSource}で使用する取得元コード。
   * Wealth Advisorの場合は`<company>/<pageId>`形式で保持し、取得元未設定の場合はnullとする。
   */
  navSourceCode: string | null;
  /**
   * 銘柄が属する資産クラス。
   * nullは資産クラス導入前に登録され、現在も未設定であることを表す。
   */
  assetClass: AssetClass | null;
  /**
   * 約定までの営業日数。
   * 積立の約定日計算に使用する。
   * 未設定の場合はnull。
   */
  settlementBusinessDays: number | null;
  createdAt: string;
};

/**
 * NAV取得元から抽出した基準価額データ。
 * 基準価額の単位は円/1万口とし、日付はYYYY-MM-DD形式で保持する。
 */
export type FetchedNavData = {
  /** 基準価額の日付（YYYY-MM-DD形式）。 */
  date: string;
  /** 基準価額（円/1万口）。 */
  value: number;
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
 * - incomeTax: 所得税・復興特別所得税の源泉徴収額（0以上）。未記録の既存行はnull
 * - residentTax: 住民税の源泉徴収額（0以上）。未記録の既存行はnull
 *
 * 購入時の incomeTax / residentTax は常にnullとする。
 * 売却時のnullは「税額未記録」を表し、明示的に記録した0円とは同一視しない。
 */
export type Transaction = {
  id: string;
  fundId: string;
  type: 'SPOT_PURCHASE' | 'RECURRING_PURCHASE' | 'REDEMPTION';
  date: string;
  amount: number;
  navValue: number;
  units: number;
  incomeTax: number | null;
  residentTax: number | null;
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
  /** 銘柄の資産クラス。nullは未設定を表す。 */
  assetClass: AssetClass | null;
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
 * ポートフォリオの集計値。
 *
 * 全体ポートフォリオ（{@link Portfolio}）と資産クラス別サマリー（{@link AssetClassSummary}）で
 * 同じ定義・同じ丸め・同じ null 不変条件を共有するため、集計フィールドを本型に一元化する。
 * `calculatePortfolio`（src/domain/HoldingCalculator.ts）の戻り値型でもある。
 */
export type PortfolioTotals = {
  /** 累計投入額（購入のみの合計） */
  totalInvestment: number;
  /** 売却総額（売却金額の合計） */
  totalSaleAmount: number;
  /** 実現損益（売却による確定損益） */
  realizedGain: number;
  /** 記録済みの売却税額合計。null（税額未記録）の取引は加算対象外とする。 */
  totalTax: number;
  /**
   * 税引後実現損益（realizedGain - totalTax）。
   * taxUnrecordedSaleCount が 1 以上の場合、未記録の税額は控除されていないため
   * 完全な税引後の値ではない点に注意する。
   */
  realizedGainAfterTax: number;
  /**
   * 税額未記録（incomeTax または residentTax が null）の売却取引件数。
   * 表示側はこの件数を用いて、税引後実現損益が完全な値かどうかを注記する。
   */
  taxUnrecordedSaleCount: number;
  /** 残存投資額（移動平均簿価: 保有口数分の取得原価合計） */
  remainingInvestment: number;
  /** 評価額（現在の保有分） */
  totalCurrentValue: number | null;
  /** 未実現損益（評価額 - 残存投資額） */
  totalUnrealizedGain: number | null;
  /** 未実現損益率 */
  totalUnrealizedGainRate: number | null;
  /**
   * 総損益（税引後実現損益 + 未実現損益）。
   * 記録済みの売却税額を控除した realizedGainAfterTax をベースにするため、
   * taxUnrecordedSaleCount が 1 以上の場合は未記録税額分だけ過大な参考値になる。
   */
  totalGain: number | null;
  /** 総損益率 */
  totalGainRate: number | null;
};

/** 全体ポートフォリオの集計値と保有銘柄を含むサマリー。 */
export type Portfolio = PortfolioTotals & {
  /** 資産クラス別のポートフォリオサマリー。定義順は株式、金、未設定。 */
  assetClassSummaries: AssetClassSummary[];
  holdings: Holding[];
};

/**
 * 資産クラス別のポートフォリオサマリー。
 *
 * 全体ポートフォリオと同じ計算項目を資産クラス単位で保持し、画面と週次レポートで
 * 同じ値を表示する。`assetClass` が null の場合は、銘柄マスタの未設定を表す。
 */
export type AssetClassSummary = PortfolioTotals & {
  /** 資産クラス。nullは未設定を表す。 */
  assetClass: AssetClass | null;
  /** 区分に属する保有銘柄数。全口数売却済み銘柄は含めない。 */
  holdingCount: number;
  /** 全体評価額に対する評価額構成比。当該区分または全体の評価額がnullならnull、全体評価額が0なら0、小数4桁丸め（0.1234 = 12.34%）。 */
  allocationRate: number | null;
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
  /** 残存投資額（移動平均簿価: 保有口数分の取得原価合計） */
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

/**
 * クライアント向けのポートフォリオパフォーマンス履歴データ型。
 */
export type PortfolioPerformanceHistory = {
  date: string;
  remainingInvestment: number;
  currentValue: number;
  totalGain: number;
  unrealizedGainRate: number;
};

/**
 * 前週比情報。
 * 差分と変化率を保持する。
 */
export type WeekOverWeekChange = {
  /** 差分（現在値 - 前週値）、円単位 */
  difference: number;
  /** 変化率（(現在値 - 前週値) / 前週値 × 100）、%単位 */
  changeRate: number;
};

/**
 * 前週比付き保有情報。
 * Holding型に前週比情報を追加したもの。
 */
export type HoldingWithWeekOverWeek = Holding & {
  /** 残存投資額の前週比 */
  remainingInvestmentChange: WeekOverWeekChange | null;
  /** 評価額の前週比 */
  currentValueChange: WeekOverWeekChange | null;
  /** 損益の前週比（差分のみ、円単位） */
  unrealizedGainChange: number | null;
  /** 損益率の前週比（%ポイント差分のみ） */
  unrealizedGainRateChange: number | null;
  /** 前週のデータが存在するか */
  hasPreviousWeekData: boolean;
};

/**
 * 前週比付きポートフォリオ情報。
 * Portfolio型に前週比情報を追加したもの。
 */
export type PortfolioWithWeekOverWeek = Omit<Portfolio, 'holdings'> & {
  /** 残存投資額の前週比 */
  remainingInvestmentChange: WeekOverWeekChange | null;
  /** 評価額の前週比 */
  totalCurrentValueChange: WeekOverWeekChange | null;
  /** 損益の前週比（差分のみ、円単位） */
  totalUnrealizedGainChange: number | null;
  /** 損益率の前週比（%ポイント差分のみ） */
  totalUnrealizedGainRateChange: number | null;
  /** 前週のデータが存在するか */
  hasPreviousWeekData: boolean;
  /** 保有銘柄一覧（前週比付き） */
  holdings: HoldingWithWeekOverWeek[];
};

/**
 * 市場指数データ。
 * S&P500およびNASDAQ Compositeの終値を記録する。
 */
export type MarketIndex = {
  /** 記録日付（YYYY-MM-DD形式、米国市場日付） */
  date: string;
  /** S&P500指数終値 */
  sp500: number;
  /** NASDAQ Composite指数終値 */
  nasdaq: number;
  /** レコード作成日時 */
  createdAt: string;
};
