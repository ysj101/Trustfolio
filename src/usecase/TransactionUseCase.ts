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
   * 売却取引を登録する。
   * 入力されたunitsは正の値で受け取り、内部で負の値に変換して保存する。
   */
  executeSaleTransaction: (input: {
    fundId: string;
    date: string;
    units: number;
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
   * 既存の売却取引を更新する。
   * 全項目を指定して更新する（作成日時は保持する）。
   */
  updateSaleTransaction: (input: {
    id: string;
    fundId: string;
    date: string;
    units: number;
    navValue: number;
  }) => Result<Transaction>;
  /**
   * 既存のスポット購入または売却取引を削除する。
   * 積立購入の取引は削除できない。
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
    executeSaleTransaction: (input: {
      fundId: string;
      date: string;
      units: number;
      navValue: number;
    }): Result<Transaction> => {
      const validateResult = validateSaleTransactionInput(input);
      if (!validateResult.success) {
        return validateResult as Result<Transaction>;
      }

      const { fundId, date, units, navValue } = validateResult.value;

      // 銘柄の存在確認
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

      // 売却日時点での保有口数をチェック
      const transactionsResult = transactionRepository.listByFundId(fundId);
      if (!transactionsResult.success) {
        return transactionsResult as Result<Transaction>;
      }

      // 売却日以前の取引から保有口数を計算（同日の取引も含む）
      // 同日の購入・売却は許容するが、売却後に口数がマイナスにならないことを確認
      const holdingUnits = transactionsResult.value
        .filter((t) => t.date <= date)
        .reduce((sum, t) => sum + t.units, 0);

      // 売却後に口数がマイナスにならないことを確認
      if (holdingUnits - units < 0) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: `売却口数が保有口数を超えています。売却日時点の保有口数: ${holdingUnits.toFixed(0)}口`,
            field: 'units',
          },
        };
      }

      // 売却金額の計算: amount = units * navValue / 10000
      const amount = Math.round((units / 10000) * navValue);

      const transaction: Transaction = {
        id: generateUlid(),
        fundId,
        type: 'REDEMPTION',
        date,
        amount,
        navValue,
        units: -units, // 売却口数は負の値で保存
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
    updateSaleTransaction: (input: {
      id: string;
      fundId: string;
      date: string;
      units: number;
      navValue: number;
    }): Result<Transaction> => {
      if (typeof input.id !== 'string' || input.id.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '取引IDが不正です。', field: 'id' },
        };
      }

      const validateResult = validateSaleTransactionInput(input);
      if (!validateResult.success) {
        return validateResult as Result<Transaction>;
      }

      const { fundId, date, units, navValue } = validateResult.value;

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
      if (existingResult.value.type !== 'REDEMPTION') {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '売却取引以外の取引履歴は編集できません。',
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

      // 売却日時点での保有口数をチェック（更新対象の売却取引を除く）
      const transactionsResult = transactionRepository.listByFundId(fundId);
      if (!transactionsResult.success) {
        return transactionsResult as Result<Transaction>;
      }

      // 売却日以前の取引から保有口数を計算（更新対象の取引は除外、同日の取引も含む）
      // 同日の購入・売却は許容するが、更新後に口数がマイナスにならないことを確認
      const holdingUnits = transactionsResult.value
        .filter((t) => t.date <= date && t.id !== input.id)
        .reduce((sum, t) => sum + t.units, 0);

      // 売却後に口数がマイナスにならないことを確認
      if (holdingUnits - units < 0) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: `売却口数が保有口数を超えています。売却日時点の保有口数: ${holdingUnits.toFixed(0)}口`,
            field: 'units',
          },
        };
      }

      // 売却金額の計算
      const amount = Math.round((units / 10000) * navValue);

      const transaction: Transaction = {
        id: existingResult.value.id,
        fundId,
        type: 'REDEMPTION',
        date,
        amount,
        navValue,
        units: -units,
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
      // 積立購入の取引履歴は削除できない（スポット購入と売却は削除可能）
      if (existingResult.value.type === 'RECURRING_PURCHASE') {
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

/**
 * 売却取引の入力値を検証し、正規化済みの値を返す。
 */
function validateSaleTransactionInput(input: {
  fundId: string;
  date: string;
  units: number;
  navValue: number;
}): Result<{
  fundId: string;
  date: string;
  units: number;
  navValue: number;
}> {
  const { fundId, date, units, navValue } = input;

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
  if (typeof units !== 'number' || Number.isNaN(units) || units <= 0) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '売却口数は0より大きい数値で入力してください。',
        field: 'units',
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

  return { success: true, value: { fundId, date, units, navValue } };
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
