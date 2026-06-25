import type { Result } from './types';
import { fail } from './result';

/**
 * 文字列が `YYYY-MM-DD` 形式の妥当な日付かを判定する。
 *
 * 目的:
 * - `RecurringUseCase` と `TransactionUseCase` に重複していた同一実装を一本化する。
 *
 * 内容:
 * - 形式（4桁-2桁-2桁）を正規表現で検査したうえで、`Date` 解釈が成立するかを確認する。
 *   例: `2026-02-30` は形式は満たすが日付として無効なため `false` を返す。
 *
 * 注意:
 * - 既存挙動を変えないため、UTC 基準（`T00:00:00Z`）で `Date` を生成して判定する。
 *
 * @param value - 判定対象の文字列。
 * @returns 妥当な `YYYY-MM-DD` であれば true。
 */
export function isValidIsoDate(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

/**
 * 値が「空でない文字列」であることを検証する共通バリデータ。
 *
 * 目的:
 * - 各 UseCase で繰り返されている
 *   `typeof value !== 'string' || value.trim() === ''` の検証を一本化する。
 *
 * 内容:
 * - 失敗時は `validation` 種別のエラーに、指定された `message` と `field` を付与して返す。
 * - 成功時は入力された値をそのまま（トリムせず）返す。
 *   これは既存の各 UseCase が元の値を保存している挙動を保つためである。
 *
 * @param value - 検証対象の値。
 * @param message - 失敗時に利用者へ提示するメッセージ。
 * @param field - 失敗時に対象フィールドを示すキー。
 * @returns 検証に成功すれば元の文字列を持つ {@link Result}。
 */
export function validateNonEmptyString(
  value: unknown,
  message: string,
  field: string
): Result<string> {
  if (typeof value !== 'string' || value.trim() === '') {
    return fail('validation', message, field);
  }
  return { success: true, value };
}

/**
 * 値が「0より大きい数値」であることを検証する共通バリデータ。
 *
 * 目的:
 * - 各 UseCase で繰り返されている
 *   `typeof value !== 'number' || Number.isNaN(value) || value <= 0` の検証を一本化する。
 *
 * 内容:
 * - 失敗時は `validation` 種別のエラーに、指定された `message` と `field` を付与して返す。
 * - 判定式は既存挙動を厳密に踏襲する。`Number.isNaN` のみで NaN を除外するため、
 *   `Infinity` は（0より大きいため）既存同様に許容される点に注意する。
 *
 * @param value - 検証対象の値。
 * @param message - 失敗時に利用者へ提示するメッセージ。
 * @param field - 失敗時に対象フィールドを示すキー。
 * @returns 検証に成功すれば数値を持つ {@link Result}。
 */
export function validatePositiveNumber(
  value: unknown,
  message: string,
  field: string
): Result<number> {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return fail('validation', message, field);
  }
  return { success: true, value };
}

/**
 * 値が「積立設定の注文日（1〜28）」として妥当な数値であることを検証する共通バリデータ。
 *
 * 目的:
 * - `RecurringUseCase.validateRecurringInput()` に直書きされていた
 *   executionDay の範囲制約（1〜28）をドメイン層へ集約する。
 *
 * 内容・既存挙動の踏襲（重要）:
 * - 判定は「数値であり（typeof number）」かつ「NaN でない」かつ「1以上28以下」である。
 * - **整数判定は行わない**。これは元実装（RecurringUseCase 側の直書き検証）が
 *   `Number.isInteger` を用いておらず、例えば `1.5` を許容していた挙動をそのまま保つためである。
 *   仕様文言上は「1〜28の整数」と表現されるが、実コードの挙動を優先して非整数も通す。
 * - 上限・下限を 1〜28 に固定するのは、月末日（29〜31）が存在しない月でも注文日が
 *   破綻しないようにするという積立設定固有の制約に由来する。
 *
 * @param value - 検証対象の値（積立設定の注文日）。
 * @param message - 失敗時に利用者へ提示するメッセージ。
 * @param field - 失敗時に対象フィールドを示すキー。
 * @returns 検証に成功すれば数値（1〜28）を持つ {@link Result}。
 */
export function validateRecurringDay(
  value: unknown,
  message: string,
  field: string
): Result<number> {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fail('validation', message, field);
  }
  if (value < 1 || value > 28) {
    return fail('validation', message, field);
  }
  return { success: true, value };
}
