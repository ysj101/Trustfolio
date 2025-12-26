/**
 * 基準価額履歴取得ユースケース
 *
 * 処理内容:
 * 1. 投資信託の存在確認
 * 2. 基準価額履歴を取得
 */

import { type ResultAsync, errAsync } from "neverthrow";
import { type FundRepository, type NavRepository } from "../_shared/repository-interfaces.js";
import { type Nav } from "../../domain/nav/index.js";
import { fundIdFromString } from "../../domain/_shared/index.js";
import {
  type RepositoryError,
  type NotFoundError,
  createNotFoundError,
} from "../../shared/errors/base-error.js";

/**
 * 基準価額履歴取得の入力
 */
export type GetNavHistoryInput = {
  /** 投資信託ID */
  readonly fundId: string;
  /** 取得件数上限（未指定で全件） */
  readonly limit?: number;
};

/**
 * 基準価額履歴取得の出力
 */
export type GetNavHistoryOutput = {
  /** 基準価額履歴（日付降順） */
  readonly navs: readonly Nav[];
};

/**
 * 基準価額履歴取得のエラー
 */
export type GetNavHistoryError = NotFoundError | RepositoryError;

/**
 * 基準価額履歴を取得する
 *
 * @param repos - リポジトリ
 * @param input - 取得入力
 * @returns 成功時は基準価額履歴、失敗時はエラー
 */
export function getNavHistory(
  repos: { fund: FundRepository; nav: NavRepository },
  input: GetNavHistoryInput
): ResultAsync<GetNavHistoryOutput, GetNavHistoryError> {
  const fundId = fundIdFromString(input.fundId);

  // 1. 投資信託の存在確認
  return repos.fund.findById(fundId).andThen((fund) => {
    if (fund === null) {
      return errAsync<GetNavHistoryOutput, GetNavHistoryError>(
        createNotFoundError("Fund", input.fundId)
      );
    }

    // 2. 履歴取得
    return repos.nav.findHistoryByFund(fundId, input.limit).map((navs) => ({ navs }));
  });
}
