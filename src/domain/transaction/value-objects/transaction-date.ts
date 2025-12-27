/**
 * 取引日付 Value Object
 *
 * 取引の実行日を表現する不変オブジェクト。
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
 * 取引日付の内部表現
 */
export type TransactionDate = Branded<string, "TransactionDate">;

/**
 * 取引日付を生成する
 *
 * @param value - 日付文字列（YYYY-MM-DD形式）
 * @returns 成功時はTransactionDate、失敗時はValidationError
 *
 * @example
 * ```typescript
 * const result = createTransactionDate("2024-03-15");
 * ```
 */
export function createTransactionDate(value: string): Result<TransactionDate, ValidationError> {
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

  return ok(value as TransactionDate);
}

/**
 * Dateオブジェクトから取引日付を生成する
 *
 * @param date - Dateオブジェクト
 * @returns TransactionDate
 */
export function transactionDateFromDate(date: Date): TransactionDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(year)}-${month}-${day}` as TransactionDate;
}

/**
 * 文字列からTransactionDateを復元する（検証済みの値用）
 *
 * @param value - 日付文字列
 * @returns TransactionDate
 */
export function transactionDateFromString(value: string): TransactionDate {
  return value as TransactionDate;
}

/**
 * TransactionDateの生値を取得する
 *
 * @param transactionDate - TransactionDate型の値
 * @returns YYYY-MM-DD形式の文字列
 */
export function transactionDateValue(transactionDate: TransactionDate): string {
  return transactionDate as string;
}

/**
 * TransactionDateをDateオブジェクトに変換する
 *
 * @param transactionDate - TransactionDate型の値
 * @returns Date
 */
export function transactionDateToDate(transactionDate: TransactionDate): Date {
  return new Date(transactionDateValue(transactionDate));
}

/**
 * 2つのTransactionDateを比較する
 *
 * @param a - 比較元
 * @param b - 比較対象
 * @returns a > b なら正、a < b なら負、等しければ0
 */
export function compareTransactionDate(a: TransactionDate, b: TransactionDate): number {
  return transactionDateValue(a).localeCompare(transactionDateValue(b));
}
