/**
 * 取引履歴取得ユースケース
 *
 * 前提条件:
 * - 対象投資信託が存在すること
 *
 * 処理内容:
 * 1. 投資信託の存在確認
 * 2. 取引履歴取得
 */

import { type ResultAsync, errAsync } from "neverthrow";
import {
  type FundRepository,
  type TransactionRepository,
} from "../_shared/repository-interfaces.js";
import { type Transaction } from "../../domain/transaction/index.js";
import { fundIdFromString } from "../../domain/_shared/index.js";
import {
  type RepositoryError,
  type NotFoundError,
  createNotFoundError,
} from "../../shared/errors/base-error.js";

/**
 * 取引履歴取得の入力
 */
export type GetTransactionHistoryInput = {
  /** 投資信託ID */
  readonly fundId: string;
  /** 取得件数上限（省略時は全件） */
  readonly limit?: number;
};

/**
 * 取引履歴取得の出力
 */
export type GetTransactionHistoryOutput = {
  /** 取引履歴 */
  readonly transactions: readonly Transaction[];
};

/**
 * 取引履歴取得のエラー
 */
export type GetTransactionHistoryError = NotFoundError | RepositoryError;

/**
 * 取引履歴を取得する
 *
 * @param repos - リポジトリ
 * @param input - 取得入力
 * @returns 成功時は取引履歴、失敗時はエラー
 */
export function getTransactionHistory(
  repos: { fund: FundRepository; transaction: TransactionRepository },
  input: GetTransactionHistoryInput
): ResultAsync<GetTransactionHistoryOutput, GetTransactionHistoryError> {
  const fundId = fundIdFromString(input.fundId);

  // 1. 投資信託の存在確認
  return repos.fund.findById(fundId).andThen((fund) => {
    if (fund === null) {
      return errAsync<GetTransactionHistoryOutput, GetTransactionHistoryError>(
        createNotFoundError("Fund", input.fundId)
      );
    }

    // 2. 取引履歴取得
    return repos.transaction.findByFund(fundId, input.limit).map((transactions) => ({
      transactions,
    }));
  });
}
