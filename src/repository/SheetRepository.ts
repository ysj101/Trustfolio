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
  /**
   * 指定された行インデックス（0始まり、データ行基準）の行を削除する。
   * 実際のシート上では行番号はヘッダー行（1行目）を除いた2行目以降となる。
   */
  deleteRow: (sheetName: string, rowIndex: number) => Result<void>;
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
    deleteRow: (sheetName: string, rowIndex: number): Result<void> => {
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

      sheet.deleteRow(sheetRowNumber);
      return { success: true, value: undefined };
    },
  };

  return repository;
}

/**
 * シートのヘッダー行を検証し、不足カラムがあれば自動追加する。
 * カラムの順序は定義順に従い、途中に不足カラムがあれば列を挿入する。
 */
function ensureHeader(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  headers: readonly string[],
  sheetName: string
): Result<void> {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  // 空シートの場合はヘッダーを設定して終了
  if (lastRow === 0 || lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([Array.from(headers)]);
    return { success: true, value: undefined };
  }

  // 現在のヘッダーを取得
  const actualHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0] as string[];

  // 期待するヘッダーと実際のヘッダーを比較し、不足カラムを特定
  const missingColumns = findMissingColumns(headers, actualHeaders);

  // 不足カラムがあれば挿入
  for (const missing of missingColumns) {
    // 列を挿入（1-indexed）
    sheet.insertColumnBefore(missing.insertAt + 1);
    // ヘッダーを設定
    sheet.getRange(1, missing.insertAt + 1).setValue(missing.columnName);
  }

  // 再度ヘッダーを取得して検証
  const updatedLastColumn = sheet.getLastColumn();
  const updatedHeaders = sheet.getRange(1, 1, 1, updatedLastColumn).getValues()[0] as string[];

  // 最終検証：期待するヘッダーと一致するか確認
  const finalMismatches = headers
    .map((expected, index) => ({
      expected,
      actual: updatedHeaders[index] ?? '',
      index,
    }))
    .filter((item) => item.expected !== item.actual);

  if (finalMismatches.length > 0) {
    const detail = finalMismatches
      .map(
        (item) => `${String(item.index + 1)}列目 expected=${item.expected} actual=${item.actual}`
      )
      .join(', ');
    return fail('unexpected', `シートヘッダーが一致しません: ${sheetName}. ${detail}`);
  }

  return { success: true, value: undefined };
}

/**
 * 期待するヘッダーと実際のヘッダーを比較し、不足しているカラムを特定する。
 * 挿入位置は期待する順序に基づいて決定する。
 */
function findMissingColumns(
  expectedHeaders: readonly string[],
  actualHeaders: string[]
): { columnName: string; insertAt: number }[] {
  const missing: { columnName: string; insertAt: number }[] = [];
  let actualIndex = 0;

  for (let expectedIndex = 0; expectedIndex < expectedHeaders.length; expectedIndex++) {
    const expectedColumn = expectedHeaders[expectedIndex];

    if (actualIndex < actualHeaders.length && actualHeaders[actualIndex] === expectedColumn) {
      // 一致する場合は次へ
      actualIndex++;
    } else {
      // 不足カラムを記録（挿入位置は現在のexpectedIndex）
      // 既に挿入したカラム分を考慮
      missing.push({
        columnName: expectedColumn,
        insertAt: expectedIndex + missing.length,
      });
    }
  }

  return missing;
}

function fail<T>(type: AppError['type'], message: string, field?: string): Result<T> {
  return { success: false, error: { type, message, field } };
}
