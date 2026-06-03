import { SHEET_NAMES } from '../Config';
import { formatDateToIso } from '../domain/dateFormat';
import { fail } from '../domain/result';
import type { MarketIndex, Result } from '../domain/types';
import { findRowByPredicate, parseAllRows, parseSheetDate } from './SheetMapping';
import type { SheetRepository } from './SheetRepository';

/**
 * アラート時のセル背景色（赤系）。
 * Material Designのred-100カラー。
 */
const ALERT_CELL_COLOR = '#FFCDD2';

/**
 * 市場指数リポジトリ。
 * _market_indicesシートへのCRUD操作を提供する。
 */
export type MarketIndexRepository = {
  /**
   * 指定された日付の市場指数データを取得する。
   *
   * @param date 日付（YYYY-MM-DD形式）
   * @returns 市場指数データ、存在しない場合はnull
   */
  findByDate: (date: string) => Result<MarketIndex | null>;

  /**
   * 全ての市場指数データを取得する。
   * 日付の降順（新しい順）でソートされる。
   *
   * @returns 市場指数データの配列
   */
  listAll: () => Result<MarketIndex[]>;

  /**
   * 市場指数データを登録する。
   *
   * @param record 登録する市場指数データ
   * @returns 成功時はvoid
   */
  create: (record: MarketIndex) => Result<void>;

  /**
   * -5%ルールに該当する指数のセルを赤色でハイライトする。
   * 指定された日付の行で、指定された列（sp500またはnasdaq）のセル背景色を赤色に設定する。
   *
   * @param date 日付（YYYY-MM-DD形式）
   * @param column ハイライトする列（'sp500'または'nasdaq'）
   * @returns 成功時はvoid
   */
  highlightAlertCell: (date: string, column: 'sp500' | 'nasdaq') => Result<void>;
};

/**
 * 市場指数リポジトリを生成する。
 *
 * @param sheetRepository シートリポジトリ
 * @returns 市場指数リポジトリ
 */
export function createMarketIndexRepository(
  sheetRepository: SheetRepository
): MarketIndexRepository {
  const repository: MarketIndexRepository = {
    findByDate: (date: string): Result<MarketIndex | null> => {
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.MARKET_INDICES);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const found = findRowByPredicate(
        rowsResult.value,
        parseRow,
        (record) => record.date === date
      );
      if (!found.success) {
        return found;
      }

      return { success: true, value: found.value?.entity ?? null };
    },

    listAll: (): Result<MarketIndex[]> => {
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.MARKET_INDICES);
      if (!rowsResult.success) {
        return rowsResult;
      }

      const parsedResult = parseAllRows(rowsResult.value, parseRow);
      if (!parsedResult.success) {
        return parsedResult;
      }

      // 日付の降順でソート
      const records = parsedResult.value;
      records.sort((a, b) => (a.date < b.date ? 1 : -1));

      return { success: true, value: records };
    },

    create: (record: MarketIndex): Result<void> => {
      return sheetRepository.appendRows(SHEET_NAMES.MARKET_INDICES, [
        [record.date, record.sp500, record.nasdaq, record.createdAt],
      ]);
    },

    highlightAlertCell: (date: string, column: 'sp500' | 'nasdaq'): Result<void> => {
      // シートを取得
      const sheetResult = sheetRepository.getRequiredSheet(SHEET_NAMES.MARKET_INDICES);
      if (!sheetResult.success) {
        return sheetResult;
      }

      const sheet = sheetResult.value;

      // 全行を読み取って対象日付の行番号を特定
      const rowsResult = sheetRepository.readAllRows(SHEET_NAMES.MARKET_INDICES);
      if (!rowsResult.success) {
        return rowsResult;
      }

      // 対象日付の行インデックスを検索（0始まり、データ行基準）
      let targetRowIndex: number | null = null;
      for (const [index, row] of rowsResult.value.entries()) {
        const dateValue = row[0];
        let rowDate: string | null = null;

        if (dateValue instanceof Date) {
          rowDate = formatDateToIso(dateValue);
        } else if (typeof dateValue === 'string') {
          rowDate = dateValue.trim();
        }

        if (rowDate === date) {
          targetRowIndex = index;
          break;
        }
      }

      if (targetRowIndex === null) {
        return fail('not_found', `指定された日付のデータが見つかりません: ${date}`);
      }

      // シート上の実際の行番号を計算（ヘッダー行が1行目、データは2行目から）
      const sheetRowNumber = targetRowIndex + 2;

      // 列番号を決定（date=1, sp500=2, nasdaq=3, createdAt=4）
      const columnNumber = column === 'sp500' ? 2 : 3;

      // セルの背景色を設定
      sheet.getRange(sheetRowNumber, columnNumber).setBackground(ALERT_CELL_COLOR);

      return { success: true, value: undefined };
    },
  };

  return repository;
}

/**
 * シートの行データをMarketIndex型にパースする。
 *
 * @param row 行データ
 * @param index 行インデックス（エラーメッセージ用、0始まり）
 * @returns パースされたMarketIndex、またはエラー
 */
function parseRow(row: unknown[], index: number): Result<MarketIndex> {
  const [dateValue, sp500Value, nasdaqValue, createdAtValue] = row;

  // dateの検証とパース
  const dateResult = parseSheetDate(dateValue, {
    sheetLabel: '_market_indices',
    fieldName: 'date',
    index,
    trim: true,
    quoteInvalidValue: true,
  });
  if (!dateResult.success) {
    return dateResult;
  }
  const date = dateResult.value;

  // sp500の検証
  if (typeof sp500Value !== 'number' || Number.isNaN(sp500Value)) {
    return fail(
      'unexpected',
      `_market_indicesの${String(index + 2)}行目のsp500が不正です。型: ${typeof sp500Value}, 値: "${String(sp500Value)}"`
    );
  }

  // nasdaqの検証
  if (typeof nasdaqValue !== 'number' || Number.isNaN(nasdaqValue)) {
    return fail(
      'unexpected',
      `_market_indicesの${String(index + 2)}行目のnasdaqが不正です。型: ${typeof nasdaqValue}, 値: "${String(nasdaqValue)}"`
    );
  }

  // createdAtの検証
  if (typeof createdAtValue !== 'string' || createdAtValue === '') {
    return fail('unexpected', `_market_indicesの${String(index + 2)}行目のcreatedAtが不正です。`);
  }

  return {
    success: true,
    value: {
      date,
      sp500: sp500Value,
      nasdaq: nasdaqValue,
      createdAt: createdAtValue,
    },
  };
}
