/**
 * 保有情報取得ユースケース
 *
 * 前提条件:
 * - 対象投資信託が存在すること
 *
 * 処理内容:
 * 1. 投資信託取得
 * 2. 取引履歴取得
 * 3. 最新NAV取得
 * 4. 保有情報計算
 */

import { type ResultAsync, errAsync, okAsync } from "neverthrow";
import {
  type FundRepository,
  type TransactionRepository,
  type NavRepository,
} from "../_shared/repository-interfaces.js";
import { type Holding, calculateHolding } from "../../domain/holding/index.js";
import { fundIdFromString } from "../../domain/_shared/index.js";
import {
  type RepositoryError,
  type NotFoundError,
  createNotFoundError,
} from "../../shared/errors/base-error.js";

/**
 * 保有情報取得の入力
 */
export type GetHoldingInput = {
  /** 投資信託ID */
  readonly fundId: string;
};

/**
 * 保有情報取得の出力
 */
export type GetHoldingOutput = {
  /** 保有情報（取引がない場合はnull） */
  readonly holding: Holding | null;
};

/**
 * 保有情報取得のエラー
 */
export type GetHoldingError = NotFoundError | RepositoryError;

/**
 * 保有情報を取得する
 *
 * @param repos - リポジトリ
 * @param input - 取得入力
 * @returns 成功時は保有情報、失敗時はエラー
 */
export function getHolding(
  repos: { fund: FundRepository; transaction: TransactionRepository; nav: NavRepository },
  input: GetHoldingInput
): ResultAsync<GetHoldingOutput, GetHoldingError> {
  const fundId = fundIdFromString(input.fundId);

  // 1. 投資信託取得
  return repos.fund.findById(fundId).andThen((fund) => {
    if (fund === null) {
      return errAsync<GetHoldingOutput, GetHoldingError>(
        createNotFoundError("Fund", input.fundId)
      );
    }

    // 2. 取引履歴取得
    return repos.transaction.findByFund(fundId).andThen((transactions) => {
      // 3. 最新NAV取得
      return repos.nav.findLatestByFund(fundId).andThen((latestNav) => {
        // 4. 保有情報計算
        const holding = calculateHolding(fund, transactions, latestNav);

        return okAsync<GetHoldingOutput, GetHoldingError>({ holding });
      });
    });
  });
}
