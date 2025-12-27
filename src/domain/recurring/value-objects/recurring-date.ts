/**
 * 積立日付 Value Object
 *
 * 積立の開始日・終了日を表現する不変オブジェクト。
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
 * 積立日付の内部表現
 */
export type RecurringDate = Branded<string, "RecurringDate">;

/**
 * 積立日付を生成する
 *
 * @param value - 日付文字列（YYYY-MM-DD形式）
 * @returns 成功時はRecurringDate、失敗時はValidationError
 *
 * @example
 * ```typescript
 * const result = createRecurringDate("2024-01-01");
 * ```
 */
export function createRecurringDate(value: string): Result<RecurringDate, ValidationError> {
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

  return ok(value as RecurringDate);
}

/**
 * 文字列からRecurringDateを復元する（検証済みの値用）
 *
 * @param value - 日付文字列
 * @returns RecurringDate
 */
export function recurringDateFromString(value: string): RecurringDate {
  return value as RecurringDate;
}

/**
 * RecurringDateの生値を取得する
 *
 * @param recurringDate - RecurringDate型の値
 * @returns YYYY-MM-DD形式の文字列
 */
export function recurringDateValue(recurringDate: RecurringDate): string {
  return recurringDate as string;
}

/**
 * 2つのRecurringDateを比較する
 *
 * @param a - 比較元
 * @param b - 比較対象
 * @returns a > b なら正、a < b なら負、等しければ0
 */
export function compareRecurringDate(a: RecurringDate, b: RecurringDate): number {
  return recurringDateValue(a).localeCompare(recurringDateValue(b));
}

/**
 * 指定した日付が開始日と終了日の範囲内かどうかを判定する
 *
 * @param targetDate - チェック対象の日付（YYYY-MM-DD形式）
 * @param startDate - 開始日
 * @param endDate - 終了日（nullの場合は無期限）
 * @returns 範囲内であればtrue
 */
export function isDateInRange(
  targetDate: string,
  startDate: RecurringDate,
  endDate: RecurringDate | null
): boolean {
  if (targetDate < recurringDateValue(startDate)) {
    return false;
  }

  if (endDate !== null && targetDate > recurringDateValue(endDate)) {
    return false;
  }

  return true;
}
