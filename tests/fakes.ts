import type { Result, AppError } from '../src/domain/types';
import { SHEET_HEADERS, type SheetDefinition } from '../src/Config';
import type { SheetRepository } from '../src/repository/SheetRepository';
import type { EmailService } from '../src/service/EmailService';

export function ok<T>(value: T): Result<T> {
  return { success: true, value };
}

export function fail<T>(type: AppError['type'], message: string, field?: string): Result<T> {
  return { success: false, error: { type, message, field } };
}

/**
 * 指定シートのヘッダー行を返すテスト用ヘルパー。
 *
 * 目的:
 * - 各テストで `[...SHEET_HEADERS[SHEET_NAMES.X]]` と手書きしていたヘッダー行生成を一本化する。
 *
 * 使い方:
 * - createInMemorySheetRepository の初期データで、ヘッダー行として先頭に置く。
 *   例: `{ [SHEET_NAMES.FUNDS]: [headerRow(SHEET_NAMES.FUNDS), ['fund-1', ...]] }`
 *
 * @param sheetName - 対象シート名（SHEET_HEADERS のキー）。
 * @returns ヘッダー文字列の配列（呼び出しごとに新しい配列）。
 */
export function headerRow(sheetName: keyof typeof SHEET_HEADERS): string[] {
  return Array.from(SHEET_HEADERS[sheetName]);
}

/**
 * SheetRepository のスタブを生成するテスト用ファクトリ。
 *
 * 目的:
 * - router のテストなどで繰り返し定義していた「全メソッドが成功を返す SheetRepository」
 *   のボイラープレートを一本化し、各テストは関心のあるメソッドだけを overrides で差し替える。
 *
 * 既定の挙動:
 * - ensureSheet / getRequiredSheet は空のシート相当を ok で返す。
 * - readAllRows は空配列、appendRows / updateRow / deleteRow は undefined を ok で返す。
 *
 * @param overrides - 差し替えたいメソッドのみを指定する。
 * @returns SheetRepository のスタブ。
 */
export function createStubSheetRepository(
  overrides: Partial<SheetRepository> = {}
): SheetRepository {
  return {
    ensureSheet: () => ok({} as GoogleAppsScript.Spreadsheet.Sheet),
    getRequiredSheet: () => ok({} as GoogleAppsScript.Spreadsheet.Sheet),
    readAllRows: () => ok([]),
    appendRows: () => ok(undefined),
    updateRow: () => ok(undefined),
    deleteRow: () => ok(undefined),
    ...overrides,
  };
}

type SheetData = {
  name: string;
  rows: unknown[][];
};

export type FakeRange = {
  row: number;
  column: number;
  numRows: number;
  numColumns: number;
  getValues: () => unknown[][];
  setValues: (values: unknown[][]) => void;
  setValue: (value: unknown) => void;
};

export type FakeSheet = {
  name: string;
  getLastRow: () => number;
  getLastColumn: () => number;
  getMaxRows: () => number;
  getMaxColumns: () => number;
  getRange: (row: number, column: number, numRows: number, numColumns: number) => FakeRange;
  insertColumnBefore: (columnNumber: number) => void;
  moveColumns: (range: FakeRange, targetColumnNumber: number) => void;
  deleteColumn: (columnNumber: number) => void;
  deleteRow: (rowNumber: number) => void;
  getCell: (row: number, column: number) => unknown;
  setCell: (row: number, column: number, value: unknown) => void;
  getData: () => unknown[][];
};

