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
          navSource: null,
          navSourceCode: null,
          assetClass: 'equity',
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
        navSource: null,
        navSourceCode: null,
        assetClass: 'equity',
        createdAt: '2024-01-01T00:00:00.000Z',
      }),
    createFund: () => ok(undefined),
    updateFund: () => ok(undefined),
    updateAssetClass: () => ok(undefined),
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

  it('createFundリクエストのassetClassをユースケースへ渡す', async () => {
    // 前提: シート接続と銘柄作成に必要なリポジトリ処理が成功する。
    // 事前条件: createFundリクエストへgoldを明示する。
    // 検証: 作成結果のFundにgoldが保持され、API境界で値が欠落しない。
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    openSheetRepository.mockReturnValue(ok(createStubSheetRepository()));

    const result = handleApiRequest({
      action: 'createFund',
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: null,
      navSourceCode: null,
      assetClass: 'gold',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual(expect.objectContaining({ assetClass: 'gold' }));
    }
  });

  it('setFundAssetClassリクエストを資産クラス専用ユースケースへ配線する', async () => {
    // 前提: equityが設定された既存の国内株式ファンドが存在する。
    // 事前条件: setFundAssetClassリクエストへgoldを指定する。
    // 検証: 専用アクションがassetClassだけをgoldへ変更したFundを返す。
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    openSheetRepository.mockReturnValue(ok(createStubSheetRepository()));

    const result = handleApiRequest({
      action: 'setFundAssetClass',
      id: 'fund-001',
      assetClass: 'gold',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual(
        expect.objectContaining({ id: 'fund-001', name: '国内株式', assetClass: 'gold' })
      );
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

describe('checkWealthAdvisorNavSource', () => {
  it('形式不正な取得元コードを通信前に拒否する', () => {
    // 前提: 取得元コードにはcompany/pageId形式が必要である。
    // 事前条件: スラッシュのないコードを指定する。
    // 検証: 通信せず、対象フィールドのvalidationエラーを返す。
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch');
    fetchMock.mockClear();
    try {
      expect(
        handleApiRequest({ action: 'checkWealthAdvisorNavSource', navSourceCode: 'sbi_am' })
      ).toEqual(
        fail('validation', 'Wealth Advisor取得元コードが不正です: sbi_am', 'navSourceCode')
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it.each([null, undefined, 8931, {}, []].map((navSourceCode) => ({ navSourceCode })))(
    '文字列以外のコード $navSourceCode を拒否する',
    ({ navSourceCode }) => {
      // 前提: doPostから型定義に反する外部入力が渡される場合がある。
      // 事前条件: 文字列以外の値を意図的に渡す。
      // 検証: trimなどで例外を起こさずvalidationエラーを返す。
      expect(
        handleApiRequest({
          action: 'checkWealthAdvisorNavSource',
          navSourceCode: navSourceCode as unknown as string,
        })
      ).toEqual(fail('validation', '取得元コードは文字列で入力してください。', 'navSourceCode'));
    }
  );

  it.each([
    {
      description: '基準価額と基準日を取得できる',
      html: '<th>基準価額</th><td><span class="fprice">26,093</span>円</td><td><span class="ptdate">2026年09月01日</span></td>',
      nav: { date: '2026-09-01', value: 26093 },
    },
    {
      description: '基準価額を抽出できずnullになる',
      html: '<html><body>基準価額の掲載がないページ</body></html>',
      nav: null,
    },
  ])('シート接続なしでHTTP 200の結果を返す: $description', async ({ html, nav }) => {
    // 前提: ＳＢＩ・iシェアーズ・ゴールドファンドのコードで疎通確認する。
    // 事前条件: HTTP 200のHTMLを返す一方、シート接続は失敗する設定とする。
    // 検証: シートへ接続せず、抽出不可のnullも変更せず成功結果に保持する。
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    openSheetRepository.mockClear();
    openSheetRepository.mockReturnValue(fail('unexpected', 'シート接続に失敗しました。'));
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });
    try {
      expect(
        handleApiRequest({
          action: 'checkWealthAdvisorNavSource',
          navSourceCode: 'sbi_am/sa_202306080A',
        })
      ).toEqual({
        success: true,
        value: {
          url: 'https://apl.wealthadvisor.jp/webasp/sbi_am/pc/basic/sa_202306080A.html',
          statusCode: 200,
          nav,
        },
      });
      expect(openSheetRepository).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
