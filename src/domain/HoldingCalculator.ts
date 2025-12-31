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
    // 売却時は口数を減らす、購入時は口数を増やす
    if (transaction.type === 'REDEMPTION') {
      totalUnits -= transaction.units;
    } else {
      totalUnits += transaction.units;
    }
    // 購入取引のみ投資額に加算（売却時は平均取得単価を維持するため加算しない）
    if (transaction.type === 'SPOT_PURCHASE' || transaction.type === 'RECURRING_PURCHASE') {
      totalInvestment += transaction.amount;
    }
  });

  // 全口数売却済みの場合、保有一覧に表示しない
  if (totalUnits <= 0) {
    return null;
  }

  // 平均取得単価は購入口数のみで計算
  const totalPurchaseUnits = transactions
    .filter((t) => t.type === 'SPOT_PURCHASE' || t.type === 'RECURRING_PURCHASE')
    .reduce((sum, t) => sum + t.units, 0);
  const averageCost =
    totalPurchaseUnits > 0 ? Math.round((totalInvestment / totalPurchaseUnits) * UNITS_BASE) : 0;

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
 *
 * @param holdings 保有情報リスト
 * @param allTransactions すべての取引履歴（実現損益計算のため）
 */
export function calculatePortfolio(
  holdings: Holding[],
  allTransactions: readonly Transaction[]
): {
  totalInvestment: number;
  totalSaleAmount: number;
  realizedGain: number;
  remainingInvestment: number;
  totalCurrentValue: number | null;
  totalUnrealizedGain: number | null;
  totalUnrealizedGainRate: number | null;
  totalGain: number | null;
  totalGainRate: number | null;
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

  // 実現損益と売却金額の計算
  const { realizedGain, totalSaleAmount } = calculateRealizedGain(allTransactions);
  const remainingInvestment = totalInvestment - totalSaleAmount;

  if (hasMissingValue) {
    return {
      totalInvestment,
      totalSaleAmount,
      realizedGain,
      remainingInvestment,
      totalCurrentValue: null,
      totalUnrealizedGain: null,
      totalUnrealizedGainRate: null,
      totalGain: null,
      totalGainRate: null,
    };
  }

  const totalUnrealizedGain = totalCurrentValue - remainingInvestment;
  const totalUnrealizedGainRate =
    remainingInvestment > 0
      ? Math.round((totalUnrealizedGain / remainingInvestment) * 10000) / 10000
      : 0;

  const totalGain = realizedGain + totalUnrealizedGain;
  const totalGainRate =
    totalInvestment > 0 ? Math.round((totalGain / totalInvestment) * 10000) / 10000 : 0;

  return {
    totalInvestment,
    totalSaleAmount,
    realizedGain,
    remainingInvestment,
    totalCurrentValue,
    totalUnrealizedGain,
    totalUnrealizedGainRate,
    totalGain,
    totalGainRate,
  };
}

/**
 * 実現損益と売却金額を計算する。
 *
 * 実現損益 = Σ(売却金額 - 売却口数 × 平均取得単価)
 *
 * 簡易計算として、以下の方法を採用:
 * 1. 全購入取引から平均取得単価を計算
 * 2. 各売却取引について、売却金額 - (売却口数 × 平均取得単価) を計算
 * 3. それらの合計が実現損益
 *
 * ※ amountは売却口数×基準価額で既に計算済み
 * ※ 平均取得単価との差額が実現損益となる
 */
function calculateRealizedGain(transactions: readonly Transaction[]): {
  realizedGain: number;
  totalSaleAmount: number;
} {
  let totalSaleAmount = 0;
  let totalPurchaseAmount = 0;

  // FIFO（先入先出）で売却口数に対応する購入額を計算
  const purchaseTransactions = transactions.filter(
    (t) => t.type === 'SPOT_PURCHASE' || t.type === 'RECURRING_PURCHASE'
  );
  const saleTransactions = transactions.filter((t) => t.type === 'REDEMPTION');

  saleTransactions.forEach((sale) => {
    const saleUnits = Math.abs(sale.units);
    totalSaleAmount += Math.abs(sale.amount);

    // この売却に対応する購入原価を計算（簡易版：平均取得単価を使用）
    const totalPurchaseUnits = purchaseTransactions.reduce((sum: number, t) => sum + t.units, 0);
    const totalPurchaseValue = purchaseTransactions.reduce((sum: number, t) => sum + t.amount, 0);
    const averageCost = totalPurchaseUnits > 0 ? totalPurchaseValue / totalPurchaseUnits : 0;

    totalPurchaseAmount += saleUnits * averageCost;
  });

  // 実現損益 = 売却金額 - 売却に対応する購入原価
  const realizedGain = Math.round(totalSaleAmount - totalPurchaseAmount);
  return { realizedGain, totalSaleAmount: Math.round(totalSaleAmount) };
}
