import type { AppError, FailureResult, Result } from './types';

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

/**
 * 失敗を表す {@link Result} を、別の成功型を持つ {@link Result} として型安全に伝播するヘルパー。
 *
 * 目的:
 * - usecase / repository 層で多発していた失敗 Result への強制キャスト（`as` による型付け替え）を排除する。
 *   {@link Result} の失敗ブランチ（`error`）は型パラメータ `T` に依存しないため、
 *   下位処理の失敗をそのまま上位の戻り値型へ付け替える際にキャストが必要だった。
 *
 * 内容:
 * - 戻り値型を `Result<never>` とする。`never` は全ての型に代入可能であるため、
 *   TypeScript の変性により `Result<never>` は任意の `Result<T>` へ代入可能となる。
 *   これにより呼び出し側はキャストなしで失敗をそのまま `return` できる。
 *
 * 注意:
 * - 引数には判別済みの失敗 {@link Result}（`if (!result.success)` で絞り込んだ後の値）を渡す。
 *   成功 {@link Result} はコンパイルエラーとなり、誤用を fail-fast で検出できる。
 * - 失敗オブジェクトをそのまま返すため、`error` の内容（type・message・field）は一切変化しない。
 *
 * @param failure - 伝播する失敗 {@link Result}。
 * @returns 同一の `error` を保持した `Result<never>`。任意の `Result<T>` として返却できる。
 */
export function propagateFailure(failure: FailureResult): Result<never> {
  return failure;
}
