import {
  SHEET_HEADERS,
  SHEET_NAMES,
  getTransactionSheetName,
  type SheetDefinition,
} from '../Config';
import { fail } from '../domain/result';
import type { Result, Transaction } from '../domain/types';
import { findRowByPredicate, parseAllRows, parseSheetDate } from './SheetMapping';
import type { SheetRepository } from './SheetRepository';

export type TransactionRepository = {
  listByFundId: (fundId: string) => Result<Transaction[]>;
  listAll: (fundIds: string[]) => Result<Transaction[]>;
  listByFundIdsGrouped: (fundIds: string[]) => Result<Map<string, Transaction[]>>;
  createTransaction: (transaction: Transaction) => Result<void>;
  findByIdempotencyKey: (idempotencyKey: string, fundIds: string[]) => Result<Transaction | null>;
  findById: (transactionId: string, fundId: string) => Result<Transaction | null>;
  updateTransaction: (transaction: Transaction) => Result<void>;
  deleteTransaction: (transactionId: string, fundId: string) => Result<void>;
};

/**
 * 取引履歴シートへのアクセスを担当する。
 */
export function createTransactionRepository(
  sheetRepository: SheetRepository
): TransactionRepository {
  const repository: TransactionRepository = {
    listByFundId: (fundId: string): Result<Transaction[]> => {
      const sheetName = getTransactionSheetName(fundId);
      const rowsResult = sheetRepository.readAllRows(sheetName as never);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const parsedResult = parseAllRows(rowsResult.value, parseRow);
      if (!parsedResult.success) {
        return parsedResult;
      }

      const transactions = parsedResult.value;
      transactions.sort((a, b) => (a.date < b.date ? 1 : -1));

      return { success: true, value: transactions };
    },
    listAll: (fundIds: string[]): Result<Transaction[]> => {
      const allTransactions: Transaction[] = [];

      for (const fundId of fundIds) {
        const sheetName = getTransactionSheetName(fundId);
        const rowsResult = sheetRepository.readAllRows(sheetName as never);

        // シートが存在しない場合はスキップ(エラーにしない)
        if (!rowsResult.success) {
          continue;
        }

        const parsedResult = parseAllRows(rowsResult.value, parseRow);
        if (!parsedResult.success) {
          return parsedResult;
        }
        allTransactions.push(...parsedResult.value);
      }

      allTransactions.sort((a, b) => (a.date < b.date ? 1 : -1));

      return { success: true, value: allTransactions };
    },
    listByFundIdsGrouped: (fundIds: string[]): Result<Map<string, Transaction[]>> => {
      // 各ファンドIDに対するトランザクション配列を保持するMap
      const transactionsMap = new Map<string, Transaction[]>();

      // fundIdsを初期化（トランザクションが存在しないファンドには空配列を設定）
      for (const fundId of fundIds) {
        transactionsMap.set(fundId, []);
      }

      // 各ファンドのトランザクションシートを読み込み
      for (const fundId of fundIds) {
        const sheetName = getTransactionSheetName(fundId);
        const rowsResult = sheetRepository.readAllRows(sheetName as never);

        // シートが存在しない場合はスキップ(エラーにしない)
        if (!rowsResult.success) {
          continue;
        }

        const parsedResult = parseAllRows(rowsResult.value, parseRow);
        if (!parsedResult.success) {
          return parsedResult;
        }

        // 日付でソート（降順）
        const transactions = parsedResult.value;
        transactions.sort((a, b) => (a.date < b.date ? 1 : -1));

        // Mapに格納
        transactionsMap.set(fundId, transactions);
      }

      return { success: true, value: transactionsMap };
    },
    createTransaction: (transaction: Transaction): Result<void> => {
      const sheetNameResult = ensureTransactionSheet(sheetRepository, transaction.fundId);
      if (!sheetNameResult.success) {
        return sheetNameResult;
      }

      return sheetRepository.appendRows(sheetNameResult.value as never, [toRow(transaction)]);
    },
    findByIdempotencyKey: (
      idempotencyKey: string,
      fundIds: string[]
    ): Result<Transaction | null> => {
      for (const fundId of fundIds) {
        const sheetName = getTransactionSheetName(fundId);
        const rowsResult = sheetRepository.readAllRows(sheetName as never);

        // シートが存在しない場合はスキップ
        if (!rowsResult.success) {
          continue;
        }

        const found = findRowByPredicate(
          rowsResult.value,
          parseRow,
          (transaction) => transaction.idempotencyKey === idempotencyKey
        );
        if (!found.success) {
          return found;
        }
        if (found.value !== null) {
          return { success: true, value: found.value.entity };
        }
      }

      return { success: true, value: null };
    },
    findById: (transactionId: string, fundId: string): Result<Transaction | null> => {
      const findResult = findTransactionRow(sheetRepository, transactionId, fundId);
      if (!findResult.success) {
        return findResult;
      }
      return { success: true, value: findResult.value?.transaction ?? null };
    },
    updateTransaction: (transaction: Transaction): Result<void> => {
      const findResult = findTransactionRow(sheetRepository, transaction.id, transaction.fundId);
      if (!findResult.success) {
        return findResult;
      }
      if (findResult.value === null) {
        return fail('not_found', `対象の取引履歴が見つかりません: id=${transaction.id}`);
      }

      const sheetName = getTransactionSheetName(transaction.fundId);
      return sheetRepository.updateRow(
        sheetName as never,
        findResult.value.rowIndex,
        toRow(transaction)
      );
    },
    deleteTransaction: (transactionId: string, fundId: string): Result<void> => {
      const findResult = findTransactionRow(sheetRepository, transactionId, fundId);
      if (!findResult.success) {
        return findResult;
      }
      if (findResult.value === null) {
        return fail('not_found', `対象の取引履歴が見つかりません: id=${transactionId}`);
      }

      const sheetName = getTransactionSheetName(fundId);
      return sheetRepository.deleteRow(sheetName as never, findResult.value.rowIndex);
    },
  };

  return repository;
}

