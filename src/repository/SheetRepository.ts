import type { SheetDefinition } from '../Config';
import { fail } from '../domain/result';
import type { Result } from '../domain/types';

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

  // 空シートの場合はヘッダーを設定し、不要な空白列を削除して終了
  if (lastRow === 0 || lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([Array.from(headers)]);

    // 不要な空白列を削除する（新規シートはデフォルトで26列あるため）
    const maxColumns = sheet.getMaxColumns();
    if (maxColumns > headers.length) {
      sheet.deleteColumns(headers.length + 1, maxColumns - headers.length);
    }

    return { success: true, value: undefined };
  }

  // 必要な列は再配置し、不要な列は削除する
  for (let expectedIndex = 0; expectedIndex < headers.length; expectedIndex += 1) {
    const expectedHeader = headers[expectedIndex] ?? '';
    const currentHeaders = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0] as string[];
    const currentHeader = currentHeaders[expectedIndex] ?? '';

    if (currentHeader === expectedHeader) {
      continue;
    }

    const foundIndex = currentHeaders.findIndex((header) => header === expectedHeader);
    const targetColumnNumber = expectedIndex + 1;

    if (foundIndex === -1) {
      sheet.insertColumnBefore(targetColumnNumber);
      sheet.getRange(1, targetColumnNumber).setValue(expectedHeader);
      continue;
    }

    const sourceColumnNumber = foundIndex + 1;
    const columnRange = sheet.getRange(1, sourceColumnNumber, sheet.getMaxRows(), 1);
    sheet.moveColumns(columnRange, targetColumnNumber);
  }

  // 空白ヘッダーや不要なヘッダー、重複ヘッダーの列を削除する
  const cleanupHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] as string[];
  const seenHeaders = new Set<string>();
  const deleteColumns: number[] = [];
  for (let index = 0; index < cleanupHeaders.length; index += 1) {
    const header = cleanupHeaders[index] ?? '';
    const isUnexpectedHeader = header === '' || !headers.includes(header);
    const isDuplicateHeader = header !== '' && seenHeaders.has(header);
    if (isUnexpectedHeader || isDuplicateHeader) {
      deleteColumns.push(index + 1);
      continue;
    }
    seenHeaders.add(header);
  }
  for (const columnNumber of deleteColumns.reverse()) {
    sheet.deleteColumn(columnNumber);
  }

  // 削除後に再度並び替えを行い、期待する順序に整える
  for (let expectedIndex = 0; expectedIndex < headers.length; expectedIndex += 1) {
    const expectedHeader = headers[expectedIndex] ?? '';
    const currentHeaders = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0] as string[];
    const currentHeader = currentHeaders[expectedIndex] ?? '';

    if (currentHeader === expectedHeader) {
      continue;
    }

    const foundIndex = currentHeaders.findIndex((header) => header === expectedHeader);
    const targetColumnNumber = expectedIndex + 1;

    if (foundIndex === -1) {
      sheet.insertColumnBefore(targetColumnNumber);
      sheet.getRange(1, targetColumnNumber).setValue(expectedHeader);
      continue;
    }

    const sourceColumnNumber = foundIndex + 1;
    const columnRange = sheet.getRange(1, sourceColumnNumber, sheet.getMaxRows(), 1);
    sheet.moveColumns(columnRange, targetColumnNumber);
  }

  // 期待列数を超える列は不要列として削除する
  while (sheet.getLastColumn() > headers.length) {
    sheet.deleteColumn(headers.length + 1);
  }

  // 末尾に残っている空白列（値が存在しない列）を削除する
  const maxColumns = sheet.getMaxColumns();
  const dataLastRow = sheet.getLastRow();
  for (let column = maxColumns; column > headers.length; column -= 1) {
    const values = sheet.getRange(1, column, Math.max(dataLastRow, 1), 1).getValues();
    const hasValue = values.some((row) => row[0] !== '' && row[0] !== null);
    if (!hasValue) {
      sheet.deleteColumn(column);
      continue;
    }
    break;
  }

  // 再度ヘッダーを取得して検証
  const finalLastColumn = sheet.getLastColumn();
  const updatedHeaders = sheet.getRange(1, 1, 1, finalLastColumn).getValues()[0] as string[];

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
