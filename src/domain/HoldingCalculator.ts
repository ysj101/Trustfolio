import type { Fund, Holding, Nav, Transaction } from './types';

const UNITS_BASE = 10000;

/**
 * 取引を日付昇順にソートする（同日はcreatedAt昇順）。
 *
 * 移動平均法の計算は取引の処理順序に依存するため、
 * 計算の前に必ず日付昇順に並べ替える必要がある。
 * TransactionRepositoryは日付降順で取引を返すため、この関数で並び替えを行う。
 *
 * @param transactions ソート対象の取引リスト
 * @returns 新しい配列（元の配列は変更しない）。日付昇順、同日はcreatedAt昇順でソート済み
 */
function sortTransactionsByDate(transactions: readonly Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

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
 * 計算精度:
 * - 売却時の除算（bookValue / totalUnits）で浮動小数点誤差が発生し、取引数に応じて蓄積する
 * - 最終値にMath.roundを適用するため、誤差は1円未満に収まる
 * - 入力値（amount, units）は整数のため、購入のみの場合は誤差なし
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

  const sorted = sortTransactionsByDate(transactions);

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

  // 移動平均法による平均取得単価と残存投資額（丸めにより浮動小数点誤差を1円未満に抑制）
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
  totalTax: number;
  realizedGainAfterTax: number;
  taxUnrecordedSaleCount: number;
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
  // 税額未記録のnullは0円と同一視せず、記録済みの数値だけを合算する。
  // 未記録の売却件数（taxUnrecordedSaleCount）を併せて算出し、
  // 「税引後実現損益が完全な値かどうか」を表示側で判断できるようにする。
  let totalTaxRaw = 0;
  let taxUnrecordedSaleCount = 0;
  allTransactions.forEach((transaction) => {
    if (transaction.type !== 'REDEMPTION') {
      return;
    }
    if (transaction.incomeTax === null || transaction.residentTax === null) {
      taxUnrecordedSaleCount += 1;
    }
    totalTaxRaw +=
      (transaction.incomeTax !== null ? transaction.incomeTax : 0) +
      (transaction.residentTax !== null ? transaction.residentTax : 0);
  });
  const totalTax = Math.round(totalTaxRaw);
  // 丸め後の totalTax を控除することで「realizedGainAfterTax = realizedGain - totalTax」の
  // 契約を小数税額の場合でも厳密に成立させる（realizedGain は calculateRealizedGain で丸め済み）。
  const realizedGainAfterTax = realizedGain - totalTax;
  // 各holdingの残存投資額（移動平均簿価）を合算
  const remainingInvestment = holdings.reduce((sum, h) => sum + h.remainingInvestment, 0);

  if (hasMissingValue) {
    return {
      totalInvestment,
      totalSaleAmount,
      realizedGain,
      totalTax,
      realizedGainAfterTax,
      taxUnrecordedSaleCount,
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

  // 総損益は記録済み税額を控除した実現損益（realizedGainAfterTax）をベースにする。
  // issue #20「パフォーマンス計算に税金を反映」の要件に対応し、税引前の realizedGain は
  // 参考情報としてフィールドに残す。
  const totalGain = realizedGainAfterTax + totalUnrealizedGain;
  const totalGainRate =
    totalInvestment > 0 ? Math.round((totalGain / totalInvestment) * 10000) / 10000 : 0;

  return {
    totalInvestment,
    totalSaleAmount,
    realizedGain,
    totalTax,
    realizedGainAfterTax,
    taxUnrecordedSaleCount,
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
 *
 * @param transactions 同一ファンドIDの取引リスト（異なるファンドの取引を混在させてはならない）
 * @returns 実現損益と売却金額のオブジェクト（いずれも未丸めの浮動小数点値）
 * @remarks
 *   - 戻り値は丸め処理前の浮動小数点値。呼び出し元（calculateRealizedGain）で合算後に丸める。
 *     これにより小計ごとの丸め誤差が累積することを防ぐ。
 *   - 売却時の除算（bookValue / units）で浮動小数点誤差が発生するが、
 *     最終的にMath.roundを適用するため誤差は1円未満に収まる。
 */
function calculateRealizedGainForFund(transactions: readonly Transaction[]): {
  realizedGain: number;
  totalSaleAmount: number;
} {
  const sorted = sortTransactionsByDate(transactions);

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