/**
 * 取引をシートの行配列へ変換する。
 * 登録（appendRows）と更新（updateRow）で同一の列順を用いるため共通化している。
 */
function toRow(transaction: Transaction): unknown[] {
  return [
    transaction.id,
    transaction.fundId,
    transaction.type,
    transaction.date,
    transaction.amount,
    transaction.navValue,
    transaction.units,
    transaction.recurringPurchaseId ?? '',
    transaction.idempotencyKey ?? '',
    transaction.createdAt,
  ];
}

/**
 * ファンドIDから取引シート名を取得し、シートを確保する
 * @param sheetRepository シートリポジトリ
 * @param fundId ファンドID
 * @returns シート名またはエラー
 */
function ensureTransactionSheet(sheetRepository: SheetRepository, fundId: string): Result<string> {
  const sheetName = getTransactionSheetName(fundId);
  const definition: SheetDefinition = {
    name: sheetName as never, // SheetNameは静的な型なので動的シート名をキャスト
    headers: SHEET_HEADERS[SHEET_NAMES.TRANSACTIONS],
  };

  const ensureResult = sheetRepository.ensureSheet(definition);
  if (!ensureResult.success) {
    return ensureResult;
  }

  return { success: true, value: sheetName };
}

/**
 * 取引IDから該当行を検索する(ファンド別シート対応)
 * @param sheetRepository シートリポジトリ
 * @param transactionId 取引ID
 * @param fundId ファンドID
 * @returns 行インデックスと取引データ、またはnull
 */
function findTransactionRow(
  sheetRepository: SheetRepository,
  transactionId: string,
  fundId: string
): Result<{ rowIndex: number; transaction: Transaction } | null> {
  const sheetName = getTransactionSheetName(fundId);
  const rowsResult = sheetRepository.readAllRows(sheetName as never);
  if (!rowsResult.success) {
    return rowsResult;
  }

  const found = findRowByPredicate(
    rowsResult.value,
    parseRow,
    (transaction) => transaction.id === transactionId
  );
  if (!found.success) {
    return found;
  }
  if (found.value === null) {
    return { success: true, value: null };
  }

  return {
    success: true,
    value: { rowIndex: found.value.rowIndex, transaction: found.value.entity },
  };
}

function parseRow(row: unknown[], index: number): Result<Transaction> {
  const [
    id,
    fundId,
    type,
    date,
    amount,
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
  if (type !== 'SPOT_PURCHASE' && type !== 'RECURRING_PURCHASE' && type !== 'REDEMPTION') {
    return fail('unexpected', `transactionsの${String(index + 2)}行目のtypeが不正です。`);
  }

  // dateはスプレッドシートからDateオブジェクトとして返される可能性があるため、文字列に変換
  const dateResult = parseSheetDate(date, {
    sheetLabel: 'transactions',
    fieldName: 'date',
    index,
    trim: false,
    quoteInvalidValue: false,
  });
  if (!dateResult.success) {
    return dateResult;
  }
  const dateStr = dateResult.value;

  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return fail('unexpected', `transactionsの${String(index + 2)}行目のamountが不正です。`);
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
