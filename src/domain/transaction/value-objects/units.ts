/**
 * 口数 Value Object
 *
 * 投資信託の保有・取得口数を表現する不変オブジェクト。
 * 内部的には正の整数で保持する（小数不可）。
 *
 * 設計方針:
 * - 正の整数のみ許容（0は許容しない）
 * - 小数不可
 * - 口数の端数は常に切り捨て
 */

import { type Result, ok, err } from "neverthrow";
import { type Branded } from "../../../shared/types/branded.js";
import { createValidationError, type ValidationError } from "../../../shared/errors/base-error.js";

/**
 * 口数の内部表現
 *
 * Branded型により、他の数値型との混同を防止する。
 */
export type Units = Branded<number, "Units">;

/**
 * 口数を生成する
 *
 * @param value - 口数。正の整数であること。
 * @returns 成功時はUnits、失敗時はValidationError
 *
 * @example
 * ```typescript
 * const result = createUnits(10000);
 * if (result.isOk()) {
 *   console.log(result.value); // Units型の10000口
 * }
 * ```
 */
export function createUnits(value: number): Result<Units, ValidationError> {
  if (!Number.isFinite(value)) {
    return err(createValidationError("口数は有限の数値である必要があります", "units"));
  }

  if (value <= 0) {
    return err(createValidationError("口数は正の数である必要があります", "units"));
  }

  if (!Number.isInteger(value)) {
    return err(createValidationError("口数は整数である必要があります", "units"));
  }

  return ok(value as Units);
}

/**
 * 数値から直接Unitsを生成する（検証済みの値用）
 *
 * DBから読み込んだ値など、既に検証済みの値を変換する場合に使用する。
 * 不正な値の場合は1を返す（0口は許容しないため）。
 *
 * @param value - 口数
 * @returns Units
 */
export function unitsFromNumber(value: number): Units {
  const result = createUnits(value);
  if (result.isErr()) {
    return 1 as Units;
  }
  return result.value;
}

/**
 * Unitsの生値を取得する
 *
 * @param units - Units型の値
 * @returns 口数（整数）
 */
export function unitsValue(units: Units): number {
  return units as number;
}

/**
 * 口数を加算する
 *
 * @param a - 加算元
 * @param b - 加算する値
 * @returns 加算結果
 */
export function addUnits(a: Units, b: Units): Units {
  return (unitsValue(a) + unitsValue(b)) as Units;
}

/**
 * 口数を減算する
 *
 * 結果が0以下になる場合はエラーを返す。
 *
 * @param a - 減算元
 * @param b - 減算する値
 * @returns 成功時は減算結果、失敗時はValidationError
 */
export function subtractUnits(a: Units, b: Units): Result<Units, ValidationError> {
  const result = unitsValue(a) - unitsValue(b);

  if (result <= 0) {
    return err(createValidationError(
      `減算結果が0以下になります: ${String(unitsValue(a))} - ${String(unitsValue(b))} = ${String(result)}`,
      "units"
    ));
  }

  return ok(result as Units);
}

/**
 * 2つの口数を比較する
 *
 * @param a - 比較元
 * @param b - 比較対象
 * @returns a > b なら正、a < b なら負、等しければ0
 */
export function compareUnits(a: Units, b: Units): number {
  return unitsValue(a) - unitsValue(b);
}

/**
 * 口数が等しいかどうかを判定する
 *
 * @param a - 比較元
 * @param b - 比較対象
 * @returns 等しければtrue
 */
export function equalsUnits(a: Units, b: Units): boolean {
  return unitsValue(a) === unitsValue(b);
}

/**
 * 口数をフォーマットする
 *
 * @param units - フォーマット対象
 * @returns フォーマット済み文字列（例: "10,000口"）
 */
export function formatUnits(units: Units): string {
  return `${unitsValue(units).toLocaleString("ja-JP")}口`;
}
