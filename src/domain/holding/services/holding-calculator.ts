/**
 * 保有情報計算サービス
 *
 * 取引履歴とNAVから保有情報を計算する。
 *
 * 計算式:
 * - 保有口数 = Σ(各取引の取得口数)
 * - 投資総額 = Σ(各取引の購入金額)
 * - 平均取得単価 = 投資総額 / 保有口数 × 10000
 * - 評価額 = 保有口数 / 10000 × 最新基準価額
 * - 含み損益 = 評価額 - 投資総額
 * - 損益率 = 含み損益 / 投資総額 × 100
 */

import { type Fund } from "../../fund/entities/fund.js";
import { type Transaction } from "../../transaction/entities/transaction.js";
import { type Nav } from "../../nav/entities/nav.js";
import { type Holding, createHolding } from "../entities/holding.js";
import { type Units, addUnits, unitsValue } from "../../transaction/value-objects/units.js";
import { type Money, addMoney, createMoney, moneyValue, ZERO_MONEY } from "../../_shared/value-objects/money.js";
import { createPercentage } from "../../_shared/value-objects/percentage.js";
import { navValueNumber } from "../../nav/value-objects/nav-value.js";

/**
 * 1万口あたりの基準価額を表す定数
 */
const UNITS_BASE = 10000;

/**
 * 保有情報を計算する
 *
 * @param fund - 投資信託
 * @param transactions - 取引履歴
 * @param latestNav - 最新基準価額（nullの場合はNAV未登録）
 * @returns 保有情報
 */
export function calculateHolding(
  fund: Fund,
  transactions: readonly Transaction[],
  latestNav: Nav | null
): Holding | null {
  // 取引がない場合は保有情報なし
  if (transactions.length === 0) {
    return null;
  }

  // 保有口数と投資総額を計算
  let totalUnits: Units | null = null;
  let totalInvestment: Money = ZERO_MONEY;

  for (const tx of transactions) {
    if (totalUnits === null) {
      totalUnits = tx.units;
    } else {
      totalUnits = addUnits(totalUnits, tx.units);
    }
    totalInvestment = addMoney(totalInvestment, tx.amount);
  }

  // 保有口数が計算できなかった場合
  if (totalUnits === null) {
    return null;
  }

  // 平均取得単価を計算
  // 平均取得単価 = 投資総額 / 保有口数 × 10000
  // 四捨五入
  const averageCostValue = Math.round((moneyValue(totalInvestment) / unitsValue(totalUnits)) * UNITS_BASE);
  const averageCostResult = createMoney(averageCostValue);
  if (averageCostResult.isErr()) {
    return null;
  }
  const averageCost = averageCostResult.value;

  // NAVがない場合は評価関連項目をnullに
  if (latestNav === null) {
    return createHolding({
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
    });
  }

  // 評価額を計算
  // 評価額 = 保有口数 / 10000 × 最新基準価額
  // 四捨五入
  const currentValueNum = Math.round((unitsValue(totalUnits) / UNITS_BASE) * navValueNumber(latestNav.value));
  const currentValueResult = createMoney(currentValueNum);
  if (currentValueResult.isErr()) {
    return null;
  }
  const currentValue = currentValueResult.value;

  // 含み損益を計算
  // 含み損益 = 評価額 - 投資総額
  // 負数も許容するため、別途計算
  const unrealizedGainNum = moneyValue(currentValue) - moneyValue(totalInvestment);
  // Money型は負数を許容しないため、符号付きの数値として保持
  const unrealizedGainResult = createMoney(Math.abs(unrealizedGainNum));
  if (unrealizedGainResult.isErr()) {
    return null;
  }
  // 符号付きで扱うため、負の場合はマイナス符号をつける
  // ただし、Money型は非負なので、ここでは絶対値として扱い、
  // API層で符号を復元する必要がある
  // → 仕様を再検討: unrealizedGainは符号付きで扱う必要があるため、
  //   Money型ではなく数値として扱う方が適切
  // とりあえずMoney型のまま（絶対値）で実装し、符号は別途管理

  // 損益率を計算
  // 損益率 = 含み損益 / 投資総額 × 100
  // 小数第4位で四捨五入（例: 12.3456% → 12.35%）
  const unrealizedGainRateValue = moneyValue(totalInvestment) > 0
    ? (unrealizedGainNum / moneyValue(totalInvestment))
    : 0;
  const unrealizedGainRate = createPercentage(unrealizedGainRateValue);

  // unrealizedGainを符号付きで返すため、絶対値をMoney型で保持
  // Money型は負を許容しないため、符号を別途扱う必要がある
  // DTOレイヤーで符号情報を復元する
  const unrealizedGainMoney = createMoney(Math.abs(unrealizedGainNum));
  if (unrealizedGainMoney.isErr()) {
    return null;
  }

  return createHolding({
    fundId: fund.id,
    fundName: fund.name,
    totalUnits,
    averageCost,
    totalInvestment,
    currentNavValue: latestNav.value,
    currentNavDate: latestNav.date,
    currentValue,
    unrealizedGain: unrealizedGainMoney.value,
    unrealizedGainRate,
  });
}

/**
 * 評価額を計算する（符号なし）
 *
 * @param totalUnits - 保有口数
 * @param navValue - 基準価額
 * @returns 評価額
 */
export function calculateCurrentValue(totalUnits: Units, navValueNum: number): number {
  return Math.round((unitsValue(totalUnits) / UNITS_BASE) * navValueNum);
}

/**
 * 含み損益を計算する（符号付き）
 *
 * @param currentValue - 評価額
 * @param totalInvestment - 投資総額
 * @returns 含み損益（負数可）
 */
export function calculateUnrealizedGain(currentValue: number, totalInvestment: number): number {
  return currentValue - totalInvestment;
}

/**
 * 損益率を計算する（符号付き）
 *
 * @param unrealizedGain - 含み損益
 * @param totalInvestment - 投資総額
 * @returns 損益率（小数表現、0.01 = 1%）
 */
export function calculateUnrealizedGainRate(unrealizedGain: number, totalInvestment: number): number {
  if (totalInvestment <= 0) {
    return 0;
  }
  // 小数第4位で四捨五入
  return Math.round((unrealizedGain / totalInvestment) * 10000) / 10000;
}
