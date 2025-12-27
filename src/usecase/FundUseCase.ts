import type { Fund, Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import { generateUlid } from '../utils/ulid';

export type FundUseCase = {
  listFunds: () => Result<Fund[]>;
  createFund: (name: string) => Result<Fund>;
};

/**
 * 投資信託のユースケース。
 */
export function createFundUseCase(fundRepository: FundRepository): FundUseCase {
  return {
    listFunds: (): Result<Fund[]> => {
      return fundRepository.listFunds();
    },
    createFund: (name: string): Result<Fund> => {
      if (typeof name !== 'string' || name.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄名を入力してください。', field: 'name' },
        };
      }

      const trimmedName = name.trim();
      const existingResult = fundRepository.findByName(trimmedName);
      if (!existingResult.success) {
        return existingResult;
      }
      if (existingResult.value) {
        return {
          success: false,
          error: { type: 'conflict', message: '同名の銘柄が既に存在します。', field: 'name' },
        };
      }

      const fund: Fund = {
        id: generateUlid(),
        name: trimmedName,
        createdAt: new Date().toISOString(),
      };

      const createResult = fundRepository.createFund(fund);
      if (!createResult.success) {
        return createResult as Result<Fund>;
      }

      return { success: true, value: fund };
    },
  };
}
