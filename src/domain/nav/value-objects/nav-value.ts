/**
 * 基準価額値Value Object
 *
 * 投資信託の1万口あたりの価額（円）を表現する不変オブジェクト。
 * 正の整数のみ許容する。
 */

import { type Result, ok, err } from "neverthrow";
import { type Branded } from "../../../shared/types/branded.js";
import { createValidationError, type ValidationError } from "../../../shared/errors/base-error.js";

/**
 * 基準価額値の内部表現
 *
 * 1万口あたりの円価額を整数で表現する。
 */
export type NavValue = Branded<number, "NavValue">;

/**
 * 基準価額値を生成する
 *
 * @param value - 基準価額（1万口あたり円）
 * @returns 成功時はNavValue、失敗時はValidationError
 *
 * @example
 * ```typescript
 * const result = createNavValue(12345); // 12,345円
 * ```
 */
export function createNavValue(value: number): Result<NavValue, ValidationError> {
  if (!Number.isFinite(value)) {
    return err(createValidationError(
      "基準価額は有限の数値である必要があります",
      "navValue"
    ));
  }

  if (value <= 0) {
    return err(createValidationError(
      "基準価額は正の数である必要があります",
      "navValue"
    ));
  }

  if (!Number.isInteger(value)) {
    return err(createValidationError(
      "基準価額は整数である必要があります",
      "navValue"
    ));
  }

  return ok(value as NavValue);
}

/**
 * 数値からNavValueを復元する（検証済みの値用）
 *
 * @param value - 基準価額
 * @returns NavValue
 */
export function navValueFromNumber(value: number): NavValue {
  return value as NavValue;
}

/**
 * NavValueの生値を取得する
 *
 * @param navValue - NavValue型の値
 * @returns 1万口あたり円
 */
export function navValueNumber(navValue: NavValue): number {
  return navValue as number;
}

/**
 * 基準価額を日本円形式の文字列にフォーマットする
 *
 * @param navValue - フォーマット対象
 * @returns フォーマット済み文字列（例: "¥12,345"）
 */
export function formatNavValue(navValue: NavValue): string {
  return `¥${navValueNumber(navValue).toLocaleString("ja-JP")}`;
}
