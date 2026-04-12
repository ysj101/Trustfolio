import type { Fund, Holding, Nav, Transaction } from './types';

const UNITS_BASE = 10000;

/**
 * 保有情報を計算する（移動平均法）。
 * 取引を日付昇順に処理し、簿価・平均取得単価を逐次更新する。
 * 取引が存在しない場合、または全口数売却済みの場合はnullを返す。
 *
 * 移動平均法:
 * - 購入時: 簿価に購入額を加算、口数を加算
 * - 売却時: その時点の平均原価で簿価を減算、口数を減算
 * - 残存投資額 = 最終簿価（保有口数分の取得原価合計）
 * - 平均取得単価 = 簿価 / 保有口数 × UNITS_BASE
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

  // 取引を日付昇順にソート（同日はcreatedAt順）
  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });

  let totalUnits = 0;
  let bookValue = 0; // 残存簿価（移動平均原価ベース）
  let totalInvestment = 0; // 累計購入額（情報表示用）
  let totalSaleAmount = 0; // 売却総額（情報表示用）

  sorted.forEach((transaction) => {
    if (transaction.type === 'REDEMPTION') {
      // 売却時: その時点の移動平均原価で簿価を減算
      const avgCostPerUnit = totalUnits > 0 ? bookValue / totalUnits : 0;
      const costOfSale = transaction.units * avgCostPerUnit;
      bookValue -= costOfSale;
      totalUnits -= transaction.units;
      totalSaleAmount += Math.abs(transaction.amount);
    } else {
      // 購入時: 簿価と口数を加算
      bookValue += transaction.amount;
      totalUnits += transaction.units;
      totalInvestment += transaction.amount;
    }
  });

  // 全口数売却済みの場合、保有一覧に表示しない
  if (totalUnits <= 0) {
    return null;
  }

  // 移動平均法による平均取得単価と残存投資額
  const averageCost = Math.round((bookValue / totalUnits) * UNITS_BASE);
  const remainingInvestment = Math.round(bookValue);

  if (latestNav === null) {
    return {
      fundId: fund.id,
      fundName: fund.name,
      totalUnits,
      averageCost,
      totalInvestment,
      totalSaleAmount,
      remainingInvestment,
      currentNavValue: null,
      currentNavDate: null,
      currentValue: null,
      unrealizedGain: null,
      unrealizedGainRate: null,
    };
  }

  const currentValue = Math.round((totalUnits / UNITS_BASE) * latestNav.value);
  // 損益は残存投資額（移動平均簿価）を基準に算出する
  const unrealizedGain = currentValue - remainingInvestment;
  const unrealizedGainRate =
    remainingInvestment > 0
      ? Math.round((unrealizedGain / remainingInvestment) * 10000) / 10000
      : 0;

  return {
    fundId: fund.id,
    fundName: fund.name,
    totalUnits,
    averageCost,
    totalInvestment,
    totalSaleAmount,
    remainingInvestment,
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
  // 各holdingの残存投資額（移動平均簿価）を合算
  const remainingInvestment = holdings.reduce((sum, h) => sum + h.remainingInvestment, 0);

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
 * 実現損益と売却金額を計算する（移動平均法）。
 *
 * 取引をファンドIDごとにグループ化し、各ファンドで独立して移動平均法を適用する。
 * 実現損益 = Σ(売却金額 - 売却口数 × その時点のファンド別移動平均原価)
 *
 * ファンドIDで分離する理由:
 * - 全取引を混在させて計算すると、異なるファンドの口数・簿価が混ざってしまう
 * - 例: ファンドAを安値購入、ファンドBを高値購入の後にファンドAを売却すると、
 *   本来より高い平均原価が適用されて実現損益が過小計算される
 */
function calculateRealizedGain(transactions: readonly Transaction[]): {
  realizedGain: number;
  totalSaleAmount: number;
} {
  // ファンドIDごとにグループ化
  const byFund = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const existing = byFund.get(tx.fundId);
    if (existing !== undefined) {
      existing.push(tx);
    } else {
      byFund.set(tx.fundId, [tx]);
    }
  }

  // 各ファンドで独立して実現損益を計算し合算
  let totalRealizedGain = 0;
  let totalSaleAmount = 0;

  for (const fundTransactions of byFund.values()) {
    const result = calculateRealizedGainForFund(fundTransactions);
    totalRealizedGain += result.realizedGain;
    totalSaleAmount += result.totalSaleAmount;
  }

  return {
    realizedGain: Math.round(totalRealizedGain),
    totalSaleAmount: Math.round(totalSaleAmount),
  };
}

/**
 * 単一ファンドの取引から実現損益と売却金額を計算する（移動平均法）。
 *
 * 取引を日付昇順に処理し、各売却時点の移動平均原価で売却原価を算出する。
 * 実現損益 = Σ(売却金額 - 売却口数 × その時点の移動平均原価)
 */
function calculateRealizedGainForFund(transactions: readonly Transaction[]): {
  realizedGain: number;
  totalSaleAmount: number;
} {
  // 取引を日付昇順にソート（同日はcreatedAt順）
  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });

  let units = 0;
  let bookValue = 0;
  let realizedGain = 0;
  let totalSaleAmount = 0;

  sorted.forEach((tx) => {
    if (tx.type === 'REDEMPTION') {
      // 売却時: その時点の移動平均原価で売却原価を算出
      const avgCostPerUnit = units > 0 ? bookValue / units : 0;
      const costOfSale = tx.units * avgCostPerUnit;
      realizedGain += Math.abs(tx.amount) - costOfSale;
      bookValue -= costOfSale;
      units -= tx.units;
      totalSaleAmount += Math.abs(tx.amount);
    } else {
      // 購入時: 簿価と口数を加算
      bookValue += tx.amount;
      units += tx.units;
    }
  });

  return {
    realizedGain,
    totalSaleAmount,
  };
}
