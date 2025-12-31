import { SHEET_NAMES } from '../Config';
import type { AppError, Result, Transaction } from '../domain/types';
import type { SheetRepository } from './SheetRepository';

export type TransactionRepository = {
  listByFundId: (fundId: string) => Result<Transaction[]>;
  createTransaction: (transaction: Transaction) => Result<void>;
  findByIdempotencyKey: (idempotencyKey: string) => Result<Transaction | null>;
  findById: (transactionId: string) => Result<Transaction | null>;
  updateTransaction: (transaction: Transaction) => Result<void>;
  deleteTransaction: (transactionId: string) => Result<void>;
};

/**
 * 取引履歴シートへのアクセスを担当する。
 */
export function createTransactionRepository(
  sheetRepository: SheetRepository
): TransactionRepository {
  const repository: TransactionRepository = {
    listByFundId: (fundId: string): Result<Transaction[]> => {
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.TRANSACTIONS);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const transactions: Transaction[] = [];
      for (const [index, row] of rowsResult.value.entries()) {
        // 空行はスキップ
        const isEmpty = row.every((cell) => cell === '' || cell === null || cell === undefined);
        if (isEmpty) {
          continue;
        }

        const parsed = parseRow(row, index);
        if (!parsed.success) {
          return parsed;
        }
        if (parsed.value.fundId === fundId) {
          transactions.push(parsed.value);
        }
      }

      transactions.sort((a, b) => (a.date < b.date ? 1 : -1));

      return { success: true, value: transactions };
    },
    createTransaction: (transaction: Transaction): Result<void> => {
      return sheetRepository.appendRows(SHEET_NAMES.TRANSACTIONS, [
        [
          transaction.id,
          transaction.fundId,
          transaction.type,
          transaction.date,
          transaction.amount,
          transaction.fee,
          transaction.navValue,
          transaction.units,
          transaction.recurringPurchaseId ?? '',
          transaction.idempotencyKey ?? '',
          transaction.createdAt,
        ],
      ]);
    },
    findByIdempotencyKey: (idempotencyKey: string): Result<Transaction | null> => {
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.TRANSACTIONS);
      if (!rowsResult.success) {
        return rowsResult;
      }

      for (let index = 0; index < rowsResult.value.length; index += 1) {
        const row = rowsResult.value[index];
        // 空行はスキップ
        const isEmpty = row.every((cell) => cell === '' || cell === null || cell === undefined);
        if (isEmpty) {
          continue;
        }

        const parsed = parseRow(row, index);
        if (!parsed.success) {
          return parsed;
        }
        if (parsed.value.idempotencyKey === idempotencyKey) {
          return { success: true, value: parsed.value };
        }
      }

      return { success: true, value: null };
    },
    findById: (transactionId: string): Result<Transaction | null> => {
      const findResult = findTransactionRow(sheetRepository, transactionId);
      if (!findResult.success) {
        return findResult;
      }
      return { success: true, value: findResult.value?.transaction ?? null };
    },
    updateTransaction: (transaction: Transaction): Result<void> => {
      const findResult = findTransactionRow(sheetRepository, transaction.id);
      if (!findResult.success) {
        return findResult;
      }
      if (findResult.value === null) {
        return fail('not_found', `対象の取引履歴が見つかりません: id=${transaction.id}`);
      }

      return sheetRepository.updateRow(SHEET_NAMES.TRANSACTIONS, findResult.value.rowIndex, [
        transaction.id,
        transaction.fundId,
        transaction.type,
        transaction.date,
        transaction.amount,
        transaction.fee,
        transaction.navValue,
        transaction.units,
        transaction.recurringPurchaseId ?? '',
        transaction.idempotencyKey ?? '',
        transaction.createdAt,
      ]);
    },
    deleteTransaction: (transactionId: string): Result<void> => {
      const findResult = findTransactionRow(sheetRepository, transactionId);
      if (!findResult.success) {
        return findResult;
      }
      if (findResult.value === null) {
        return fail('not_found', `対象の取引履歴が見つかりません: id=${transactionId}`);
      }

      return sheetRepository.deleteRow(SHEET_NAMES.TRANSACTIONS, findResult.value.rowIndex);
    },
  };

  return repository;
}

