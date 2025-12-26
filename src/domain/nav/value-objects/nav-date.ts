/**
 * 基準価額日付Value Object
 *
 * 基準価額の対象日を表現する不変オブジェクト。
 * YYYY-MM-DD形式の文字列として内部保持する。
 */

import { type Result, ok, err } from "neverthrow";
import { type Branded } from "../../../shared/types/branded.js";
import { createValidationError, type ValidationError } from "../../../shared/errors/base-error.js";

/**
 * 日付文字列の正規表現（YYYY-MM-DD形式）
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 基準価額日付の内部表現
 */
export type NavDate = Branded<string, "NavDate">;

/**
 * 基準価額日付を生成する
 *
 * @param value - 日付文字列（YYYY-MM-DD形式）
 * @returns 成功時はNavDate、失敗時はValidationError
 *
 * @example
 * ```typescript
 * const result = createNavDate("2024-03-15");
 * ```
 */
export function createNavDate(value: string): Result<NavDate, ValidationError> {
  if (!DATE_PATTERN.test(value)) {
    return err(createValidationError(
      "日付はYYYY-MM-DD形式である必要があります",
      "date"
    ));
  }

  // 実際に有効な日付かどうかを検証
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return err(createValidationError(
      "無効な日付です",
      "date"
    ));
  }

  // パース結果が元の日付と一致するか確認（2月30日等の無効な日付を検出）
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const normalized = `${String(year)}-${month}-${day}`;

  if (normalized !== value) {
    return err(createValidationError(
      "無効な日付です",
      "date"
    ));
  }

  return ok(value as NavDate);
}

/**
 * Dateオブジェクトから基準価額日付を生成する
 *
 * @param date - Dateオブジェクト
 * @returns NavDate
 */
export function navDateFromDate(date: Date): NavDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(year)}-${month}-${day}` as NavDate;
}

/**
 * 文字列からNavDateを復元する（検証済みの値用）
 *
 * @param value - 日付文字列
 * @returns NavDate
 */
export function navDateFromString(value: string): NavDate {
  return value as NavDate;
}

/**
 * NavDateの生値を取得する
 *
 * @param navDate - NavDate型の値
 * @returns YYYY-MM-DD形式の文字列
 */
export function navDateValue(navDate: NavDate): string {
  return navDate as string;
}

/**
 * NavDateをDateオブジェクトに変換する
 *
 * @param navDate - NavDate型の値
 * @returns Date
 */
export function navDateToDate(navDate: NavDate): Date {
  return new Date(navDateValue(navDate));
}

/**
 * 2つのNavDateを比較する
 *
 * @param a - 比較元
 * @param b - 比較対象
 * @returns a > b なら正、a < b なら負、等しければ0
 */
export function compareNavDate(a: NavDate, b: NavDate): number {
  return navDateValue(a).localeCompare(navDateValue(b));
}
