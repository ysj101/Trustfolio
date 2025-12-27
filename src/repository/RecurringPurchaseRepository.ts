import { SHEET_NAMES } from '../Config';
import type { AppError, RecurringPurchase, Result } from '../domain/types';
import type { SheetRepository } from './SheetRepository';

export type RecurringPurchaseRepository = {
  listAll: () => Result<RecurringPurchase[]>;
  listActive: () => Result<RecurringPurchase[]>;
  createRecurringPurchase: (recurring: RecurringPurchase) => Result<void>;
};

/**
 * 積立設定シートへのアクセスを担当する。
 */
export function createRecurringPurchaseRepository(
  sheetRepository: SheetRepository
): RecurringPurchaseRepository {
  const repository: RecurringPurchaseRepository = {
    listAll: (): Result<RecurringPurchase[]> => {
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.RECURRING);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const recurrings: RecurringPurchase[] = [];
      for (const [index, row] of rowsResult.value.entries()) {
        const parsed = parseRow(row, index);
        if (!parsed.success) {
          return parsed;
        }
        recurrings.push(parsed.value);
      }

      return { success: true, value: recurrings };
    },
    listActive: (): Result<RecurringPurchase[]> => {
      const listResult = repository.listAll();
      if (!listResult.success) {
        return listResult;
      }

      return { success: true, value: listResult.value.filter((item) => item.isActive) };
    },
    createRecurringPurchase: (recurring: RecurringPurchase): Result<void> => {
      return sheetRepository.appendRows(SHEET_NAMES.RECURRING, [
        [
          recurring.id,
          recurring.fundId,
          recurring.monthlyAmount,
          recurring.executionDay,
          recurring.startDate,
          recurring.endDate ?? '',
          recurring.isActive,
          recurring.createdAt,
        ],
      ]);
    },
  };

  return repository;
}

function parseRow(row: unknown[], index: number): Result<RecurringPurchase> {
  const [id, fundId, monthlyAmount, executionDay, startDate, endDate, isActive, createdAt] = row;

  if (typeof id !== 'string' || id === '') {
    return fail('unexpected', `recurringの${String(index + 2)}行目のidが不正です。`);
  }
  if (typeof fundId !== 'string' || fundId === '') {
    return fail('unexpected', `recurringの${String(index + 2)}行目のfundIdが不正です。`);
  }
  if (typeof monthlyAmount !== 'number' || Number.isNaN(monthlyAmount)) {
    return fail('unexpected', `recurringの${String(index + 2)}行目のmonthlyAmountが不正です。`);
  }
  if (typeof executionDay !== 'number' || Number.isNaN(executionDay)) {
    return fail('unexpected', `recurringの${String(index + 2)}行目のexecutionDayが不正です。`);
  }
  if (typeof startDate !== 'string' || startDate === '') {
    return fail('unexpected', `recurringの${String(index + 2)}行目のstartDateが不正です。`);
  }
  if (typeof createdAt !== 'string' || createdAt === '') {
    return fail('unexpected', `recurringの${String(index + 2)}行目のcreatedAtが不正です。`);
  }

  return {
    success: true,
    value: {
      id,
      fundId,
      monthlyAmount,
      executionDay,
      startDate,
      endDate: normalizeOptionalString(endDate),
      isActive: normalizeBoolean(isActive),
      createdAt,
    },
  };
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return false;
}

function fail<T>(type: AppError['type'], message: string): Result<T> {
  return { success: false, error: { type, message } };
}
