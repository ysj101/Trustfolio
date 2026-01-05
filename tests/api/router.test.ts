import { describe, expect, it, vi } from 'vitest';
import { handleApiRequest } from '../../src/api/router';
import {
  PERFORMANCE_SHEET_NAME,
  SHEET_DEFINITIONS,
  getPerformanceSheetName,
  getTransactionSheetName,
} from '../../src/Config';
import type { SheetRepository } from '../../src/repository/SheetRepository';
import { ok, fail } from '../fakes';

vi.mock('../../src/repository/SheetRepository', () => ({
  openSheetRepository: vi.fn(),
}));

vi.mock('../../src/repository/FundRepository', () => ({
  createFundRepository: () => ({
    listFunds: () =>
      ok([
        {
          id: 'fund-001',
          name: '国内株式',
          rakutenFundId: null,
          settlementBusinessDays: null,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ]),
    findByName: () => ok(null),
    findById: () => ok(null),
    createFund: () => ok(undefined),
    updateFund: () => ok(undefined),
  }),
}));

vi.mock('../../src/repository/NavRepository', () => ({
  createNavRepository: () => ({
    listByFundId: () => ok([]),
    findByFundAndDate: () => ok(null),
    findLatestByFundId: () => ok(null),
    createNav: () => ok(undefined),
  }),
}));

vi.mock('../../src/repository/RecurringPurchaseRepository', () => ({
  createRecurringPurchaseRepository: () => ({
    listAll: () => ok([]),
    listActive: () => ok([]),
    createRecurringPurchase: () => ok(undefined),
    findById: () => ok(null),
    updateRecurringPurchase: () => ok(undefined),
    deleteRecurringPurchase: () => ok(undefined),
  }),
}));

vi.mock('../../src/repository/TransactionRepository', () => ({
  createTransactionRepository: () => ({
    listByFundId: () => ok([]),
    listAll: () => ok([]),
    createTransaction: () => ok(undefined),
    findByIdempotencyKey: () => ok(null),
    findById: () => ok(null),
    updateTransaction: () => ok(undefined),
    deleteTransaction: () => ok(undefined),
  }),
}));

vi.mock('../../src/repository/PerformanceRepository', () => ({
  createPerformanceRepository: () => ({
    createPerformance: () => ok(undefined),
    createGlobalPerformance: () => ok(undefined),
    findByFundAndDate: () => ok(null),
    findGlobalByDate: () => ok(null),
    findLatestByFundId: () => ok(null),
  }),
}));

vi.mock('../../src/service/RakutenService', () => ({
  createRakutenService: () => ({
    fetchLatestNav: () => fail('unexpected', '楽天証券の取得に失敗しました。'),
  }),
}));

describe('router', () => {
  it('シート接続に失敗した場合はエラーを返す', async () => {
    // 前提: openSheetRepositoryが失敗を返す
    // 事前条件: エラー内容が設定されている
    // 検証: 失敗結果が返る
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    openSheetRepository.mockReturnValue(fail('unexpected', 'シート接続に失敗しました。'));

    const result = handleApiRequest({ action: 'listFunds' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('シート接続');
    }
  });

  it('シート初期化でシート作成に失敗した場合はエラーを返す', async () => {
    // 前提: ensureSheetが失敗する
    // 事前条件: openSheetRepositoryがシートリポジトリを返す
    // 検証: initializeSheetsが失敗結果を返す
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    const sheetRepository = {
      ensureSheet: () => fail('unexpected', 'シート作成に失敗しました。'),
      getRequiredSheet: () => ok({} as GoogleAppsScript.Spreadsheet.Sheet),
      readAllRows: () => ok([]),
      appendRows: () => ok(undefined),
      updateRow: () => ok(undefined),
      deleteRow: () => ok(undefined),
    } satisfies SheetRepository;

    openSheetRepository.mockReturnValue(ok(sheetRepository));

    const result = handleApiRequest({ action: 'initializeSheets' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('失敗');
    }
  });

  it('シート初期化が成功した場合は必要シートが作成される', async () => {
    // 前提: ensureSheetが成功する
    // 事前条件: fundRepositoryが銘柄を1件返す
    // 検証: 基本シートとファンド別シートが作成される
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    const ensured: string[] = [];
    const sheetRepository = {
      ensureSheet: (definition: { name: string }) => {
        ensured.push(definition.name);
        return ok({} as GoogleAppsScript.Spreadsheet.Sheet);
      },
      getRequiredSheet: () => ok({} as GoogleAppsScript.Spreadsheet.Sheet),
      readAllRows: () => ok([]),
      appendRows: () => ok(undefined),
      updateRow: () => ok(undefined),
      deleteRow: () => ok(undefined),
    } satisfies SheetRepository;

    openSheetRepository.mockReturnValue(ok(sheetRepository));

    const result = handleApiRequest({ action: 'initializeSheets' });
    expect(result.success).toBe(true);

    const expectedBase = SHEET_DEFINITIONS.map((definition) => definition.name);
    const expected = [
      ...expectedBase,
      PERFORMANCE_SHEET_NAME,
      getTransactionSheetName('fund-001'),
      getPerformanceSheetName('fund-001'),
    ];

    expected.forEach((sheetName) => {
      expect(ensured).toContain(sheetName);
    });
  });

  it('listFundsが成功すると銘柄一覧が返る', async () => {
    // 前提: シート接続が成功する
    // 事前条件: createFundRepositoryが銘柄を返す
    // 検証: 銘柄一覧が返る
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    const sheetRepository = {
      ensureSheet: () => ok({} as GoogleAppsScript.Spreadsheet.Sheet),
      getRequiredSheet: () => ok({} as GoogleAppsScript.Spreadsheet.Sheet),
      readAllRows: () => ok([]),
      appendRows: () => ok(undefined),
      updateRow: () => ok(undefined),
      deleteRow: () => ok(undefined),
    } satisfies SheetRepository;

    openSheetRepository.mockReturnValue(ok(sheetRepository));

    const result = handleApiRequest({ action: 'listFunds' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('NAV取得前の必要シート検証が失敗した場合はエラーを返す', async () => {
    // 前提: 必要シートのensureSheetが失敗する
    // 事前条件: openSheetRepositoryがシートリポジトリを返す
    // 検証: fetchAllNavsが失敗結果を返す
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    const sheetRepository = {
      ensureSheet: () => fail('unexpected', '必要シートの検証に失敗しました。'),
      getRequiredSheet: () => ok({} as GoogleAppsScript.Spreadsheet.Sheet),
      readAllRows: () => ok([]),
      appendRows: () => ok(undefined),
      updateRow: () => ok(undefined),
      deleteRow: () => ok(undefined),
    } satisfies SheetRepository;

    openSheetRepository.mockReturnValue(ok(sheetRepository));

    const result = handleApiRequest({ action: 'fetchAllNavs' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('失敗');
    }
  });
});
