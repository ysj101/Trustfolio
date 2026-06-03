import type { AppError, Result } from './types';

/**
 * 失敗を表す {@link Result} を生成する共通ヘルパー。
 *
 * 目的:
 * - 各レイヤーに散在していた同名のローカル `fail` 実装を一本化し、
 *   エラー生成の形を統一する。
 *
 * 内容:
 * - `field` を省略した場合は `error` に `field` キーを含めない。
 *   これは Repository 層（`field` 無し）と `SheetRepository`（`field` 有り）の
 *   双方の既存挙動を厳密に維持するための分岐である。
 *
 * 注意:
 * - 本プロジェクトは throw を禁止しているため、失敗は必ず本ヘルパー経由の
 *   {@link Result} で表現する。
 *
 * @typeParam T - 成功時に返すはずだった値の型（失敗時は使用されない）。
 * @param type - エラー種別。
 * @param message - 利用者向けのエラーメッセージ。
 * @param field - 入力起因エラーで対象フィールドを示す場合に指定する。
 * @returns 失敗を表す {@link Result}。
 */
export function fail<T>(type: AppError['type'], message: string, field?: string): Result<T> {
  if (field === undefined) {
    return { success: false, error: { type, message } };
  }
  return { success: false, error: { type, message, field } };
}