/**
 * 取引IDから該当行を検索する。
 */
function findTransactionRow(
  sheetRepository: SheetRepository,
  transactionId: string
): Result<{ rowIndex: number; transaction: Transaction } | null> {
  const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.TRANSACTIONS);
  if (!rowsResult.success) {
    return rowsResult;
  }

  for (let index = 0; index < rowsResult.value.length; index += 1) {
    const row = rowsResult.value[index];
    // 空行はスキップ
    const isEmpty = row.every((cell) => cell === '' || cell === null || cell === undefined);
    if (isEmpty) {
      continue;
    }

    const parsed = parseRow(row, index);
    if (!parsed.success) {
      return parsed;
    }
    if (parsed.value.id === transactionId) {
      return { success: true, value: { rowIndex: index, transaction: parsed.value } };
    }
  }

  return { success: true, value: null };
}

function parseRow(row: unknown[], index: number): Result<Transaction> {
  const [
    id,
    fundId,
    type,
    date,
    amount,
    fee,
    navValue,
    units,
    recurringPurchaseId,
    idempotencyKey,
    createdAt,
  ] = row;

  if (typeof id !== 'string' || id === '') {
    return fail('unexpected', `transactionsの${String(index + 2)}行目のidが不正です。`);
  }
  if (typeof fundId !== 'string' || fundId === '') {
    return fail('unexpected', `transactionsの${String(index + 2)}行目のfundIdが不正です。`);
  }
  if (type !== 'SPOT_PURCHASE' && type !== 'RECURRING_PURCHASE') {
    return fail('unexpected', `transactionsの${String(index + 2)}行目のtypeが不正です。`);
  }

  // dateはスプレッドシートからDateオブジェクトとして返される可能性があるため、文字列に変換
  let dateStr: string;
  if (date instanceof Date) {
    // Dateオブジェクトが無効な日付でないかチェック
    if (Number.isNaN(date.getTime())) {
      return fail(
        'unexpected',
        `transactionsの${String(index + 2)}行目のdateが無効な日付です。値: ${String(date)}`
      );
    }
    dateStr = formatDateToIso(date);
  } else if (typeof date === 'string' && date !== '') {
    dateStr = date;
  } else {
    return fail(
      'unexpected',
      `transactionsの${String(index + 2)}行目のdateが不正です。型: ${typeof date}, 値: ${String(date)}`
    );
  }
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return fail('unexpected', `transactionsの${String(index + 2)}行目のamountが不正です。`);
  }
  if (typeof fee !== 'number' || Number.isNaN(fee)) {
    return fail('unexpected', `transactionsの${String(index + 2)}行目のfeeが不正です。`);
  }
  if (typeof navValue !== 'number' || Number.isNaN(navValue)) {
    return fail('unexpected', `transactionsの${String(index + 2)}行目のnavValueが不正です。`);
  }
  if (typeof units !== 'number' || Number.isNaN(units)) {
    return fail('unexpected', `transactionsの${String(index + 2)}行目のunitsが不正です。`);
  }
  if (typeof createdAt !== 'string' || createdAt === '') {
    return fail('unexpected', `transactionsの${String(index + 2)}行目のcreatedAtが不正です。`);
  }

  return {
    success: true,
    value: {
      id,
      fundId,
      type,
      date: dateStr,
      amount,
      fee,
      navValue,
      units,
      recurringPurchaseId: normalizeOptionalString(recurringPurchaseId),
      idempotencyKey: normalizeOptionalString(idempotencyKey),
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

function fail<T>(type: AppError['type'], message: string): Result<T> {
  return { success: false, error: { type, message } };
}

/**
 * DateオブジェクトをYYYY-MM-DD形式の文字列に変換する。
 * タイムゾーンに依存せず、Dateオブジェクトのローカル日付を使用する。
 */
function formatDateToIso(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
