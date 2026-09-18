import {
  SHEET_HEADERS,
  SHEET_NAMES,
  getTransactionSheetName,
  type SheetDefinition,
} from '../Config';
import { fail } from '../domain/result';
import type { Result, Transaction } from '../domain/types';
import {
  findRowByPredicate,
  normalizeOptionalString,
  parseAllRows,
  parseNumberCell,
  parseOptionalNonNegativeNumberCell,
  parseRequiredStringCell,
  parseSheetDate,
} from './SheetMapping';
import type { SheetRepository } from './SheetRepository';

export type TransactionRepository = {
  /**
   * 指定したファンドの取引履歴を取得する。
   *
   * 取引シートが存在しない場合は、そのファンドの取引が0件であると明示的に解釈して空配列を返す。
   *
   * @param fundId 取引履歴を取得するファンドID
   * @returns 取得・解析済みの取引履歴、または取得失敗
   */
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
 * 取引一覧を取引日の降順に並べ、同一取引日の取引は登録日時の降順に並べる。
 *
 * 取引履歴では新しい取引を先に表示するため、dateを第1ソートキー、createdAtを第2ソートキーとして比較する。
 * この関数は受け取った配列自体を変更するため、呼び出し元が保持する並び順も更新される点に注意する。
 *
 * @param transactions 並べ替える取引一覧
 */
function sortTransactionsByDateDescending(transactions: Transaction[]): void {
  transactions.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    if (a.createdAt === b.createdAt) {
      return 0;
    }
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/**
 * 指定したファンドの取引シートを読み取り、解析して取引日の降順に並べる。
 *
 * @param sheetRepository シートリポジトリ
 * @param fundId 対象ファンドID
 * @returns 解析・並べ替え済みの取引一覧、または失敗
 */
function listTransactionsByFundId(
  sheetRepository: SheetRepository,
  fundId: string
): Result<Transaction[]> {
  const rowsResult = readTransactionRows(sheetRepository, fundId);
  if (!rowsResult.success) return rowsResult;
  const parsedResult = parseAllRows(rowsResult.value, parseRow);
  if (!parsedResult.success) return parsedResult;

  sortTransactionsByDateDescending(parsedResult.value);
  return { success: true, value: parsedResult.value };
}

/**
 * 取引履歴シートへのアクセスを担当する。
 */
export function createTransactionRepository(
  sheetRepository: SheetRepository
): TransactionRepository {
  const repository: TransactionRepository = {
    listByFundId: (fundId: string): Result<Transaction[]> => {
      return listTransactionsByFundId(sheetRepository, fundId);
    },
    listAll: (fundIds: string[]): Result<Transaction[]> => {
      const allTransactions: Transaction[] = [];

      // 全ファンド分を集めた後に一度だけ並べ替える設計のため、ファンドごとに並べ替える
      // listTransactionsByFundId は使わない（使うと並べ替えが二重に走り冗長になる）。
      for (const fundId of fundIds) {
        const rowsResult = readTransactionRows(sheetRepository, fundId);

        // マイグレーション・読取の失敗は握りつぶさず即座に伝播する（fail fast）
        if (!rowsResult.success) {
          return rowsResult;
        }
        const parsedResult = parseAllRows(rowsResult.value, parseRow);
        if (!parsedResult.success) {
          return parsedResult;
        }
        allTransactions.push(...parsedResult.value);
      }

      sortTransactionsByDateDescending(allTransactions);

      return { success: true, value: allTransactions };
    },
    listByFundIdsGrouped: (fundIds: string[]): Result<Map<string, Transaction[]>> => {
      // 各ファンドIDに対するトランザクション配列を保持するMap
      const transactionsMap = new Map<string, Transaction[]>();

      // 各ファンドのトランザクションシートを読み込み
      for (const fundId of fundIds) {
        const transactionsResult = listTransactionsByFundId(sheetRepository, fundId);
        if (!transactionsResult.success) return transactionsResult;
        transactionsMap.set(fundId, transactionsResult.value);
      }

      return { success: true, value: transactionsMap };
    },
    createTransaction: (transaction: Transaction): Result<void> => {
      const sheetNameResult = ensureTransactionSheet(sheetRepository, transaction.fundId);
      if (!sheetNameResult.success) {
        return sheetNameResult;
      }

      return sheetRepository.appendRows(sheetNameResult.value, [toRow(transaction)]);
    },
    findByIdempotencyKey: (
      idempotencyKey: string,
      fundIds: string[]
    ): Result<Transaction | null> => {
      for (const fundId of fundIds) {
        const rowsResult = readTransactionRows(sheetRepository, fundId);

        // マイグレーション・読取の失敗は握りつぶさず即座に伝播する（fail fast）
        if (!rowsResult.success) {
          return rowsResult;
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
      return sheetRepository.updateRow(sheetName, findResult.value.rowIndex, toRow(transaction));
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
      return sheetRepository.deleteRow(sheetName, findResult.value.rowIndex);
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
    transaction.incomeTax ?? '',
    transaction.residentTax ?? '',
    transaction.recurringPurchaseId ?? '',
    transaction.idempotencyKey ?? '',
    transaction.createdAt,
  ];
}

/**
 * 取引シートのヘッダーを最新スキーマへ整合させてから全データ行を読み込む。
 *
 * 目的:
 * - incomeTax / residentTax 列追加のようなスキーマ変更後、書き込みを経由せずに
 *   読取系API（取引履歴・保有情報・ポートフォリオ・週次レポート）が呼ばれても、
 *   旧列構成の行を新列構成として誤って解析しないよう、読取前に必ず
 *   ensureSheet によるヘッダー整合（列挿入マイグレーション）を実行する。
 *
 * 内容:
 * - シートが存在しない場合は取引0件として空配列を返す。
 * - シートが存在する場合は ensureSheet でヘッダーを SHEET_HEADERS に整合させ、
 *   失敗時は読取へ進まず即座にエラーを返す（fail fast）。
 *
 * 注意:
 * - ensureSheet は列構成が一致していれば何も変更しないため、繰り返し呼んでも安全。
 * - シート不存在はhasSheetで値として判定し、取得・整合の失敗はそのまま呼び出し元へ伝播する。
 *
 * @param sheetRepository - シートリポジトリ。
 * @param fundId - 対象ファンドID。
 * @returns 全データ行（シート不存在時は空配列）、またはマイグレーション・読取失敗のエラー。
 */
function readTransactionRows(
  sheetRepository: SheetRepository,
  fundId: string
): Result<unknown[][]> {
  const sheetName = getTransactionSheetName(fundId);

  const hasSheetResult = sheetRepository.hasSheet(sheetName);
  if (!hasSheetResult.success) {
    return hasSheetResult;
  }
  if (!hasSheetResult.value) {
    // 取引シートが未作成であることは、そのファンドの取引が0件であることを意味する。
    return { success: true, value: [] };
  }

  const ensureResult = ensureTransactionSheet(sheetRepository, fundId);
  if (!ensureResult.success) {
    return ensureResult;
  }

  return sheetRepository.readAllRows(sheetName);
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
    name: sheetName,
    headers: SHEET_HEADERS[SHEET_NAMES.TRANSACTIONS],
  };

  const ensureResult = sheetRepository.ensureSheet(definition);
  if (!ensureResult.success) {
    return ensureResult;
  }

  return { success: true, value: sheetName };
}

/**
 * 取引IDから該当行を検索する（ファンド別シート対応）。
 *
 * 取引シートが存在しない場合は、取引が0件である統一契約に従って
 * 該当取引なし（null）を成功結果として返す。
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
  const rowsResult = readTransactionRows(sheetRepository, fundId);
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
    incomeTax,
    residentTax,
    recurringPurchaseId,
    idempotencyKey,
    createdAt,
  ] = row;

  const idResult = parseRequiredStringCell(id, 'transactions', 'id', index);
  if (!idResult.success) {
    return idResult;
  }
  const fundIdResult = parseRequiredStringCell(fundId, 'transactions', 'fundId', index);
  if (!fundIdResult.success) {
    return fundIdResult;
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

  const amountResult = parseNumberCell(amount, 'transactions', 'amount', index);
  if (!amountResult.success) {
    return amountResult;
  }
  const navValueResult = parseNumberCell(navValue, 'transactions', 'navValue', index);
  if (!navValueResult.success) {
    return navValueResult;
  }
  const unitsResult = parseNumberCell(units, 'transactions', 'units', index);
  if (!unitsResult.success) {
    return unitsResult;
  }
  const incomeTaxResult = parseOptionalNonNegativeNumberCell(
    incomeTax,
    'transactions',
    'incomeTax',
    index
  );
  if (!incomeTaxResult.success) {
    return incomeTaxResult;
  }
  const residentTaxResult = parseOptionalNonNegativeNumberCell(
    residentTax,
    'transactions',
    'residentTax',
    index
  );
  if (!residentTaxResult.success) {
    return residentTaxResult;
  }
  if (
    type !== 'REDEMPTION' &&
    (incomeTaxResult.value !== null || residentTaxResult.value !== null)
  ) {
    return fail(
      'unexpected',
      `transactionsの${String(index + 2)}行目の購入取引に税額が設定されています。`
    );
  }
  const createdAtResult = parseRequiredStringCell(createdAt, 'transactions', 'createdAt', index);
  if (!createdAtResult.success) {
    return createdAtResult;
  }

  return {
    success: true,
    value: {
      id: idResult.value,
      fundId: fundIdResult.value,
      type,
      date: dateStr,
      amount: amountResult.value,
      navValue: navValueResult.value,
      units: unitsResult.value,
      incomeTax: incomeTaxResult.value,
      residentTax: residentTaxResult.value,
      recurringPurchaseId: normalizeOptionalString(recurringPurchaseId),
      idempotencyKey: normalizeOptionalString(idempotencyKey),
      createdAt: createdAtResult.value,
    },
  };
}
