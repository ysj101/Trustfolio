import type { Fund, Holding, Nav, Transaction } from './types';

const UNITS_BASE = 10000;

/**
 * 保有情報を計算する。
 * 取引が存在しない場合はnullを返す。
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
    totalInvestment += transaction.amount;
  });

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
