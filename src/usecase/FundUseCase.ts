import type { Fund, Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import { generateUlid } from '../utils/ulid';

export type FundUseCase = {
  listFunds: () => Result<Fund[]>;
  createFund: (input: { name: string; morningstarCode: string | null }) => Result<Fund>;
  updateFund: (input: { id: string; name: string; morningstarCode: string | null }) => Result<Fund>;
};

/**
 * 投資信託のユースケース。
 */
export function createFundUseCase(fundRepository: FundRepository): FundUseCase {
  return {
    listFunds: (): Result<Fund[]> => {
      return fundRepository.listFunds();
    },
    createFund: (input: { name: string; morningstarCode: string | null }): Result<Fund> => {
      const { name, morningstarCode } = input;

      if (typeof name !== 'string' || name.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄名を入力してください。', field: 'name' },
        };
      }

      // モーニングスターコードのバリデーション（設定されている場合のみ）
      if (morningstarCode !== null) {
        const codeValidation = validateMorningstarCode(morningstarCode);
        if (!codeValidation.success) {
          return codeValidation;
        }
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
        morningstarCode:
          morningstarCode !== null && morningstarCode.trim() !== '' ? morningstarCode.trim() : null,
        createdAt: new Date().toISOString(),
      };

      const createResult = fundRepository.createFund(fund);
      if (!createResult.success) {
        return createResult as Result<Fund>;
      }

      return { success: true, value: fund };
    },
    updateFund: (input: {
      id: string;
      name: string;
      morningstarCode: string | null;
    }): Result<Fund> => {
      const { id, name, morningstarCode } = input;

      if (typeof id !== 'string' || id.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄IDが不正です。', field: 'id' },
        };
      }

      if (typeof name !== 'string' || name.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄名を入力してください。', field: 'name' },
        };
      }

      // モーニングスターコードのバリデーション（設定されている場合のみ）
      if (morningstarCode !== null) {
        const codeValidation = validateMorningstarCode(morningstarCode);
        if (!codeValidation.success) {
          return codeValidation;
        }
      }

      const existingResult = fundRepository.findById(id);
      if (!existingResult.success) {
        return existingResult;
      }
      if (!existingResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'id' },
        };
      }

      const trimmedName = name.trim();
      // 同名の他の銘柄が存在するか確認
      const duplicateResult = fundRepository.findByName(trimmedName);
      if (!duplicateResult.success) {
        return duplicateResult;
      }
      if (duplicateResult.value && duplicateResult.value.id !== id) {
        return {
          success: false,
          error: { type: 'conflict', message: '同名の銘柄が既に存在します。', field: 'name' },
        };
      }

      const updatedFund: Fund = {
        id,
        name: trimmedName,
        morningstarCode:
          morningstarCode !== null && morningstarCode.trim() !== '' ? morningstarCode.trim() : null,
        createdAt: existingResult.value.createdAt,
      };

      const updateResult = fundRepository.updateFund(updatedFund);
      if (!updateResult.success) {
        return updateResult as Result<Fund>;
      }

      return { success: true, value: updatedFund };
    },
  };
}

/**
 * モーニングスターコードのバリデーション。
 * 10桁の数字であることを確認する。
 */
function validateMorningstarCode(code: string): Result<void> {
  const trimmed = code.trim();
  if (trimmed === '') {
    return { success: true, value: undefined };
  }
  if (!/^\d{10}$/.test(trimmed)) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: 'モーニングスターコードは10桁の数字で入力してください。',
        field: 'morningstarCode',
      },
    };
  }
  return { success: true, value: undefined };
}
