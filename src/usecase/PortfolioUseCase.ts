import type { Portfolio, Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import type { HoldingUseCase } from './HoldingUseCase';
import { calculatePortfolio } from '../domain/HoldingCalculator';

export type PortfolioUseCase = {
  getPortfolioSummary: () => Result<Portfolio>;
};

/**
 * ポートフォリオのユースケース。
 */
export function createPortfolioUseCase(
  fundRepository: FundRepository,
  transactionRepository: TransactionRepository,
  holdingUseCase: HoldingUseCase
): PortfolioUseCase {
  return {
    getPortfolioSummary: (): Result<Portfolio> => {
      // HoldingUseCaseを利用してHoldingsを取得（内部でバッチ取得済み）
      const holdingsResult = holdingUseCase.listHoldings();
      if (!holdingsResult.success) {
        return holdingsResult as Result<Portfolio>;
      }

      const holdings = holdingsResult.value;

      // 全ファンドのIDリストを取得
      const fundResult = fundRepository.listFunds();
      if (!fundResult.success) {
        return fundResult as Result<Portfolio>;
      }

      const fundIds = fundResult.value.map((f) => f.id);

      // 全トランザクション取得（実現損益計算用）
      const transactionsMapResult = transactionRepository.listByFundIdsGrouped(fundIds);
      if (!transactionsMapResult.success) {
        return transactionsMapResult as Result<Portfolio>;
      }

      // 全トランザクションでPortfolio計算
      const allTransactions = Array.from(transactionsMapResult.value.values()).flat();

      const summary = calculatePortfolio(holdings, allTransactions);
      return {
        success: true,
        value: {
          ...summary,
          holdings,
        },
      };
    },
  };
}
