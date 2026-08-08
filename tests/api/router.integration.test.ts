import { describe, expect, it, vi, beforeEach } from 'vitest';
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
        [fundId, '国内株式', '', 0, '2024-01-01T00:00:00.000Z'],
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
      });
      expect(updateResult.success).toBe(true);
      return;
    }
    expect(listResult.success).toBe(false);
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
