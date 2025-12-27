import type { Holding, Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import type { NavRepository } from '../repository/NavRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import { calculateHolding } from '../domain/HoldingCalculator';

export type HoldingUseCase = {
  getHolding: (fundId: string) => Result<Holding | null>;
  listHoldings: () => Result<Holding[]>;
};

/**
 * 保有情報のユースケース。
 */
export function createHoldingUseCase(
  fundRepository: FundRepository,
  navRepository: NavRepository,
  transactionRepository: TransactionRepository
): HoldingUseCase {
  return {
    getHolding: (fundId: string): Result<Holding | null> => {
      if (typeof fundId !== 'string' || fundId.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄を選択してください。', field: 'fundId' },
        };
      }

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return fundResult as Result<Holding | null>;
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' },
        };
      }

      const transactionResult = transactionRepository.listByFundId(fundId);
      if (!transactionResult.success) {
        return transactionResult as Result<Holding | null>;
      }

      const navResult = navRepository.findLatestByFundId(fundId);
      if (!navResult.success) {
        return navResult as Result<Holding | null>;
      }

      const holding = calculateHolding(fundResult.value, transactionResult.value, navResult.value);
      return { success: true, value: holding };
    },
    listHoldings: (): Result<Holding[]> => {
      const fundResult = fundRepository.listFunds();
      if (!fundResult.success) {
        return fundResult as Result<Holding[]>;
      }

      const holdings: Holding[] = [];

      for (const fund of fundResult.value) {
        const transactionResult = transactionRepository.listByFundId(fund.id);
        if (!transactionResult.success) {
          return transactionResult as Result<Holding[]>;
        }

        const navResult = navRepository.findLatestByFundId(fund.id);
        if (!navResult.success) {
          return navResult as Result<Holding[]>;
        }

        const holding = calculateHolding(fund, transactionResult.value, navResult.value);
        if (holding !== null) {
          holdings.push(holding);
        }
      }

      return { success: true, value: holdings };
    },
  };
}
