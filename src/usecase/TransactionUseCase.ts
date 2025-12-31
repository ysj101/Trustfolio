import type { Result, Transaction } from '../domain/types';
import { calculateUnits } from '../domain/PurchaseCalculator';
import type { FundRepository } from '../repository/FundRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import { generateUlid } from '../utils/ulid';

export type TransactionUseCase = {
  getHistory: (fundId: string) => Result<Transaction[]>;
  executeSpotPurchase: (input: {
    fundId: string;
    date: string;
    amount: number;
    navValue: number;
  }) => Result<Transaction>;
  /**
   * 既存のスポット購入履歴を更新する。
   * 全項目を指定して更新する（作成日時は保持する）。
   */
  updateSpotPurchase: (input: {
    id: string;
    fundId: string;
    date: string;
    amount: number;
    navValue: number;
  }) => Result<Transaction>;
  /**
   * 既存のスポット購入履歴を削除する。
   */
  deleteSpotPurchase: (transactionId: string) => Result<Transaction>;
};

/**
 * スポット購入のユースケース。
 */
export function createTransactionUseCase(
  fundRepository: FundRepository,
  transactionRepository: TransactionRepository
): TransactionUseCase {
  return {
    getHistory: (fundId: string): Result<Transaction[]> => {
      if (typeof fundId !== 'string' || fundId.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄を選択してください。', field: 'fundId' },
        };
      }

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return fundResult as Result<Transaction[]>;
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' },
        };
      }

      return transactionRepository.listByFundId(fundId);
    },
    executeSpotPurchase: (input: {
      fundId: string;
      date: string;
      amount: number;
      navValue: number;
    }): Result<Transaction> => {
      const validateResult = validateSpotPurchaseInput(input);
      if (!validateResult.success) {
        return validateResult as Result<Transaction>;
      }

      const { fundId, date, amount, navValue } = validateResult.value;

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return fundResult as Result<Transaction>;
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' },
        };
      }

      const unitsResult = calculateUnits(amount, navValue);
      if (!unitsResult.success) {
        return unitsResult;
      }

      const transaction: Transaction = {
        id: generateUlid(),
        fundId,
        type: 'SPOT_PURCHASE',
        date,
        amount,
        navValue,
        units: unitsResult.value,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: new Date().toISOString(),
      };

      const createResult = transactionRepository.createTransaction(transaction);
      if (!createResult.success) {
        return createResult as Result<Transaction>;
      }

      return { success: true, value: transaction };
    },
    updateSpotPurchase: (input): Result<Transaction> => {
      if (typeof input.id !== 'string' || input.id.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '取引IDが不正です。', field: 'id' },
        };
      }

      const validateResult = validateSpotPurchaseInput(input);
      if (!validateResult.success) {
        return validateResult as Result<Transaction>;
      }

      const { fundId, date, amount, navValue } = validateResult.value;

      const existingResult = transactionRepository.findById(input.id);
      if (!existingResult.success) {
        return existingResult as Result<Transaction>;
      }
      if (!existingResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の取引履歴が存在しません。', field: 'id' },
        };
      }
      if (existingResult.value.type !== 'SPOT_PURCHASE') {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '積立購入の取引履歴は編集できません。',
            field: 'id',
          },
        };
      }

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return fundResult as Result<Transaction>;
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' },
        };
      }

      const unitsResult = calculateUnits(amount, navValue);
      if (!unitsResult.success) {
        return unitsResult;
      }

      const transaction: Transaction = {
        id: existingResult.value.id,
        fundId,
        type: 'SPOT_PURCHASE',
        date,
        amount,
        navValue,
        units: unitsResult.value,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: existingResult.value.createdAt,
      };

      const updateResult = transactionRepository.updateTransaction(transaction);
      if (!updateResult.success) {
        return updateResult as Result<Transaction>;
      }

      return { success: true, value: transaction };
    },
    deleteSpotPurchase: (transactionId: string): Result<Transaction> => {
      if (typeof transactionId !== 'string' || transactionId.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '取引IDが不正です。', field: 'id' },
        };
      }

      const existingResult = transactionRepository.findById(transactionId);
      if (!existingResult.success) {
        return existingResult as Result<Transaction>;
      }
      if (!existingResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の取引履歴が存在しません。', field: 'id' },
        };
      }
      if (existingResult.value.type !== 'SPOT_PURCHASE') {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '積立購入の取引履歴は削除できません。',
            field: 'id',
          },
        };
      }

      const deleteResult = transactionRepository.deleteTransaction(transactionId);
      if (!deleteResult.success) {
        return deleteResult as Result<Transaction>;
      }

      return { success: true, value: existingResult.value };
    },
  };
}

/**
 * スポット購入の入力値を検証し、正規化済みの値を返す。
 */
function validateSpotPurchaseInput(input: {
  fundId: string;
  date: string;
  amount: number;
  navValue: number;
}): Result<{
  fundId: string;
  date: string;
  amount: number;
  navValue: number;
}> {
  const { fundId, date, amount, navValue } = input;

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
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '購入金額は0より大きい数値で入力してください。',
        field: 'amount',
      },
    };
  }
  if (typeof navValue !== 'number' || Number.isNaN(navValue) || navValue <= 0) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '基準価額は0より大きい数値で入力してください。',
        field: 'navValue',
      },
    };
  }

  return { success: true, value: { fundId, date, amount, navValue } };
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
