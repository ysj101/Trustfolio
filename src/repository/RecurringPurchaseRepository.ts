import { SHEET_NAMES } from '../Config';
import { formatDateToIso } from '../utils/dateTime';
import { fail } from '../domain/result';
import type { RecurringPurchase, Result } from '../domain/types';
import { isValidRecurringDay } from '../domain/validators';
import {
  findRowByPredicate,
  normalizeBoolean,
  normalizeOptionalString,
  parseAllRows,
  parseNumberCell,
  parseRequiredStringCell,
  parseSheetDate,
} from './SheetMapping';
import type { SheetRepository } from './SheetRepository';

export type RecurringPurchaseRepository = {
  listAll: () => Result<RecurringPurchase[]>;
  listActive: () => Result<RecurringPurchase[]>;
  createRecurringPurchase: (recurring: RecurringPurchase) => Result<void>;
  findById: (recurringId: string) => Result<RecurringPurchase | null>;
  updateRecurringPurchase: (recurring: RecurringPurchase) => Result<void>;
  deleteRecurringPurchase: (recurringId: string) => Result<void>;
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

      return parseAllRows(rowsResult.value, parseRow);
    },
    listActive: (): Result<RecurringPurchase[]> => {
      const listResult = repository.listAll();
      if (!listResult.success) {
        return listResult;
      }

      return { success: true, value: listResult.value.filter((item) => item.isActive) };
    },
    createRecurringPurchase: (recurring: RecurringPurchase): Result<void> => {
      return sheetRepository.appendRows(SHEET_NAMES.RECURRING, [toRow(recurring)]);
    },
    findById: (recurringId: string): Result<RecurringPurchase | null> => {
      const findResult = findRecurringRow(sheetRepository, recurringId);
      if (!findResult.success) {
        return findResult;
      }
      return { success: true, value: findResult.value?.recurring ?? null };
    },
    updateRecurringPurchase: (recurring: RecurringPurchase): Result<void> => {
      const findResult = findRecurringRow(sheetRepository, recurring.id);
      if (!findResult.success) {
        return findResult;
      }
      if (findResult.value === null) {
        return fail('not_found', `対象の積立設定が見つかりません: id=${recurring.id}`);
      }

      return sheetRepository.updateRow(
        SHEET_NAMES.RECURRING,
        findResult.value.rowIndex,
        toRow(recurring)
      );
    },
    deleteRecurringPurchase: (recurringId: string): Result<void> => {
      const findResult = findRecurringRow(sheetRepository, recurringId);
      if (!findResult.success) {
        return findResult;
      }
      if (findResult.value === null) {
        return fail('not_found', `対象の積立設定が見つかりません: id=${recurringId}`);
      }

      return sheetRepository.deleteRow(SHEET_NAMES.RECURRING, findResult.value.rowIndex);
    },
  };

  return repository;
}

/**
 * 積立設定をシートの行配列へ変換する。
 * 登録（appendRows）と更新（updateRow）で同一の列順を用いるため共通化している。
 */
function toRow(recurring: RecurringPurchase): unknown[] {
  return [
    recurring.id,
    recurring.fundId,
    recurring.monthlyAmount,
    recurring.executionDay,
    recurring.startDate,
    recurring.endDate ?? '',
    recurring.isActive,
    recurring.createdAt,
  ];
}

/**
 * 積立設定IDから該当行を検索する。
 */
function findRecurringRow(
  sheetRepository: SheetRepository,
  recurringId: string
): Result<{ rowIndex: number; recurring: RecurringPurchase } | null> {
  const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.RECURRING);
  if (!rowsResult.success) {
    return rowsResult;
  }

  const found = findRowByPredicate(rowsResult.value, parseRow, (item) => item.id === recurringId);
  if (!found.success) {
    return found;
  }
  if (found.value === null) {
    return { success: true, value: null };
  }

  return {
    success: true,
    value: { rowIndex: found.value.rowIndex, recurring: found.value.entity },
  };
}

function parseRow(row: unknown[], index: number): Result<RecurringPurchase> {
  const [id, fundId, monthlyAmount, executionDay, startDate, endDate, isActive, createdAt] = row;

  const idResult = parseRequiredStringCell(id, 'recurring', 'id', index);
  if (!idResult.success) {
    return idResult;
  }
  const fundIdResult = parseRequiredStringCell(fundId, 'recurring', 'fundId', index);
  if (!fundIdResult.success) {
    return fundIdResult;
  }
  const monthlyAmountResult = parseNumberCell(monthlyAmount, 'recurring', 'monthlyAmount', index);
  if (!monthlyAmountResult.success) {
    return monthlyAmountResult;
  }
  // executionDayは「1〜28の整数」が仕様。非整数（例: 15.5）や範囲外（例: 99）が保存値として
  // 混入していると、約定日計算の formatIsoDate(year, month, day) が "2026-06-99" のような不正な
  // 日付文字列を生成し、営業日カレンダーの辞書順比較で誤った結果を招く。読み取り段階で
  // 整数判定・範囲判定の両方を fail fast に弾く。判定ルールは入力境界の validateRecurringDay と
  // 共有するため、ドメイン層の isValidRecurringDay に集約している（#133）。
  if (!isValidRecurringDay(executionDay)) {
    return fail('unexpected', `recurringの${String(index + 2)}行目のexecutionDayが不正です。`);
  }

  // startDateはスプレッドシートからDateオブジェクトとして返される可能性があるため、文字列に変換
  const startDateResult = parseSheetDate(startDate, {
    sheetLabel: 'recurring',
    fieldName: 'startDate',
    index,
    trim: false,
    quoteInvalidValue: false,
  });
  if (!startDateResult.success) {
    return startDateResult;
  }
  const startDateStr = startDateResult.value;

  // endDateはスプレッドシートからDateオブジェクトとして返される可能性があるため、文字列に変換
  // 任意項目のため、空欄はnullに正規化する（必須のstartDateとは扱いが異なる）
  let endDateStr: string | null;
  if (endDate instanceof Date) {
    // Dateオブジェクトが無効な日付でないかチェック
    if (Number.isNaN(endDate.getTime())) {
      return fail(
        'unexpected',
        `recurringの${String(index + 2)}行目のendDateが無効な日付です。値: ${String(endDate)}`
      );
    }
    endDateStr = formatDateToIso(endDate);
  } else {
    endDateStr = normalizeOptionalString(endDate);
  }

  const createdAtResult = parseRequiredStringCell(createdAt, 'recurring', 'createdAt', index);
  if (!createdAtResult.success) {
    return createdAtResult;
  }

  return {
    success: true,
    value: {
      id: idResult.value,
      fundId: fundIdResult.value,
      monthlyAmount: monthlyAmountResult.value,
      executionDay,
      startDate: startDateStr,
      endDate: endDateStr,
      isActive: normalizeBoolean(isActive),
      createdAt: createdAtResult.value,
    },
  };
}
