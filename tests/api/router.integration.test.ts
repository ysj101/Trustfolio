import { describe, expect, it, vi, beforeEach } from 'vite-plus/test';
import { handleApiRequest } from '../../src/api/router';
import {
  SHEET_NAMES,
  PERFORMANCE_HEADERS,
  PERFORMANCE_SHEET_NAME,
  getTransactionSheetName,
  getPerformanceSheetName,
} from '../../src/Config';
import { createInMemorySheetRepository, headerRow, ok } from '../fakes';

vi.mock('../../src/repository/SheetRepository', () => ({
  openSheetRepository: vi.fn(),
}));

type FundSummary = { id: string; name: string };

function isFundList(value: unknown): value is FundSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as FundSummary).id === 'string' &&
        typeof (item as FundSummary).name === 'string'
    )
  );
}

function hasHoldings(value: unknown): value is { holdings: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'holdings' in value &&
    Array.isArray((value as { holdings: unknown[] }).holdings)
  );
}

describe('router integration', () => {
  beforeEach(async () => {
    const { openSheetRepository } = vi.mocked(await import('../../src/repository/SheetRepository'));
    const fundId = 'fund-001';
    const transactionSheet = getTransactionSheetName(fundId);
    const performanceSheet = getPerformanceSheetName(fundId);
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        headerRow(SHEET_NAMES.FUNDS),
        [fundId, '国内株式', '', 0, '', '', 'equity', '2024-01-01T00:00:00.000Z'],
      ],
      [SHEET_NAMES.NAV_RECORDS]: [
        headerRow(SHEET_NAMES.NAV_RECORDS),
        [fundId, '2024-03-05', 10000, '2024-03-05T00:00:00.000Z'],
      ],
      [SHEET_NAMES.RECURRING]: [headerRow(SHEET_NAMES.RECURRING)],
      [transactionSheet]: [headerRow(SHEET_NAMES.TRANSACTIONS)],
      [performanceSheet]: [[...PERFORMANCE_HEADERS]],
      [PERFORMANCE_SHEET_NAME]: [[...PERFORMANCE_HEADERS]],
    });
    openSheetRepository.mockReturnValue(ok(sheetRepository));
  });

  it('createFundとupdateFundが成功する', () => {
    // 前提: 初期のfundsシートが存在する
    // 事前条件: createFundで新規追加できる
    // 検証: updateFundで名称が更新される
    const createResult = handleApiRequest({
      action: 'createFund',
      name: '海外株式',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: null,
      navSourceCode: null,
      assetClass: 'equity',
    });
    expect(createResult.success).toBe(true);

    const listResult = handleApiRequest({ action: 'listFunds' });
    expect(listResult.success).toBe(true);
    if (listResult.success && isFundList(listResult.value)) {
      const created = listResult.value.find((fund) => fund.name === '海外株式');
      expect(created).toBeTruthy();
      if (!created) {
        return;
      }
      const updateResult = handleApiRequest({
        action: 'updateFund',
        id: created.id,
        name: '海外株式（更新）',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: null,
        navSourceCode: null,
      });
      expect(updateResult.success).toBe(true);
      return;
    }
    expect(listResult.success).toBe(false);
  });

  it('未指定の取得元項目をnullへ正規化し、wealthadvisor項目をAPI境界から保存する', () => {
    // 前提: API利用者は新項目を省略でき、別の銘柄ではWealth Advisor取得元を明示できる。
    // 事前条件: 初期化済みのfundsシートを使用する。
    // 検証: 省略時は両項目がnullとなり、明示時は指定値が作成結果へ保持される。
    const omittedResult = handleApiRequest({
      action: 'createFund',
      name: '先進国債券インデックスファンド',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      assetClass: 'equity',
    });
    expect(omittedResult.success).toBe(true);
    if (omittedResult.success) {
      const created = omittedResult.value as { navSource?: unknown; navSourceCode?: unknown };
      expect(created.navSource).toBeNull();
      expect(created.navSourceCode).toBeNull();
    }

    const wealthAdvisorResult = handleApiRequest({
      action: 'createFund',
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: 'wealthadvisor',
      navSourceCode: 'sbi_am/sa_202306080A',
      assetClass: 'gold',
    });
    expect(wealthAdvisorResult.success).toBe(true);
    if (wealthAdvisorResult.success) {
      const created = wealthAdvisorResult.value as {
        id?: unknown;
        navSource?: unknown;
        navSourceCode?: unknown;
      };
      expect(created.navSource).toBe('wealthadvisor');
      expect(created.navSourceCode).toBe('sbi_am/sa_202306080A');
      expect(typeof created.id).toBe('string');
      if (typeof created.id === 'string') {
        const updateResult = handleApiRequest({
          action: 'updateFund',
          id: created.id,
          name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし・更新）',
          rakutenFundId: null,
          settlementBusinessDays: 3,
          navSource: 'wealthadvisor',
          navSourceCode: 'sbi_am/sa_202306080A',
        });
        expect(updateResult.success).toBe(true);
        if (updateResult.success) {
          const updated = updateResult.value as { navSourceCode?: unknown };
          expect(updated.navSourceCode).toBe('sbi_am/sa_202306080A');
        }
      }
    }
  });

  it('旧形式updateFundでは取得元を維持し、明示nullでは取得元をクリアする', () => {
    // 前提: Wealth Advisor取得元を設定したSBI証券限定販売ファンドをAPI経由で作成する。
    // 事前条件: 最初の更新は取得元2項目を含まない旧形式、次の更新は両項目へnullを指定する。
    // 検証: 旧形式更新（取得元2項目とassetClassを省略）では既存の取得元設定と資産クラス（gold）が維持され、
    //       明示nullの更新では取得元2項目がクリアされる。
    const createResult = handleApiRequest({
      action: 'createFund',
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      navSource: 'wealthadvisor',
      navSourceCode: 'sbi_am/sa_202306080A',
      assetClass: 'gold',
    });
    expect(createResult.success).toBe(true);
    if (!createResult.success) {
      return;
    }
    const created = createResult.value as { id?: unknown };
    expect(typeof created.id).toBe('string');
    if (typeof created.id !== 'string') {
      return;
    }

    const legacyUpdateResult = handleApiRequest({
      action: 'updateFund',
      id: created.id,
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（旧形式更新）',
      rakutenFundId: null,
      settlementBusinessDays: 3,
    });
    expect(legacyUpdateResult.success).toBe(true);
    if (legacyUpdateResult.success) {
      const updated = legacyUpdateResult.value as {
        navSource?: unknown;
        navSourceCode?: unknown;
      };
      expect(updated.navSource).toBe('wealthadvisor');
      expect(updated.navSourceCode).toBe('sbi_am/sa_202306080A');
      expect((legacyUpdateResult.value as { assetClass?: unknown }).assetClass).toBe('gold');
    }

    const clearResult = handleApiRequest({
      action: 'updateFund',
      id: created.id,
      name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（取得元解除）',
      rakutenFundId: null,
      settlementBusinessDays: 3,
      navSource: null,
      navSourceCode: null,
    });
    expect(clearResult.success).toBe(true);
    if (clearResult.success) {
      const cleared = clearResult.value as { navSource?: unknown; navSourceCode?: unknown };
      expect(cleared.navSource).toBeNull();
      expect(cleared.navSourceCode).toBeNull();
    }
  });

  it('登録フォームの未選択値（空文字列）のassetClassをAPI境界でvalidationエラーにする', () => {
    // 前提: 登録フォームの資産クラスselectは未選択時に空文字列を送る。
    // 事前条件: 銘柄名・約定営業日数は妥当で、assetClassだけが空文字列である。
    // 検証: 銘柄は作成されず、assetClassフィールドのvalidationエラーが返る。
    const result = handleApiRequest({
      action: 'createFund',
      name: '未選択テスト銘柄',
      rakutenFundId: null,
      settlementBusinessDays: 2,
      assetClass: '' as never,
    });
    expect(result).toEqual({
      success: false,
      error: { type: 'validation', message: '資産クラスを選択してください。', field: 'assetClass' },
    });
    const listResult = handleApiRequest({ action: 'listFunds' });
    expect(listResult.success).toBe(true);
    if (listResult.success && isFundList(listResult.value)) {
      expect(listResult.value.some((fund) => fund.name === '未選択テスト銘柄')).toBe(false);
    }
  });

  it('取引登録と取得が成功する', () => {
    // 前提: 銘柄が存在する
    // 事前条件: スポット購入を登録する
    // 検証: 取引履歴に反映される
    const purchaseResult = handleApiRequest({
      action: 'executeSpotPurchase',
      fundId: 'fund-001',
      date: '2024-03-05',
      amount: 10000,
      navValue: 10000,
    });
    expect(purchaseResult.success).toBe(true);

    const historyResult = handleApiRequest({
      action: 'getTransactionHistory',
      fundId: 'fund-001',
    });
    expect(historyResult.success).toBe(true);
    if (historyResult.success && Array.isArray(historyResult.value)) {
      expect(historyResult.value).toHaveLength(1);
    }
  });

  it('売却登録と更新で所得税・住民税がAPI境界を通過する', () => {
    // 前提: 売却可能な口数のスポット購入が登録済みである
    // 事前条件: 売却登録と売却更新のリクエストに税額2項目を指定する
    // 検証: 更新後の取引履歴に所得税と住民税が別々に保存される
    const purchaseResult = handleApiRequest({
      action: 'executeSpotPurchase',
      fundId: 'fund-001',
      date: '2024-03-05',
      amount: 100000,
      navValue: 10000,
    });
    expect(purchaseResult.success).toBe(true);

    const saleResult = handleApiRequest({
      action: 'executeSale',
      fundId: 'fund-001',
      date: '2024-03-06',
      units: 10000,
      amount: 12000,
      navValue: 12000,
      incomeTax: 306,
      residentTax: 100,
    });
    expect(saleResult.success).toBe(true);
    if (!saleResult.success || typeof saleResult.value !== 'object' || saleResult.value === null) {
      return;
    }
    const sale = saleResult.value as { id: string };

    const updateResult = handleApiRequest({
      action: 'updateSaleTransaction',
      id: sale.id,
      fundId: 'fund-001',
      date: '2024-03-06',
      units: 10000,
      amount: 12000,
      navValue: 12000,
      incomeTax: 400,
      residentTax: 120,
    });
    expect(updateResult.success).toBe(true);

    const historyResult = handleApiRequest({
      action: 'getTransactionHistory',
      fundId: 'fund-001',
    });
    expect(historyResult.success).toBe(true);
    if (historyResult.success && Array.isArray(historyResult.value)) {
      const updatedSale = historyResult.value.find(
        (transaction) =>
          typeof transaction === 'object' &&
          transaction !== null &&
          'type' in transaction &&
          transaction.type === 'REDEMPTION'
      ) as { incomeTax?: number; residentTax?: number } | undefined;
      expect(updatedSale?.incomeTax).toBe(400);
      expect(updatedSale?.residentTax).toBe(120);
    }
  });

  it('基準価額履歴と保有情報が取得できる', () => {
    // 前提: 基準価額が登録済みである
    // 事前条件: スポット購入を登録する
    // 検証: getNavHistoryとgetHoldingが成功する
    handleApiRequest({
      action: 'executeSpotPurchase',
      fundId: 'fund-001',
      date: '2024-03-05',
      amount: 10000,
      navValue: 10000,
    });

    const navResult = handleApiRequest({ action: 'getNavHistory', fundId: 'fund-001' });
    expect(navResult.success).toBe(true);
    if (navResult.success && Array.isArray(navResult.value)) {
      expect(navResult.value).toHaveLength(1);
    }

    const holdingResult = handleApiRequest({ action: 'getHolding', fundId: 'fund-001' });
    expect(holdingResult.success).toBe(true);
    if (holdingResult.success && typeof holdingResult.value === 'object' && holdingResult.value) {
      const holding = holdingResult.value as { currentValue?: number | null };
      expect(holding.currentValue).toBe(10000);
    }
  });

  it('積立設定の作成と自動実行が成功する', () => {
    // 前提: 銘柄が存在する
    // 事前条件: 積立設定を作成する
    // 検証: executeRecurringPurchasesが成功する
    const createResult = handleApiRequest({
      action: 'createRecurringPurchase',
      fundId: 'fund-001',
      monthlyAmount: 10000,
      executionDay: 5,
      startDate: '2024-01-01',
      endDate: null,
      isActive: true,
    });
    expect(createResult.success).toBe(true);

    const executeResult = handleApiRequest({
      action: 'executeRecurringPurchases',
      targetDate: '2024-03-05',
    });
    expect(executeResult.success).toBe(true);
  });

  it('ポートフォリオサマリーが取得できる', () => {
    // 前提: 取引と基準価額が存在する
    // 事前条件: スポット購入を登録する
    // 検証: getPortfolioSummaryが成功する
    handleApiRequest({
      action: 'executeSpotPurchase',
      fundId: 'fund-001',
      date: '2024-03-05',
      amount: 10000,
      navValue: 10000,
    });
    const result = handleApiRequest({ action: 'getPortfolioSummary' });
    expect(result.success).toBe(true);
    if (result.success && hasHoldings(result.value)) {
      expect(result.value.holdings).toHaveLength(1);
    }
  });
});
