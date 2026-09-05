import { describe, expect, it, vi } from 'vitest';
import { openSheetRepository } from '../../src/repository/SheetRepository';
import type { SheetDefinition } from '../../src/Config';
import { createFakeSpreadsheet } from '../fakes';

describe('SheetRepository', () => {
  it('ヘッダーとデータ行を1回の読み取りでシートを変更せずに返す', () => {
    // 前提: 利用者追加のメモ列を含む既存シートがある。
    // 事前条件: readSheetWithHeaderだけを呼び、ensureSheetは呼ばない。
    // 検証: 1行目とデータ行を分けて返し、シートの列と値を変更しない。
    const initialRows = [
      ['id', 'name', '', 'メモ'],
      ['fund-1', '国内株式ファンド', '補足', '確認済み'],
    ];
    const fakeSpreadsheet = createFakeSpreadsheet([{ name: '_test', rows: initialRows }]);
    const sheet = fakeSpreadsheet.getSheetByName('_test');
    // 前提検証: _testシートが存在すること（throwではなくアサーションと型絞り込みで表現する）。
    expect(sheet).not.toBeNull();
    if (sheet === null) {
      return;
    }
    const getRangeSpy = vi.spyOn(sheet, 'getRange');
    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );

    const repositoryResult = openSheetRepository();
    expect(repositoryResult.success).toBe(true);
    if (repositoryResult.success) {
      expect(repositoryResult.value.readSheetWithHeader('_test')).toEqual({
        success: true,
        value: {
          headers: ['id', 'name', '', 'メモ'],
          rows: [['fund-1', '国内株式ファンド', '補足', '確認済み']],
        },
      });
      expect(getRangeSpy).toHaveBeenCalledTimes(1);
      expect(fakeSpreadsheet.getSheetByName('_test')?.getData()).toEqual(initialRows);
    }
  });

  it('存在しないシートの一括読み取りを拒否する', () => {
    // 前提: 対象シートが存在しない。
    // 事前条件: readSheetWithHeaderを直接呼ぶ。
    // 検証: シートを作成せず「シートが存在しません」エラーを返す。
    const fakeSpreadsheet = createFakeSpreadsheet();
    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );

    const repositoryResult = openSheetRepository();
    expect(repositoryResult.success).toBe(true);
    if (repositoryResult.success) {
      expect(repositoryResult.value.readSheetWithHeader('_test')).toEqual({
        success: false,
        error: {
          type: 'unexpected',
          message: 'シートが存在しません: _test',
        },
      });
      expect(fakeSpreadsheet.getSheetByName('_test')).toBeNull();
    }
  });

  it('列を持たない空シートは空のヘッダーとデータ行を返す', () => {
    // 前提: 対象シートは存在するが行と列を持たない。
    // 事前条件: readSheetWithHeaderを呼ぶ。
    // 検証: 範囲取得を行わず、空のheadersとrowsを返す。
    const fakeSpreadsheet = createFakeSpreadsheet([{ name: '_test', rows: [] }]);
    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );

    const repositoryResult = openSheetRepository();
    expect(repositoryResult.success).toBe(true);
    if (repositoryResult.success) {
      expect(repositoryResult.value.readSheetWithHeader('_test')).toEqual({
        success: true,
        value: { headers: [], rows: [] },
      });
    }
  });

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

  it('指定したセルだけを更新する', () => {
    // 前提: _testシートにはヘッダーと2件の銘柄行が存在する。
    // 事前条件: 0始まりのデータ行インデックス1、列インデックス2を指定する。
    // 検証: 2件目のassetClassセルだけが更新され、同じ行の他セルと他行は変更されない。
    const initialRows = [
      ['id', 'name', 'assetClass', 'createdAt'],
      ['fund-equity', '国内株式ファンド', 'equity', '2026-09-01T00:00:00.000Z'],
      ['fund-gold', 'ゴールドファンド', '', '2026-09-02T00:00:00.000Z'],
    ];
    const fakeSpreadsheet = createFakeSpreadsheet([{ name: '_test', rows: initialRows }]);
    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );

    const repositoryResult = openSheetRepository();
    expect(repositoryResult.success).toBe(true);
    if (repositoryResult.success) {
      expect(repositoryResult.value.updateCell('_test', 1, 2, 'gold')).toEqual({
        success: true,
        value: undefined,
      });
      expect(fakeSpreadsheet.getSheetByName('_test')?.getData()).toEqual([
        initialRows[0],
        initialRows[1],
        ['fund-gold', 'ゴールドファンド', 'gold', '2026-09-02T00:00:00.000Z'],
      ]);
    }
  });
});
