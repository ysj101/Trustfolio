/**
 * 積立実行日 Value Object
 *
 * 毎月の積立実行日を表現する不変オブジェクト。
 * 1〜28の整数のみ許可（29-31は月によって存在しないため除外）。
 *
 * 設計方針:
 * - 1以上28以下の整数のみ許容
 * - 29, 30, 31日は月によって存在しないため除外
 */

import { type Result, ok, err } from "neverthrow";
import { type Branded } from "../../../shared/types/branded.js";
import { createValidationError, type ValidationError } from "../../../shared/errors/base-error.js";

/**
 * 積立実行日の許容最小値
 */
const MIN_EXECUTION_DAY = 1;

/**
 * 積立実行日の許容最大値（29-31は月によって存在しないため除外）
 */
const MAX_EXECUTION_DAY = 28;

/**
 * 積立実行日の内部表現
 *
 * Branded型により、他の数値型との混同を防止する。
 */
export type ExecutionDay = Branded<number, "ExecutionDay">;

/**
 * 積立実行日を生成する
 *
 * @param value - 実行日（1〜28）
 * @returns 成功時はExecutionDay、失敗時はValidationError
 *
 * @example
 * ```typescript
 * const result = createExecutionDay(15);
 * if (result.isOk()) {
 *   console.log(result.value); // ExecutionDay型の15日
 * }
 * ```
 */
export function createExecutionDay(value: number): Result<ExecutionDay, ValidationError> {
  if (!Number.isFinite(value)) {
    return err(createValidationError("実行日は有限の数値である必要があります", "executionDay"));
  }

  if (!Number.isInteger(value)) {
    return err(createValidationError("実行日は整数である必要があります", "executionDay"));
  }

  if (value < MIN_EXECUTION_DAY || value > MAX_EXECUTION_DAY) {
    return err(createValidationError(
      `実行日は${String(MIN_EXECUTION_DAY)}〜${String(MAX_EXECUTION_DAY)}の範囲である必要があります`,
      "executionDay"
    ));
  }

  return ok(value as ExecutionDay);
}

/**
 * 数値から直接ExecutionDayを生成する（検証済みの値用）
 *
 * DBから読み込んだ値など、既に検証済みの値を変換する場合に使用する。
 * 不正な値の場合は1を返す。
 *
 * @param value - 実行日
 * @returns ExecutionDay
 */
export function executionDayFromNumber(value: number): ExecutionDay {
  const result = createExecutionDay(value);
  if (result.isErr()) {
    return 1 as ExecutionDay;
  }
  return result.value;
}

/**
 * ExecutionDayの生値を取得する
 *
 * @param executionDay - ExecutionDay型の値
 * @returns 実行日（1〜28）
 */
export function executionDayValue(executionDay: ExecutionDay): number {
  return executionDay as number;
}

/**
 * 2つのExecutionDayを比較する
 *
 * @param a - 比較元
 * @param b - 比較対象
 * @returns a > b なら正、a < b なら負、等しければ0
 */
export function compareExecutionDay(a: ExecutionDay, b: ExecutionDay): number {
  return executionDayValue(a) - executionDayValue(b);
}

/**
 * ExecutionDayをフォーマットする
 *
 * @param executionDay - フォーマット対象
 * @returns フォーマット済み文字列（例: "15日"）
 */
export function formatExecutionDay(executionDay: ExecutionDay): string {
  return `${String(executionDayValue(executionDay))}日`;
}
