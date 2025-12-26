/**
 * neverthrow用ヘルパー関数
 *
 * Result型を扱うためのユーティリティ関数を提供する。
 */

import { type Result, ok, err, ResultAsync, okAsync, errAsync } from "neverthrow";

/**
 * 複数のResultを結合し、全て成功した場合のみ成功を返す
 *
 * @param results - 結合するResultの配列
 * @returns 全成功時は値の配列、1つでも失敗時は最初のエラー
 */
export function combineResults<T, E>(
  results: readonly Result<T, E>[]
): Result<readonly T[], E> {
  const values: T[] = [];

  for (const result of results) {
    if (result.isErr()) {
      return err(result.error);
    }
    values.push(result.value);
  }

  return ok(values);
}

/**
 * ResultAsync用の安全なtry-catch ラッパー
 *
 * Infrastructure層でのDB操作など、例外が発生しうる処理をResult型に変換する。
 * この関数は腐敗防止層でのみ使用すること。
 *
 * @param fn - 例外が発生しうる非同期処理
 * @param mapError - 例外をエラー型に変換する関数
 * @returns ResultAsync
 */
export function tryCatchAsync<T, E>(
  fn: () => Promise<T>,
  mapError: (error: unknown) => E
): ResultAsync<T, E> {
  return new ResultAsync(
    fn()
      .then((value) => ok<T, E>(value))
      .catch((error: unknown) => err<T, E>(mapError(error)))
  );
}

/**
 * Result用の安全なtry-catch ラッパー
 *
 * Infrastructure層での同期処理など、例外が発生しうる処理をResult型に変換する。
 * この関数は腐敗防止層でのみ使用すること。
 *
 * @param fn - 例外が発生しうる同期処理
 * @param mapError - 例外をエラー型に変換する関数
 * @returns Result
 */
export function tryCatch<T, E>(
  fn: () => T,
  mapError: (error: unknown) => E
): Result<T, E> {
  /* eslint-disable no-restricted-syntax */
  try {
    return ok(fn());
  } catch (error) {
    return err(mapError(error));
  }
  /* eslint-enable no-restricted-syntax */
}

/**
 * 値がnullまたはundefinedの場合にエラーを返す
 *
 * @param value - チェック対象の値
 * @param error - nullish時に返すエラー
 * @returns 値が存在する場合はok、nullish時はerr
 */
export function fromNullable<T, E>(
  value: T | null | undefined,
  error: E
): Result<T, E> {
  if (value === null || value === undefined) {
    return err(error);
  }
  return ok(value);
}

/**
 * 非同期版 fromNullable
 *
 * @param value - チェック対象の値（Promise）
 * @param error - nullish時に返すエラー
 * @returns ResultAsync
 */
export function fromNullableAsync<T, E>(
  value: Promise<T | null | undefined>,
  error: E
): ResultAsync<T, E> {
  return new ResultAsync(
    value.then((v) => fromNullable(v, error))
  );
}

/**
 * Result型の値をResultAsync型に変換する
 *
 * @param result - 変換元のResult
 * @returns ResultAsync
 */
export function toAsync<T, E>(result: Result<T, E>): ResultAsync<T, E> {
  return result.isOk() ? okAsync(result.value) : errAsync(result.error);
}
