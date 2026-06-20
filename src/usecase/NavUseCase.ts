import type { Nav, Result } from '../domain/types';
import { propagateFailure } from '../domain/result';
import type { FundRepository } from '../repository/FundRepository';
import type { NavRepository } from '../repository/NavRepository';

export type NavUseCase = {
  getNavHistory: (fundId: string) => Result<Nav[]>;
};

/**
 * 基準価額のユースケース。
 */
export function createNavUseCase(
  fundRepository: FundRepository,
  navRepository: NavRepository
): NavUseCase {
  return {
    getNavHistory: (fundId: string): Result<Nav[]> => {
      if (typeof fundId !== 'string' || fundId.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄を選択してください。', field: 'fundId' },
        };
      }

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return propagateFailure(fundResult);
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' },
        };
      }

      return navRepository.listByFundId(fundId);
    },
  };
}
