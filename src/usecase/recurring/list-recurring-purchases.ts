/**
 * 積立設定一覧取得ユースケース
 *
 * 処理内容:
 * 1. 全積立設定を取得
 */

import { type ResultAsync } from "neverthrow";
import { type RecurringPurchaseRepository } from "../_shared/repository-interfaces.js";
import { type RecurringPurchase } from "../../domain/recurring/index.js";
import { type RepositoryError } from "../../shared/errors/base-error.js";

/**
 * 積立設定一覧取得の出力
 */
export type ListRecurringPurchasesOutput = {
  /** 積立設定一覧 */
  readonly recurringPurchases: readonly RecurringPurchase[];
};

/**
 * 積立設定一覧取得のエラー
 */
export type ListRecurringPurchasesError = RepositoryError;

/**
 * 積立設定一覧を取得する
 *
 * @param repos - リポジトリ
 * @returns 成功時は積立設定一覧、失敗時はエラー
 */
export function listRecurringPurchases(
  repos: { recurringPurchase: RecurringPurchaseRepository }
): ResultAsync<ListRecurringPurchasesOutput, ListRecurringPurchasesError> {
  return repos.recurringPurchase.findAll().map((recurringPurchases) => ({
    recurringPurchases,
  }));
}
