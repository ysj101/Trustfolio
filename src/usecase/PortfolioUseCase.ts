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
      const fundResult = fundRepository.listFunds();
      if (!fundResult.success) {
        return fundResult as Result<Portfolio>;
      }

      const holdingsResult = holdingUseCase.listHoldings();
      if (!holdingsResult.success) {
        return holdingsResult as Result<Portfolio>;
      }

      const holdings = holdingsResult.value;

      // 全ファンドのIDリストを取得
      const fundIds = fundResult.value.map((f) => f.id);

      // 全取引履歴を収集（実現損益計算用）
      const allTransactionsResult = transactionRepository.listAll(fundIds);
      if (!allTransactionsResult.success) {
        return allTransactionsResult as Result<Portfolio>;
      }

      const summary = calculatePortfolio(holdings, allTransactionsResult.value);
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
