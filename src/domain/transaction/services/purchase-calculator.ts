/**
 * 購入計算サービス
 *
 * 投資信託の購入口数を計算する。
 *
 * 計算式: 口数 = (購入金額 - 手数料) / 基準価額 × 10000
 * 端数処理: 切り捨て
 */

import { type Result, err } from "neverthrow";
import { type Money, moneyValue, subtractMoney } from "../../_shared/value-objects/money.js";
import { type NavValue, navValueNumber } from "../../nav/value-objects/nav-value.js";
import { type Units, createUnits } from "../value-objects/units.js";
import { type ValidationError, createValidationError } from "../../../shared/errors/base-error.js";

/**
 * 1万口あたりの基準価額を表す定数
 * 基準価額は1万口あたりで表示されるため
 */
const UNITS_BASE = 10000;

/**
 * 購入口数を計算する
 *
 * 計算式: 口数 = (購入金額 - 手数料) / 基準価額 × 10000
 * 端数処理: 切り捨て
 *
 * @param amount - 購入金額（円）
 * @param fee - 手数料（円）
 * @param navValue - 基準価額（1万口あたり円）
 * @returns 成功時は取得口数、失敗時はValidationError
 *
 * @example
 * ```typescript
 * // 10,000円で基準価額10,000円の場合
 * const result = calculateUnits(
 *   createMoney(10000),
 *   createMoney(0),
 *   createNavValue(10000)
 * );
 * // → 10,000口
 *
 * // 10,000円で手数料100円、基準価額10,000円の場合
 * const result2 = calculateUnits(
 *   createMoney(10000),
 *   createMoney(100),
 *   createNavValue(10000)
 * );
 * // → 9,900口
 *
 * // 33,333円で基準価額12,345円の場合
 * const result3 = calculateUnits(
 *   createMoney(33333),
 *   createMoney(0),
 *   createNavValue(12345)
 * );
 * // → 27,001口（切り捨て）
 * ```
 */
export function calculateUnits(
  amount: Money,
  fee: Money,
  navValue: NavValue
): Result<Units, ValidationError> {
  // 手数料を引いた実質投資金額を計算
  const netAmountResult = subtractMoney(amount, fee);
  if (netAmountResult.isErr()) {
    return err(createValidationError(
      "手数料が購入金額を超えています",
      "fee"
    ));
  }

  const netAmount = netAmountResult.value;
  if (moneyValue(netAmount) <= 0) {
    return err(createValidationError(
      "購入金額から手数料を引いた金額は正の値である必要があります",
      "amount"
    ));
  }

  const navValueNum = navValueNumber(navValue);
  if (navValueNum <= 0) {
    return err(createValidationError(
      "基準価額は正の値である必要があります",
      "navValue"
    ));
  }

  // 口数計算: (購入金額 - 手数料) / 基準価額 × 10000
  // 切り捨て
  const units = Math.floor((moneyValue(netAmount) / navValueNum) * UNITS_BASE);

  if (units <= 0) {
    return err(createValidationError(
      "計算された口数が0以下です。購入金額が少なすぎます",
      "amount"
    ));
  }

  return createUnits(units);
}

/**
 * 保有口数から評価額を計算する
 *
 * 計算式: 評価額 = 保有口数 / 10000 × 基準価額
 * 端数処理: 四捨五入
 *
 * @param units - 保有口数
 * @param navValue - 基準価額（1万口あたり円）
 * @returns 評価額（円）
 */
export function calculateValue(
  units: Units,
  navValue: NavValue
): number {
  const unitsNum = units as number;
  const navValueNum = navValueNumber(navValue);

  // 評価額 = 口数 / 10000 × 基準価額
  // 四捨五入
  return Math.round((unitsNum / UNITS_BASE) * navValueNum);
}
