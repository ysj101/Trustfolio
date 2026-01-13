import type {
  Holding,
  HoldingWithWeekOverWeek,
  PerformanceRecord,
  Portfolio,
  PortfolioWithWeekOverWeek,
  WeekOverWeekChange,
} from './types';

/**
 * 前週比（差分と変化率）を計算する。
 *
 * @param current - 現在値
 * @param previous - 前週値
 * @returns 前週比情報
 */
export function calculateWeekOverWeekChange(current: number, previous: number): WeekOverWeekChange {
  const difference = current - previous;

  // 前週値が0の場合、変化率は計算できないため0とする
  // （新規購入や初期状態を想定）
  const changeRate = previous !== 0 ? (difference / previous) * 100 : 0;

  return {
    difference,
    changeRate,
  };
}

/**
 * 保有銘柄に前週比情報を追加する。
 *
 * @param holding - 現在の保有情報
 * @param previousRecord - 前週のパフォーマンスレコード（該当銘柄）
 * @returns 前週比付き保有情報
 */
export function enrichHoldingWithWeekOverWeek(
  holding: Holding,
  previousRecord: PerformanceRecord | null
): HoldingWithWeekOverWeek {
  // 前週データが存在しない場合
  if (!previousRecord) {
    return {
      ...holding,
      remainingInvestmentChange: null,
      currentValueChange: null,
      unrealizedGainChange: null,
      unrealizedGainRateChange: null,
      hasPreviousWeekData: false,
    };
  }

  // 残存投資額の前週比を計算
  const remainingInvestmentChange = calculateWeekOverWeekChange(
    holding.remainingInvestment,
    previousRecord.remainingInvestment
  );

  // 評価額の前週比を計算
  // 現在値がnullの場合は前週比も計算できない
  const currentValueChange =
    holding.currentValue !== null
      ? calculateWeekOverWeekChange(holding.currentValue, previousRecord.currentValue)
      : null;

  // 損益の前週比（差分のみ）
  const unrealizedGainChange =
    holding.unrealizedGain !== null ? holding.unrealizedGain - previousRecord.totalGain : null;

  // 損益率の前週比（%ポイント差分のみ）
  const unrealizedGainRateChange =
    holding.unrealizedGainRate !== null
      ? (holding.unrealizedGainRate - previousRecord.unrealizedGainRate) * 100 // 小数からパーセントに変換
      : null;

  return {
    ...holding,
    remainingInvestmentChange,
    currentValueChange,
    unrealizedGainChange,
    unrealizedGainRateChange,
    hasPreviousWeekData: true,
  };
}

/**
 * ポートフォリオ全体に前週比情報を追加する。
 *
 * @param portfolio - 現在のポートフォリオ情報
 * @param previousGlobalRecord - 前週の全体パフォーマンスレコード
 * @param previousFundRecordsMap - 前週の銘柄別パフォーマンスレコードのマップ（fundId → PerformanceRecord）
 * @returns 前週比付きポートフォリオ情報
 */
export function enrichPortfolioWithWeekOverWeek(
  portfolio: Portfolio,
  previousGlobalRecord: PerformanceRecord | null,
  previousFundRecordsMap: Map<string, PerformanceRecord>
): PortfolioWithWeekOverWeek {
  // 前週の全体データが存在しない場合
  if (!previousGlobalRecord) {
    const holdingsWithWoW = portfolio.holdings.map((holding) =>
      enrichHoldingWithWeekOverWeek(holding, null)
    );

    return {
      ...portfolio,
      remainingInvestmentChange: null,
      totalCurrentValueChange: null,
      totalUnrealizedGainChange: null,
      totalUnrealizedGainRateChange: null,
      hasPreviousWeekData: false,
      holdings: holdingsWithWoW,
    };
  }

  // 全体の前週比を計算
  const remainingInvestmentChange = calculateWeekOverWeekChange(
    portfolio.remainingInvestment,
    previousGlobalRecord.remainingInvestment
  );

  const totalCurrentValueChange =
    portfolio.totalCurrentValue !== null
      ? calculateWeekOverWeekChange(portfolio.totalCurrentValue, previousGlobalRecord.currentValue)
      : null;

  const totalUnrealizedGainChange =
    portfolio.totalUnrealizedGain !== null
      ? portfolio.totalUnrealizedGain - previousGlobalRecord.totalGain
      : null;

  const totalUnrealizedGainRateChange =
    portfolio.totalUnrealizedGainRate !== null
      ? (portfolio.totalUnrealizedGainRate - previousGlobalRecord.unrealizedGainRate) * 100
      : null;

  // 銘柄別の前週比を計算
  const holdingsWithWoW = portfolio.holdings.map((holding) => {
    const previousRecord = previousFundRecordsMap.get(holding.fundId) ?? null;
    return enrichHoldingWithWeekOverWeek(holding, previousRecord);
  });

  return {
    ...portfolio,
    remainingInvestmentChange,
    totalCurrentValueChange,
    totalUnrealizedGainChange,
    totalUnrealizedGainRateChange,
    hasPreviousWeekData: true,
    holdings: holdingsWithWoW,
  };
}
