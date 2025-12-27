import type { Portfolio, Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import type { NavRepository } from '../repository/NavRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import { calculateHolding, calculatePortfolio } from '../domain/HoldingCalculator';

export type PortfolioUseCase = {
  getPortfolioSummary: () => Result<Portfolio>;
};

/**
 * ポートフォリオのユースケース。
 */
export function createPortfolioUseCase(
  fundRepository: FundRepository,
  navRepository: NavRepository,
  transactionRepository: TransactionRepository
): PortfolioUseCase {
  return {
    getPortfolioSummary: (): Result<Portfolio> => {
      const fundResult = fundRepository.listFunds();
      if (!fundResult.success) {
        return fundResult as Result<Portfolio>;
      }

      const holdings = [] as Portfolio['holdings'];

      for (const fund of fundResult.value) {
        const transactionResult = transactionRepository.listByFundId(fund.id);
        if (!transactionResult.success) {
          return transactionResult as Result<Portfolio>;
        }

        const navResult = navRepository.findLatestByFundId(fund.id);
        if (!navResult.success) {
          return navResult as Result<Portfolio>;
        }

        const holding = calculateHolding(fund, transactionResult.value, navResult.value);
        if (holding !== null) {
          holdings.push(holding);
        }
      }

      const summary = calculatePortfolio(holdings);
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
