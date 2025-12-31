import type { Fund, Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import { generateUlid } from '../utils/ulid';

export type FundUseCase = {
  listFunds: () => Result<Fund[]>;
  createFund: (input: {
    name: string;
    rakutenFundId: string | null;
    settlementBusinessDays: number | null;
  }) => Result<Fund>;
  updateFund: (input: {
    id: string;
    name: string;
    rakutenFundId: string | null;
    settlementBusinessDays: number | null;
  }) => Result<Fund>;
};

/**
 * 投資信託のユースケース。
 */
export function createFundUseCase(fundRepository: FundRepository): FundUseCase {
  return {
    listFunds: (): Result<Fund[]> => {
      return fundRepository.listFunds();
    },
    createFund: (input: {
      name: string;
      rakutenFundId: string | null;
      settlementBusinessDays: number | null;
    }): Result<Fund> => {
      const { name, rakutenFundId, settlementBusinessDays } = input;

      if (typeof name !== 'string' || name.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄名を入力してください。', field: 'name' },
        };
      }

      // 楽天ファンドIDのバリデーション（設定されている場合のみ）
      if (rakutenFundId !== null) {
        const codeValidation = validateRakutenFundId(rakutenFundId);
        if (!codeValidation.success) {
          return codeValidation;
        }
      }
      if (settlementBusinessDays !== null) {
        const settlementValidation = validateSettlementBusinessDays(settlementBusinessDays);
        if (!settlementValidation.success) {
          return settlementValidation;
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
        rakutenFundId:
          rakutenFundId !== null && rakutenFundId.trim() !== '' ? rakutenFundId.trim() : null,
        settlementBusinessDays,
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
      rakutenFundId: string | null;
      settlementBusinessDays: number | null;
    }): Result<Fund> => {
      const { id, name, rakutenFundId, settlementBusinessDays } = input;

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

      // 楽天ファンドIDのバリデーション（設定されている場合のみ）
      if (rakutenFundId !== null) {
        const codeValidation = validateRakutenFundId(rakutenFundId);
        if (!codeValidation.success) {
          return codeValidation;
        }
      }
      if (settlementBusinessDays !== null) {
        const settlementValidation = validateSettlementBusinessDays(settlementBusinessDays);
        if (!settlementValidation.success) {
          return settlementValidation;
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
        rakutenFundId:
          rakutenFundId !== null && rakutenFundId.trim() !== '' ? rakutenFundId.trim() : null,
        settlementBusinessDays,
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
 * 楽天ファンドIDのバリデーション。
 * 12桁の英数字であることを確認する。
 */
function validateRakutenFundId(code: string): Result<void> {
  const trimmed = code.trim();
  if (trimmed === '') {
    return { success: true, value: undefined };
  }
  if (!/^[A-Za-z0-9]{12}$/.test(trimmed)) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '楽天ファンドIDは12桁の英数字で入力してください。',
        field: 'rakutenFundId',
      },
    };
  }
  return { success: true, value: undefined };
}

/**
 * 約定までの営業日数のバリデーション。
 * 1以上の整数であることを確認する。
 */
function validateSettlementBusinessDays(value: number): Result<void> {
  if (!Number.isInteger(value) || value < 1) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '約定までの営業日数は1以上の整数で入力してください。',
        field: 'settlementBusinessDays',
      },
    };
  }
  return { success: true, value: undefined };
}