export function createFakeSheet(name: string, initialRows: unknown[][] = []): FakeSheet {
  const rows = initialRows.map((row) => [...row]);

  const getCell = (row: number, column: number): unknown => {
    const rowIndex = row - 1;
    const columnIndex = column - 1;
    return rows[rowIndex]?.[columnIndex] ?? '';
  };

  const setCell = (row: number, column: number, value: unknown): void => {
    const rowIndex = row - 1;
    const columnIndex = column - 1;
    while (rows.length <= rowIndex) {
      rows.push([]);
    }
    const targetRow = rows[rowIndex] ?? [];
    while (targetRow.length <= columnIndex) {
      targetRow.push('');
    }
    targetRow[columnIndex] = value;
    rows[rowIndex] = targetRow;
  };

  const getRange = (
    row: number,
    column: number,
    numRows: number,
    numColumns: number
  ): FakeRange => ({
    row,
    column,
    numRows,
    numColumns,
    getValues: () => {
      const values: unknown[][] = [];
      for (let r = 0; r < numRows; r += 1) {
        const rowValues: unknown[] = [];
        for (let c = 0; c < numColumns; c += 1) {
          rowValues.push(getCell(row + r, column + c));
        }
        values.push(rowValues);
      }
      return values;
    },
    setValues: (values: unknown[][]) => {
      for (let r = 0; r < values.length; r += 1) {
        for (let c = 0; c < (values[r]?.length ?? 0); c += 1) {
          setCell(row + r, column + c, values[r]?.[c]);
        }
      }
    },
    setValue: (value: unknown) => {
      setCell(row, column, value);
    },
  });

  const sheet: FakeSheet = {
    name,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((max, row) => Math.max(max, row.length), 0),
    getMaxRows: () => rows.length,
    getMaxColumns: () => rows.reduce((max, row) => Math.max(max, row.length), 0),
    getRange,
    insertColumnBefore: (columnNumber: number) => {
      const index = columnNumber - 1;
      for (const row of rows) {
        while (row.length < index) {
          row.push('');
        }
        row.splice(index, 0, '');
      }
    },
    moveColumns: (range: FakeRange, targetColumnNumber: number) => {
      const sourceColumnNumber = range.column;
      if (sourceColumnNumber === targetColumnNumber) {
        return;
      }
      for (const row of rows) {
        const sourceIndex = sourceColumnNumber - 1;
        const targetIndex = targetColumnNumber - 1;
        const [value] = row.splice(sourceIndex, 1);
        row.splice(targetIndex, 0, value ?? '');
      }
    },
    deleteColumn: (columnNumber: number) => {
      const index = columnNumber - 1;
      for (const row of rows) {
        if (row.length > index) {
          row.splice(index, 1);
        }
      }
    },
    deleteRow: (rowNumber: number) => {
      const index = rowNumber - 1;
      if (index >= 0 && index < rows.length) {
        rows.splice(index, 1);
      }
    },
    getCell,
    setCell,
    getData: () => rows.map((row) => [...row]),
  };

  return sheet;
}

export type FakeSpreadsheet = {
  getSheetByName: (name: string) => FakeSheet | null;
  insertSheet: (name: string) => FakeSheet;
};

export function createFakeSpreadsheet(initialSheets: SheetData[] = []): FakeSpreadsheet {
  const sheets = new Map<string, FakeSheet>();
  for (const sheet of initialSheets) {
    sheets.set(sheet.name, createFakeSheet(sheet.name, sheet.rows));
  }

  return {
    getSheetByName: (name: string) => sheets.get(name) ?? null,
    insertSheet: (name: string) => {
      const sheet = createFakeSheet(name, []);
      sheets.set(name, sheet);
      return sheet;
    },
  };
}

