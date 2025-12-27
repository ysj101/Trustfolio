import type { Nav, Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import type { NavRepository } from '../repository/NavRepository';
import { generateUlid } from '../utils/ulid';

export type NavUseCase = {
  getNavHistory: (fundId: string) => Result<Nav[]>;
  registerNav: (input: { fundId: string; date: string; value: number }) => Result<Nav>;
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
        return fundResult as Result<Nav[]>;
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' },
        };
      }

      return navRepository.listByFundId(fundId);
    },
    registerNav: (input: { fundId: string; date: string; value: number }): Result<Nav> => {
      const { fundId, date, value } = input;

      if (typeof fundId !== 'string' || fundId.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄を選択してください。', field: 'fundId' },
        };
      }

      if (!isValidIsoDate(date)) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '日付はYYYY-MM-DD形式で入力してください。',
            field: 'date',
          },
        };
      }

      if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '基準価額は0より大きい数値で入力してください。',
            field: 'value',
          },
        };
      }

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return fundResult as Result<Nav>;
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' },
        };
      }

      const existingResult = navRepository.findByFundAndDate(fundId, date);
      if (!existingResult.success) {
        return existingResult;
      }
      if (existingResult.value) {
        return {
          success: false,
          error: {
            type: 'conflict',
            message: '同一日付の基準価額が既に登録されています。',
            field: 'date',
          },
        };
      }

      const nav: Nav = {
        id: generateUlid(),
        fundId,
        date,
        value,
        createdAt: new Date().toISOString(),
      };

      const createResult = navRepository.createNav(nav);
      if (!createResult.success) {
        return createResult as Result<Nav>;
      }

      return { success: true, value: nav };
    },
  };
}

function isValidIsoDate(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}
