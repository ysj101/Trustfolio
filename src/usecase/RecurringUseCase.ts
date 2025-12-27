import type { RecurringPurchase, Result, Transaction } from '../domain/types';
import { calculateUnits } from '../domain/PurchaseCalculator';
import type { FundRepository } from '../repository/FundRepository';
import type { NavRepository } from '../repository/NavRepository';
import type { RecurringPurchaseRepository } from '../repository/RecurringPurchaseRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import { generateUlid } from '../utils/ulid';

export type SkipReason = 'ALREADY_EXECUTED' | 'NO_NAV' | 'INACTIVE' | 'NOT_TARGET_DATE';

export type ExecuteRecurringResult = {
  executed: Transaction[];
  skipped: { recurringPurchaseId: string; reason: SkipReason }[];
};

export type RecurringUseCase = {
  listRecurringPurchases: () => Result<RecurringPurchase[]>;
  createRecurringPurchase: (input: {
    fundId: string;
    monthlyAmount: number;
    executionDay: number;
    startDate: string;
    endDate: string | null;
    isActive: boolean;
  }) => Result<RecurringPurchase>;
  executeRecurringPurchases: (targetDate: string) => Result<ExecuteRecurringResult>;
};

/**
 * 積立設定のユースケース。
 */
export function createRecurringUseCase(
  fundRepository: FundRepository,
  navRepository: NavRepository,
  recurringRepository: RecurringPurchaseRepository,
  transactionRepository: TransactionRepository
): RecurringUseCase {
  return {
    listRecurringPurchases: (): Result<RecurringPurchase[]> => {
      return recurringRepository.listAll();
    },
    createRecurringPurchase: (input): Result<RecurringPurchase> => {
      const { fundId, monthlyAmount, executionDay, startDate, endDate, isActive } = input;

      if (typeof fundId !== 'string' || fundId.trim() === '') {
        return {
          success: false,
          error: { type: 'validation', message: '銘柄を選択してください。', field: 'fundId' },
        };
      }
      if (typeof monthlyAmount !== 'number' || Number.isNaN(monthlyAmount) || monthlyAmount <= 0) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '月額購入金額は0より大きい数値で入力してください。',
            field: 'monthlyAmount',
          },
        };
      }
      if (typeof executionDay !== 'number' || Number.isNaN(executionDay)) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '実行日は1〜28の範囲で入力してください。',
            field: 'executionDay',
          },
        };
      }
      if (executionDay < 1 || executionDay > 28) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '実行日は1〜28の範囲で入力してください。',
            field: 'executionDay',
          },
        };
      }
      if (!isValidIsoDate(startDate)) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '開始日はYYYY-MM-DD形式で入力してください。',
            field: 'startDate',
          },
        };
      }
      if (endDate !== null && endDate !== '' && !isValidIsoDate(endDate)) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '終了日はYYYY-MM-DD形式で入力してください。',
            field: 'endDate',
          },
        };
      }
      if (endDate !== null && endDate !== '' && parseIsoDate(endDate) < parseIsoDate(startDate)) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '終了日は開始日以降である必要があります。',
            field: 'endDate',
          },
        };
      }

      const fundResult = fundRepository.findById(fundId);
      if (!fundResult.success) {
        return fundResult as Result<RecurringPurchase>;
      }
      if (!fundResult.value) {
        return {
          success: false,
          error: { type: 'not_found', message: '対象の銘柄が存在しません。', field: 'fundId' },
        };
      }

      const recurring: RecurringPurchase = {
        id: generateUlid(),
        fundId,
        monthlyAmount,
        executionDay,
        startDate,
        endDate: endDate !== null && endDate !== '' ? endDate : null,
        isActive,
        createdAt: new Date().toISOString(),
      };

      const createResult = recurringRepository.createRecurringPurchase(recurring);
      if (!createResult.success) {
        return createResult as Result<RecurringPurchase>;
      }

      return { success: true, value: recurring };
    },
    executeRecurringPurchases: (targetDate: string): Result<ExecuteRecurringResult> => {
      if (!isValidIsoDate(targetDate)) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: '実行日はYYYY-MM-DD形式で入力してください。',
            field: 'targetDate',
          },
        };
      }

      const listResult = recurringRepository.listAll();
      if (!listResult.success) {
        return listResult as Result<ExecuteRecurringResult>;
      }

      const executed: Transaction[] = [];
      const skipped: { recurringPurchaseId: string; reason: SkipReason }[] = [];

      listResult.value.forEach((recurring) => {
        if (!recurring.isActive) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'INACTIVE' });
          return;
        }
        if (!isTargetDate(recurring, targetDate)) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NOT_TARGET_DATE' });
          return;
        }

        const idempotencyKey = `${recurring.id}_${targetDate}`;
        const existingResult = transactionRepository.findByIdempotencyKey(idempotencyKey);
        if (!existingResult.success) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NO_NAV' });
          return;
        }
        if (existingResult.value) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'ALREADY_EXECUTED' });
          return;
        }

        const navResult = navRepository.findByFundAndDate(recurring.fundId, targetDate);
        if (!navResult.success) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NO_NAV' });
          return;
        }
        if (!navResult.value) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NO_NAV' });
          return;
        }

        const unitsResult = calculateUnits(recurring.monthlyAmount, 0, navResult.value.value);
        if (!unitsResult.success) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NO_NAV' });
          return;
        }

        const transaction: Transaction = {
          id: generateUlid(),
          fundId: recurring.fundId,
          type: 'RECURRING_PURCHASE',
          date: targetDate,
          amount: recurring.monthlyAmount,
          fee: 0,
          navValue: navResult.value.value,
          units: unitsResult.value,
          recurringPurchaseId: recurring.id,
          idempotencyKey,
          createdAt: new Date().toISOString(),
        };

        const createResult = transactionRepository.createTransaction(transaction);
        if (!createResult.success) {
          skipped.push({ recurringPurchaseId: recurring.id, reason: 'NO_NAV' });
          return;
        }

        executed.push(transaction);
      });

      return { success: true, value: { executed, skipped } };
    },
  };
}

function isTargetDate(recurring: RecurringPurchase, targetDate: string): boolean {
  const target = parseIsoDate(targetDate);
  const start = parseIsoDate(recurring.startDate);
  if (target < start) {
    return false;
  }
  if (recurring.endDate !== null && recurring.endDate !== '') {
    const end = parseIsoDate(recurring.endDate);
    if (target > end) {
      return false;
    }
  }

  const day = Number(targetDate.split('-')[2]);
  return day === recurring.executionDay;
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

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}
