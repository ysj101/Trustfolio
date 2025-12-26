/**
 * 投資信託登録ユースケース
 *
 * 前提条件:
 * - 銘柄名が空でないこと
 * - 同名の銘柄が存在しないこと
 *
 * 処理内容:
 * 1. 銘柄名のバリデーション
 * 2. 既存銘柄の重複チェック
 * 3. Fundエンティティの生成
 * 4. DBへの永続化
 */

import { type ResultAsync, errAsync } from "neverthrow";
import { type FundRepository } from "../_shared/repository-interfaces.js";
import { type Fund, createFund, fundNameValue } from "../../domain/fund/index.js";
import {
  type ValidationError,
  type RepositoryError,
  type DuplicateError,
  createDuplicateError,
} from "../../shared/errors/base-error.js";

/**
 * 投資信託登録の入力
 */
export type RegisterFundInput = {
  /** 銘柄名 */
  readonly name: string;
};

/**
 * 投資信託登録の出力
 */
export type RegisterFundOutput = {
  /** 登録された投資信託 */
  readonly fund: Fund;
};

/**
 * 投資信託登録のエラー
 */
export type RegisterFundError = ValidationError | DuplicateError | RepositoryError;

/**
 * 投資信託を登録する
 *
 * @param fundRepository - 投資信託リポジトリ
 * @param input - 登録入力
 * @returns 成功時は登録されたFund、失敗時はエラー
 */
export function registerFund(
  fundRepository: FundRepository,
  input: RegisterFundInput
): ResultAsync<RegisterFundOutput, RegisterFundError> {
  // 1. Fundエンティティを生成（バリデーション含む）
  const fundResult = createFund({ name: input.name });

  if (fundResult.isErr()) {
    return errAsync(fundResult.error);
  }

  const fund = fundResult.value;

  // 2. 重複チェック
  return fundRepository
    .findByName(fundNameValue(fund.name))
    .andThen((existingFund) => {
      if (existingFund !== null) {
        return errAsync<Fund, RegisterFundError>(
          createDuplicateError("name", fundNameValue(fund.name))
        );
      }
      // 3. 保存
      return fundRepository.save(fund).map(() => fund);
    })
    .map((savedFund) => ({ fund: savedFund }));
}
