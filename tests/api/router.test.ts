import { describe, expect, it, vi } from 'vitest';
import { handleApiRequest } from '../../src/api/router';
import {
  PERFORMANCE_SHEET_NAME,
  SHEET_DEFINITIONS,
  getPerformanceSheetName,
  getTransactionSheetName,
} from '../../src/Config';
import { createStubSheetRepository, ok, fail } from '../fakes';

const { createTransactionSpy } = vi.hoisted(() => ({
  createTransactionSpy: vi.fn(() => ({ success: true as const, value: undefined })),
}));

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
    findById: () =>
      ok({
        id: 'fund-001',
        name: '国内株式',
        rakutenFundId: null,
        settlementBusinessDays: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      }),
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
    listByFundId: () =>
      ok([
        {
          id: '購入-001',
          fundId: 'fund-001',
          type: 'SPOT_PURCHASE',
          date: '2024-01-01',
          amount: 100000,
          navValue: 10000,
          units: 100000,
          incomeTax: null,
          residentTax: null,
          recurringPurchaseId: null,
          idempotencyKey: null,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ]),
    listAll: () => ok([]),
    createTransaction: createTransactionSpy,
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

// WeeklyReportUseCase は sendWeeklyReport ケースの委譲検証のためモックする。
// sendReport スパイを共有し、router が委譲先を取り違えないことを直接固定する（H2 #148）。
const sendReportSpy = vi.fn(() => ok({ message: '週次レポートを送信しました。' }));
vi.mock('../../src/usecase/WeeklyReportUseCase', () => ({
  createWeeklyReportUseCase: () => ({
    generateWeeklyReport: vi.fn(),
    sendReport: sendReportSpy,
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

  it('sendWeeklyReport アクションは WeeklyReportUseCase.sendReport へ委譲し結果をそのまま返す', async () => {
    // 前提: シート接続が成功する
    // 事前条件: WeeklyReportUseCase.sendReport が成功結果を返すようモックされている
    // 検証: router が sendReport を1回呼び、その Result を変更せずそのまま返す（H2 #148 の委譲固定）
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    openSheetRepository.mockReturnValue(ok(createStubSheetRepository()));
    sendReportSpy.mockClear();

    const result = handleApiRequest({ action: 'sendWeeklyReport' });

    expect(sendReportSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, value: { message: '週次レポートを送信しました。' } });
  });

  it('シート初期化でシート作成に失敗した場合はエラーを返す', async () => {
    // 前提: ensureSheetが失敗する
    // 事前条件: openSheetRepositoryがシートリポジトリを返す
    // 検証: initializeSheetsが失敗結果を返す
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    const sheetRepository = createStubSheetRepository({
      ensureSheet: () => fail('unexpected', 'シート作成に失敗しました。'),
    });

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
    const sheetRepository = createStubSheetRepository({
      ensureSheet: (definition) => {
        ensured.push(definition.name);
        return ok({} as GoogleAppsScript.Spreadsheet.Sheet);
      },
    });

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
    const sheetRepository = createStubSheetRepository();

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
    const sheetRepository = createStubSheetRepository({
      ensureSheet: () => fail('unexpected', '必要シートの検証に失敗しました。'),
    });

    openSheetRepository.mockReturnValue(ok(sheetRepository));

    const result = handleApiRequest({ action: 'fetchAllNavs' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('失敗');
    }
  });

  it('executeSaleアクションは所得税・住民税を売却ユースケースへ渡す', async () => {
    // 前提: 銘柄と十分な購入口数が存在する
    // 事前条件: executeSaleリクエストに所得税と住民税を指定する
    // 検証: 作成される売却取引に両税額が同じ値で設定される
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    openSheetRepository.mockReturnValue(ok(createStubSheetRepository()));
    createTransactionSpy.mockClear();

    const result = handleApiRequest({
      action: 'executeSale',
      fundId: 'fund-001',
      date: '2024-02-01',
      units: 10000,
      amount: 12000,
      navValue: 12000,
      incomeTax: 306,
      residentTax: 100,
    });

    expect(result.success).toBe(true);
    expect(createTransactionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'REDEMPTION',
        incomeTax: 306,
        residentTax: 100,
      })
    );
  });
});
