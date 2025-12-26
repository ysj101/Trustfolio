/**
 * 銘柄名Value Object
 *
 * 投資信託の銘柄名を表現する不変オブジェクト。
 * 空文字や長すぎる名前は許容しない。
 */

import { type Result, ok, err } from "neverthrow";
import { type Branded } from "../../../shared/types/branded.js";
import { createValidationError, type ValidationError } from "../../../shared/errors/base-error.js";

/**
 * 銘柄名の最大文字数
 */
const MAX_FUND_NAME_LENGTH = 200;

/**
 * 銘柄名の内部表現
 */
export type FundName = Branded<string, "FundName">;

/**
 * 銘柄名を生成する
 *
 * @param value - 銘柄名文字列
 * @returns 成功時はFundName、失敗時はValidationError
 *
 * @example
 * ```typescript
 * const result = createFundName("eMAXIS Slim 全世界株式（オール・カントリー）");
 * ```
 */
export function createFundName(value: string): Result<FundName, ValidationError> {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return err(createValidationError("銘柄名は必須です", "name"));
  }

  if (trimmed.length > MAX_FUND_NAME_LENGTH) {
    return err(createValidationError(
      `銘柄名は${String(MAX_FUND_NAME_LENGTH)}文字以内である必要があります`,
      "name"
    ));
  }

  return ok(trimmed as FundName);
}

/**
 * 文字列からFundNameを復元する（検証済みの値用）
 *
 * DBから読み込んだ値など、既に検証済みの値を変換する場合に使用する。
 *
 * @param value - 銘柄名文字列
 * @returns FundName
 */
export function fundNameFromString(value: string): FundName {
  return value as FundName;
}

/**
 * FundNameの生値を取得する
 *
 * @param fundName - FundName型の値
 * @returns 銘柄名文字列
 */
export function fundNameValue(fundName: FundName): string {
  return fundName as string;
}
