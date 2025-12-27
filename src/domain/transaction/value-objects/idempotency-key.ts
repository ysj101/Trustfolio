/**
 * 冪等性キー Value Object
 *
 * 積立実行の冪等性を保証するためのキー。
 * 形式: {recurringPurchaseId}_{targetDate}
 *
 * 設計方針:
 * - 同一の積立設定・日付で重複実行を防止
 * - 空文字列は許容しない
 */

import { type Result, ok, err } from "neverthrow";
import { type Branded } from "../../../shared/types/branded.js";
import { createValidationError, type ValidationError } from "../../../shared/errors/base-error.js";

/**
 * 冪等性キーの内部表現
 *
 * Branded型により、他の文字列型との混同を防止する。
 */
export type IdempotencyKey = Branded<string, "IdempotencyKey">;

/**
 * 冪等性キーを生成する
 *
 * @param value - 冪等性キー文字列
 * @returns 成功時はIdempotencyKey、失敗時はValidationError
 */
export function createIdempotencyKey(value: string): Result<IdempotencyKey, ValidationError> {
  if (value.trim().length === 0) {
    return err(createValidationError("冪等性キーは空にできません", "idempotencyKey"));
  }

  return ok(value as IdempotencyKey);
}

/**
 * 積立設定IDと日付から冪等性キーを生成する
 *
 * @param recurringPurchaseId - 積立設定ID
 * @param targetDate - 対象日（YYYY-MM-DD形式）
 * @returns IdempotencyKey
 */
export function createIdempotencyKeyFromRecurring(
  recurringPurchaseId: string,
  targetDate: string
): IdempotencyKey {
  return `${recurringPurchaseId}_${targetDate}` as IdempotencyKey;
}

/**
 * 文字列からIdempotencyKeyを復元する
 *
 * DBから読み込んだ値など、既に検証済みの値を変換する場合に使用する。
 *
 * @param value - 冪等性キー文字列
 * @returns IdempotencyKey
 */
export function idempotencyKeyFromString(value: string): IdempotencyKey {
  return value as IdempotencyKey;
}

/**
 * IdempotencyKeyの生値を取得する
 *
 * @param key - IdempotencyKey型の値
 * @returns 文字列
 */
export function idempotencyKeyValue(key: IdempotencyKey): string {
  return key as string;
}
