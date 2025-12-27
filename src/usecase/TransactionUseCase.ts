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
    fee: number;
    navValue: number;
  }) => Result<Transaction>;
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
          error: { type: 'validation', message: '銘柄を選択してください。', field: 'fundId' }
        };
      }

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return fundResult as Result<Transaction[]>;
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' }
        };
      }

      return transactionRepository.listByFundId(fundId);
    },
    executeSpotPurchase: (input: {
      fundId: string;
      date: string;
      amount: number;
      fee: number;
      navValue: number;
    }): Result<Transaction> => {
      const { fundId, date, amount, fee, navValue } = input;

      if (typeof fundId !== 'string' || fundId.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄を選択してください。', field: 'fundId' }
        };
      }
      if (!isValidIsoDate(date)) {
        return {
          success: false,
          error: { type: 'validation', message: '日付はYYYY-MM-DD形式で入力してください。', field: 'date' }
        };
      }
      if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
        return {
          success: false,
          error: { type: 'validation', message: '購入金額は0より大きい数値で入力してください。', field: 'amount' }
        };
      }
      if (typeof fee !== 'number' || Number.isNaN(fee) || fee < 0) {
        return {
          success: false,
          error: { type: 'validation', message: '手数料は0以上で入力してください。', field: 'fee' }
        };
      }
      if (typeof navValue !== 'number' || Number.isNaN(navValue) || navValue <= 0) {
        return {
          success: false,
          error: { type: 'validation', message: '基準価額は0より大きい数値で入力してください。', field: 'navValue' }
        };
      }

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return fundResult as Result<Transaction>;
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' }
        };
      }

      const unitsResult = calculateUnits(amount, fee, navValue);
      if (!unitsResult.success) {
        return unitsResult;
      }

      const transaction: Transaction = {
        id: generateUlid(),
        fundId,
        type: 'SPOT_PURCHASE',
        date,
        amount,
        fee,
        navValue,
        units: unitsResult.value,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: new Date().toISOString()
      };

      const createResult = transactionRepository.createTransaction(transaction);
      if (!createResult.success) {
        return createResult as Result<Transaction>;
      }

      return { success: true, value: transaction };
    }
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
