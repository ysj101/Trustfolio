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
