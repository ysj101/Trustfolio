import type { SheetDefinition } from '../Config';
import type { AppError, Result } from '../domain/types';

export type SheetRepository = {
  ensureSheet: (definition: SheetDefinition) => Result<GoogleAppsScript.Spreadsheet.Sheet>;
  getRequiredSheet: (sheetName: string) => Result<GoogleAppsScript.Spreadsheet.Sheet>;
  readAllRows: (sheetName: string) => Result<unknown[][]>;
  appendRows: (sheetName: string, rows: unknown[][]) => Result<void>;
  /**
   * 指定された行インデックス（0始まり、データ行基準）の行を更新する。
   * 実際のシート上では行番号はヘッダー行（1行目）を除いた2行目以降となる。
   */
  updateRow: (sheetName: string, rowIndex: number, row: unknown[]) => Result<void>;
};

/**
 * アクティブなスプレッドシートに接続する。
 * アクティブなシートが存在しない場合は失敗させる。
 */
export function openSheetRepository(): Result<SheetRepository> {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return { success: true, value: createSheetRepository(spreadsheet) };
}

function createSheetRepository(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet
): SheetRepository {
  const repository: SheetRepository = {
    ensureSheet: (definition: SheetDefinition): Result<GoogleAppsScript.Spreadsheet.Sheet> => {
      const existingSheet = spreadsheet.getSheetByName(definition.name);
      const sheet = existingSheet ?? spreadsheet.insertSheet(definition.name);

      const headerResult = ensureHeader(sheet, definition.headers, definition.name);
      if (!headerResult.success) {
        return headerResult;
      }

      return { success: true, value: sheet };
    },
    getRequiredSheet: (sheetName: string): Result<GoogleAppsScript.Spreadsheet.Sheet> => {
      const sheet = spreadsheet.getSheetByName(sheetName);
      if (sheet === null) {
        return fail('unexpected', `シートが存在しません: ${sheetName}`);
      }
      return { success: true, value: sheet };
    },
    readAllRows: (sheetName: string): Result<unknown[][]> => {
      const sheetResult = repository.getRequiredSheet(sheetName);
      if (!sheetResult.success) {
        return sheetResult;
      }

      const sheet = sheetResult.value;
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();

      if (lastRow < 2 || lastColumn === 0) {
        return { success: true, value: [] };
      }

      const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
      return { success: true, value: values };
    },
    appendRows: (sheetName: string, rows: unknown[][]): Result<void> => {
      if (rows.length === 0) {
        return fail('validation', '追加する行が空です。');
      }

      const sheetResult = repository.getRequiredSheet(sheetName);
      if (!sheetResult.success) {
        return sheetResult;
      }

      const sheet = sheetResult.value;
      const startRow = sheet.getLastRow() + 1;
      const columnCount = rows[0]?.length ?? 0;

      if (columnCount === 0) {
        return fail('validation', '追加する行の列数が不正です。');
      }

      sheet.getRange(startRow, 1, rows.length, columnCount).setValues(rows);
      return { success: true, value: undefined };
    },
    updateRow: (sheetName: string, rowIndex: number, row: unknown[]): Result<void> => {
      if (row.length === 0) {
        return fail('validation', '更新する行が空です。');
      }

      const sheetResult = repository.getRequiredSheet(sheetName);
      if (!sheetResult.success) {
        return sheetResult;
      }

      const sheet = sheetResult.value;
      // rowIndexは0始まりのデータ行インデックス。シート上ではヘッダー行が1行目なので、データは2行目から始まる。
      const sheetRowNumber = rowIndex + 2;

      if (sheetRowNumber > sheet.getLastRow()) {
        return fail(
          'not_found',
          `指定された行が存在しません: ${sheetName} row=${String(rowIndex)}`
        );
      }

      sheet.getRange(sheetRowNumber, 1, 1, row.length).setValues([row]);
      return { success: true, value: undefined };
    },
  };

  return repository;
}

function ensureHeader(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  headers: readonly string[],
  sheetName: string
): Result<void> {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow === 0 || lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([Array.from(headers)]);
    return { success: true, value: undefined };
  }

  if (lastColumn < headers.length) {
    return fail('unexpected', `シートの列数が不足しています: ${sheetName}`);
  }

  const actualHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];

  const mismatches = headers
    .map((expected, index) => ({
      expected,
      actual: String(actualHeaders[index] ?? ''),
      index,
    }))
    .filter((item) => item.expected !== item.actual);

  if (mismatches.length > 0) {
    const detail = mismatches
      .map(
        (item) => `${String(item.index + 1)}列目 expected=${item.expected} actual=${item.actual}`
      )
      .join(', ');
    return fail('unexpected', `シートヘッダーが一致しません: ${sheetName}. ${detail}`);
  }

  return { success: true, value: undefined };
}

function fail<T>(type: AppError['type'], message: string, field?: string): Result<T> {
  return { success: false, error: { type, message, field } };
}
