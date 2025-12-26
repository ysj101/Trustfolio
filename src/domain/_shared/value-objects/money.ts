/**
 * 金額Value Object
 *
 * 日本円の金額を表現する不変オブジェクト。
 * 内部的には整数（円単位）で保持し、計算時の精度を保証する。
 *
 * 設計方針:
 * - 負数は許容しない（支出は別途マイナス符号で表現する場合を除く）
 * - 計算結果の端数は四捨五入
 * - 加算・減算は精度維持
 */

import { type Result, ok, err } from "neverthrow";
import { type Branded } from "../../../shared/types/branded.js";
import { createValidationError, type ValidationError } from "../../../shared/errors/base-error.js";

/**
 * 金額の内部表現
 *
 * Branded型により、他の数値型との混同を防止する。
 */
export type Money = Branded<number, "Money">;

/**
 * 金額を生成する
 *
 * @param value - 金額（円）。非負の整数であること。
 * @returns 成功時はMoney、失敗時はValidationError
 *
 * @example
 * ```typescript
 * const result = createMoney(10000);
 * if (result.isOk()) {
 *   console.log(result.value); // Money型の10000円
 * }
 * ```
 */
export function createMoney(value: number): Result<Money, ValidationError> {
  if (!Number.isFinite(value)) {
    return err(createValidationError("金額は有限の数値である必要があります", "money"));
  }

  if (value < 0) {
    return err(createValidationError("金額は0以上である必要があります", "money"));
  }

  // 小数点以下がある場合は四捨五入して整数化
  const rounded = Math.round(value);

  return ok(rounded as Money);
}

/**
 * 数値から直接Moneyを生成する（検証済みの値用）
 *
 * DBから読み込んだ値など、既に検証済みの値を変換する場合に使用する。
 * 不正な値の場合は0を返す。
 *
 * @param value - 金額（円）
 * @returns Money
 */
export function moneyFromNumber(value: number): Money {
  const result = createMoney(value);
  if (result.isErr()) {
    return 0 as Money;
  }
  return result.value;
}

/**
 * Moneyの生値を取得する
 *
 * @param money - Money型の値
 * @returns 円単位の整数
 */
export function moneyValue(money: Money): number {
  return money as number;
}

/**
 * ゼロ円を表すMoney
 */
export const ZERO_MONEY: Money = 0 as Money;

/**
 * 金額を加算する
 *
 * @param a - 加算元
 * @param b - 加算する値
 * @returns 加算結果
 */
export function addMoney(a: Money, b: Money): Money {
  return (moneyValue(a) + moneyValue(b)) as Money;
}

/**
 * 金額を減算する
 *
 * 結果が負になる場合はエラーを返す。
 *
 * @param a - 減算元
 * @param b - 減算する値
 * @returns 成功時は減算結果、失敗時はValidationError
 */
export function subtractMoney(a: Money, b: Money): Result<Money, ValidationError> {
  const result = moneyValue(a) - moneyValue(b);

  if (result < 0) {
    return err(createValidationError(
      `減算結果が負になります: ${String(moneyValue(a))} - ${String(moneyValue(b))} = ${String(result)}`,
      "money"
    ));
  }

  return ok(result as Money);
}

/**
 * 金額を乗算する（端数四捨五入）
 *
 * @param money - 乗算元
 * @param factor - 乗数
 * @returns 乗算結果（端数は四捨五入）
 */
export function multiplyMoney(money: Money, factor: number): Money {
  const result = Math.round(moneyValue(money) * factor);
  // 負になった場合は0を返す
  return (result < 0 ? 0 : result) as Money;
}

/**
 * 金額を除算する（端数四捨五入）
 *
 * @param money - 除算元
 * @param divisor - 除数（0以外）
 * @returns 成功時は除算結果、失敗時はValidationError
 */
export function divideMoney(money: Money, divisor: number): Result<Money, ValidationError> {
  if (divisor === 0) {
    return err(createValidationError("0で除算することはできません", "money"));
  }

  const result = Math.round(moneyValue(money) / divisor);

  return ok((result < 0 ? 0 : result) as Money);
}

/**
 * 2つの金額を比較する
 *
 * @param a - 比較元
 * @param b - 比較対象
 * @returns a > b なら正、a < b なら負、等しければ0
 */
export function compareMoney(a: Money, b: Money): number {
  return moneyValue(a) - moneyValue(b);
}

/**
 * 金額が等しいかどうかを判定する
 *
 * @param a - 比較元
 * @param b - 比較対象
 * @returns 等しければtrue
 */
export function equalsMoney(a: Money, b: Money): boolean {
  return moneyValue(a) === moneyValue(b);
}

/**
 * 金額を日本円形式の文字列にフォーマットする
 *
 * @param money - フォーマット対象
 * @returns フォーマット済み文字列（例: "¥10,000"）
 */
export function formatMoney(money: Money): string {
  return `¥${moneyValue(money).toLocaleString("ja-JP")}`;
}
