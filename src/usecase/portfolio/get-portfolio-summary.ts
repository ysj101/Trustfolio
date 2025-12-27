/**
 * ポートフォリオサマリ取得ユースケース
 *
 * 処理内容:
 * 1. 全投資信託取得
 * 2. 各投資信託の取引履歴取得
 * 3. 各投資信託の最新NAV取得
 * 4. 各投資信託の保有情報計算
 * 5. ポートフォリオ集計
 */

import { ResultAsync, okAsync, errAsync } from "neverthrow";
import {
  type FundRepository,
  type TransactionRepository,
  type NavRepository,
} from "../_shared/repository-interfaces.js";
import { type Holding, calculateHolding } from "../../domain/holding/index.js";
import { type Portfolio, createPortfolio } from "../../domain/portfolio/index.js";
import { type RepositoryError } from "../../shared/errors/base-error.js";

/**
 * ポートフォリオサマリ取得の出力
 */
export type GetPortfolioSummaryOutput = {
  /** ポートフォリオ */
  readonly portfolio: Portfolio;
};

/**
 * ポートフォリオサマリ取得のエラー
 */
export type GetPortfolioSummaryError = RepositoryError;

/**
 * ポートフォリオサマリを取得する
 *
 * @param repos - リポジトリ
 * @returns 成功時はポートフォリオ、失敗時はエラー
 */
export function getPortfolioSummary(
  repos: { fund: FundRepository; transaction: TransactionRepository; nav: NavRepository }
): ResultAsync<GetPortfolioSummaryOutput, GetPortfolioSummaryError> {
  // 1. 全投資信託取得
  return repos.fund.findAll().andThen((funds) => {
    if (funds.length === 0) {
      // 投資信託がない場合は空のポートフォリオ
      return okAsync<GetPortfolioSummaryOutput, GetPortfolioSummaryError>({
        portfolio: createPortfolio([]),
      });
    }

    // 2-4. 各投資信託の保有情報を計算
    // 全てのfundに対して順次処理を行う
    const holdingPromises = funds.map((fund) =>
      repos.transaction
        .findByFund(fund.id)
        .andThen((transactions) =>
          repos.nav.findLatestByFund(fund.id).map((latestNav) => ({
            fund,
            transactions,
            latestNav,
          }))
        )
    );

    // 全ての非同期処理を結合
    return combineResultAsync(holdingPromises).map((fundDataList) => {
      // 保有情報を計算（取引がある銘柄のみ）
      const holdings: Holding[] = [];
      for (const { fund, transactions, latestNav } of fundDataList) {
        const holding = calculateHolding(fund, transactions, latestNav);
        if (holding !== null) {
          holdings.push(holding);
        }
      }

      // 5. ポートフォリオ集計
      const portfolio = createPortfolio(holdings);

      return { portfolio };
    });
  });
}

/**
 * 複数のResultAsyncを結合する
 *
 * neverthrowのcombineが型推論で問題を起こすことがあるため、
 * シンプルな実装を使用する。
 *
 * @param results - ResultAsyncの配列
 * @returns 全て成功した場合は値の配列、1つでも失敗した場合は最初のエラー
 */
function combineResultAsync<T, E>(
  results: readonly ResultAsync<T, E>[]
): ResultAsync<readonly T[], E> {
  if (results.length === 0) {
    return okAsync([]);
  }

  // 順次実行ではなく、全て並列で実行する
  return ResultAsync.fromPromise(
    Promise.all(results.map((r) => r)),
    (e) => e as E
  ).andThen((resultsArray) => {
    const values: T[] = [];
    for (const result of resultsArray) {
      if (result.isErr()) {
        return errAsync(result.error);
      }
      values.push(result.value);
    }
    return okAsync(values as readonly T[]);
  });
}