export function createInMemorySheetRepository(
  initialSheets: Record<string, unknown[][]> = {}
): SheetRepository {
  const store = new Map<string, unknown[][]>();
  Object.entries(initialSheets).forEach(([sheetName, rows]) => {
    store.set(
      sheetName,
      rows.map((row) => [...row])
    );
  });

  return {
    ensureSheet: (definition: SheetDefinition) => {
      if (!store.has(definition.name)) {
        store.set(definition.name, [Array.from(definition.headers)]);
      }
      const rows = store.get(definition.name) ?? [];
      if (rows.length === 0) {
        rows.push(Array.from(definition.headers));
      }

      // 実物の SheetRepository.ensureHeader のうち「不足列の定義順位置への挿入（既存行は空セル）」と
      // 「末尾の余剰列の削除」を簡略に再現する（既存列の移動・最終ヘッダー一致検証は再現しない）。
      // 列追加を伴うスキーマ変更のテストで、「旧列構成のシートが読取前に
      // 新列構成へ整形される」挙動を検証できるようにする。
      const header = rows[0] ?? [];
      definition.headers.forEach((expected, index) => {
        if (header[index] !== expected) {
          const currentIndex = header.indexOf(expected);
          if (currentIndex === -1) {
            rows.forEach((row, rowIndex) => {
              row.splice(index, 0, rowIndex === 0 ? expected : '');
            });
          }
        }
      });
      for (let i = header.length - 1; i >= definition.headers.length; i--) {
        rows.forEach((row) => {
          row.splice(i, 1);
        });
      }

      return ok({ name: definition.name, rows } as unknown as GoogleAppsScript.Spreadsheet.Sheet);
    },
    getRequiredSheet: (sheetName: string) => {
      const rows = store.get(sheetName);
      if (!rows) {
        return fail('unexpected', `シートが存在しません: ${sheetName}`);
      }
      return ok({ name: sheetName, rows } as unknown as GoogleAppsScript.Spreadsheet.Sheet);
    },
    readAllRows: (sheetName: string) => {
      const rows = store.get(sheetName);
      if (!rows) {
        return fail('unexpected', `シートが存在しません: ${sheetName}`);
      }
      return ok(rows.slice(1).map((row) => [...row]));
    },
    appendRows: (sheetName: string, rows: unknown[][]) => {
      if (rows.length === 0) {
        return fail('validation', '追加する行が空です。');
      }
      const target = store.get(sheetName);
      if (!target) {
        return fail('unexpected', `シートが存在しません: ${sheetName}`);
      }
      rows.forEach((row) => target.push([...row]));
      return ok(undefined);
    },
    updateRow: (sheetName: string, rowIndex: number, row: unknown[]) => {
      const target = store.get(sheetName);
      if (!target) {
        return fail('unexpected', `シートが存在しません: ${sheetName}`);
      }
      const dataIndex = rowIndex + 1;
      if (dataIndex >= target.length) {
        return fail(
          'not_found',
          `指定された行が存在しません: ${sheetName} row=${String(rowIndex)}`
        );
      }
      target[dataIndex] = [...row];
      return ok(undefined);
    },
    deleteRow: (sheetName: string, rowIndex: number) => {
      const target = store.get(sheetName);
      if (!target) {
        return fail('unexpected', `シートが存在しません: ${sheetName}`);
      }
      const dataIndex = rowIndex + 1;
      if (dataIndex >= target.length) {
        return fail(
          'not_found',
          `指定された行が存在しません: ${sheetName} row=${String(rowIndex)}`
        );
      }
      target.splice(dataIndex, 1);
      return ok(undefined);
    },
  };
}

/**
 * EmailService のスタブを生成するテスト用ファクトリ。
 *
 * 目的:
 * - MarketIndexAlertUseCase / WeeklyReportUseCase のテストなどで繰り返し定義していた
 *   「全メソッドが成功を返す EmailService」のボイラープレートを一本化し、
 *   各テストは関心のあるメソッドだけを overrides で差し替える。
 *
 * 既定の挙動:
 * - sendWeeklyReport / sendErrorNotification / sendMarketIndexAlert は全て ok(undefined) を返す。
 *
 * @param overrides - 差し替えたいメソッドのみを指定する。
 * @returns EmailService のスタブ。
 */
export function createStubEmailService(overrides: Partial<EmailService> = {}): EmailService {
  return {
    sendWeeklyReport: () => ok(undefined),
    sendErrorNotification: () => ok(undefined),
    sendMarketIndexAlert: () => ok(undefined),
    ...overrides,
  };
}
