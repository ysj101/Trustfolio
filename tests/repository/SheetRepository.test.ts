import { describe, expect, it, vi } from 'vitest';
import { openSheetRepository } from '../../src/repository/SheetRepository';
import type { SheetDefinition } from '../../src/Config';
import { createFakeSpreadsheet } from '../fakes';

describe('SheetRepository', () => {
  it('空シートの場合はヘッダーが設定される', () => {
    // 前提: 指定シートが存在しない
    // 事前条件: SpreadsheetAppがFakeSpreadsheetを返す
    // 検証: ヘッダー行が設定される
    const fakeSpreadsheet = createFakeSpreadsheet();
    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );

    const repositoryResult = openSheetRepository();
    expect(repositoryResult.success).toBe(true);
    if (repositoryResult.success) {
      const definition: SheetDefinition = {
        name: '_test' as never,
        headers: ['id', 'name', 'createdAt'],
      };
      const ensureResult = repositoryResult.value.ensureSheet(definition);
      expect(ensureResult.success).toBe(true);
      const sheet = fakeSpreadsheet.getSheetByName('_test');
      expect(sheet?.getRange(1, 1, 1, 3).getValues()[0]).toEqual(['id', 'name', 'createdAt']);
    }
  });

  it('不足ヘッダーがある場合は列が追加される', () => {
    // 前提: ヘッダーに不足カラムがある
    // 事前条件: 既存シートのヘッダーを短く設定する
    // 検証: 不足カラムが追加される
    const fakeSpreadsheet = createFakeSpreadsheet([
      {
        name: '_test',
        rows: [
          ['id', 'name'],
          ['1', '山田太郎'],
        ],
      },
    ]);
    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );

    const repositoryResult = openSheetRepository();
    expect(repositoryResult.success).toBe(true);
    if (repositoryResult.success) {
      const definition: SheetDefinition = {
        name: '_test' as never,
        headers: ['id', 'name', 'createdAt'],
      };
      const ensureResult = repositoryResult.value.ensureSheet(definition);
      expect(ensureResult.success).toBe(true);
      const sheet = fakeSpreadsheet.getSheetByName('_test');
      expect(sheet?.getRange(1, 1, 1, 3).getValues()[0]).toEqual(['id', 'name', 'createdAt']);
    }
  });

  it('存在しない行を更新しようとするとnot_foundになる', () => {
    // 前提: 対象行が存在しない
    // 事前条件: ヘッダーのみのシートで更新を試みる
    // 検証: not_foundエラーが返る
    const fakeSpreadsheet = createFakeSpreadsheet([
      { name: '_test', rows: [['id', 'name', 'createdAt']] },
    ]);
    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );

    const repositoryResult = openSheetRepository();
    expect(repositoryResult.success).toBe(true);
    if (repositoryResult.success) {
      const result = repositoryResult.value.updateRow('_test', 0, ['1', '山田太郎', '2024-01-01']);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('not_found');
      }
    }
  });
});
