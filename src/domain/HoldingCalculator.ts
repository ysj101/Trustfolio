import type { Fund, Holding, Nav, Transaction } from './types';

const UNITS_BASE = 10000;

/**
 * 保有情報を計算する。
 * 取引が存在しない場合、または全口数売却済みの場合はnullを返す。
 *
 * 注意事項:
 * - 購入取引（SPOT_PURCHASE, RECURRING_PURCHASE）のみtotalInvestmentに加算
 * - 売却取引（REDEMPTION）はtotalInvestmentに影響しない（平均取得単価を維持）
 * - unitsは購入時は正、売却時は負の値
 *
 * 全売却後の動作:
 * - totalUnits <= 0 の場合、nullを返す
 * - これにより、全口数売却済みの銘柄は保有一覧に表示されなくなる
 * - 取引履歴は保持されるため、過去の売買履歴は参照可能
 */
export function calculateHolding(
  fund: Fund,
  transactions: readonly Transaction[],
  latestNav: Nav | null
): Holding | null {
  if (transactions.length === 0) {
    return null;
  }

  let totalUnits = 0;
  let totalInvestment = 0;

  transactions.forEach((transaction) => {
    totalUnits += transaction.units;
    // 購入取引のみ投資額に加算（売却時は平均取得単価を維持するため加算しない）
    if (transaction.type === 'SPOT_PURCHASE' || transaction.type === 'RECURRING_PURCHASE') {
      totalInvestment += transaction.amount;
    }
  });

  // 全口数売却済みの場合、保有一覧に表示しない
  if (totalUnits <= 0) {
    return null;
  }

  const averageCost = Math.round((totalInvestment / totalUnits) * UNITS_BASE);

  if (latestNav === null) {
    return {
      fundId: fund.id,
      fundName: fund.name,
      totalUnits,
      averageCost,
      totalInvestment,
      currentNavValue: null,
      currentNavDate: null,
      currentValue: null,
      unrealizedGain: null,
      unrealizedGainRate: null,
    };
  }

  const currentValue = Math.round((totalUnits / UNITS_BASE) * latestNav.value);
  const unrealizedGain = currentValue - totalInvestment;
  const unrealizedGainRate =
    totalInvestment > 0 ? Math.round((unrealizedGain / totalInvestment) * 10000) / 10000 : 0;

  return {
    fundId: fund.id,
    fundName: fund.name,
    totalUnits,
    averageCost,
    totalInvestment,
    currentNavValue: latestNav.value,
    currentNavDate: latestNav.date,
    currentValue,
    unrealizedGain,
    unrealizedGainRate,
  };
}

/**
 * ポートフォリオサマリーを計算する。
 */
export function calculatePortfolio(holdings: Holding[]): {
  totalInvestment: number;
  totalCurrentValue: number | null;
  totalUnrealizedGain: number | null;
  totalUnrealizedGainRate: number | null;
} {
  let totalInvestment = 0;
  const hasMissingValue = holdings.some((holding) => holding.currentValue === null);

  let totalCurrentValue = 0;

  holdings.forEach((holding) => {
    totalInvestment += holding.totalInvestment;
    if (holding.currentValue !== null) {
      totalCurrentValue += holding.currentValue;
    }
  });

  if (hasMissingValue) {
    return {
      totalInvestment,
      totalCurrentValue: null,
      totalUnrealizedGain: null,
      totalUnrealizedGainRate: null,
    };
  }

  const totalUnrealizedGain = totalCurrentValue - totalInvestment;
  const totalUnrealizedGainRate =
    totalInvestment > 0 ? Math.round((totalUnrealizedGain / totalInvestment) * 10000) / 10000 : 0;

  return {
    totalInvestment,
    totalCurrentValue,
    totalUnrealizedGain,
    totalUnrealizedGainRate,
  };
}
