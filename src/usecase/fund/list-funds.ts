/**
 * 投資信託一覧取得ユースケース
 *
 * 処理内容:
 * 1. 全投資信託を取得
 */

import { type ResultAsync } from "neverthrow";
import { type FundRepository } from "../_shared/repository-interfaces.js";
import { type Fund } from "../../domain/fund/index.js";
import { type RepositoryError } from "../../shared/errors/base-error.js";

/**
 * 投資信託一覧取得の出力
 */
export type ListFundsOutput = {
  /** 投資信託一覧 */
  readonly funds: readonly Fund[];
};

/**
 * 投資信託一覧取得のエラー
 */
export type ListFundsError = RepositoryError;

/**
 * 投資信託一覧を取得する
 *
 * @param fundRepository - 投資信託リポジトリ
 * @returns 成功時は投資信託一覧、失敗時はエラー
 */
export function listFunds(
  fundRepository: FundRepository
): ResultAsync<ListFundsOutput, ListFundsError> {
  return fundRepository.findAll().map((funds) => ({ funds }));
}
