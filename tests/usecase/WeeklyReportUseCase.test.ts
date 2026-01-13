import { describe, expect, it, vi } from 'vitest';
import { createWeeklyReportUseCase } from '../../src/usecase/WeeklyReportUseCase';
import type { PortfolioUseCase } from '../../src/usecase/PortfolioUseCase';
import type { PerformanceRepository } from '../../src/repository/PerformanceRepository';
import type { PerformanceRecord } from '../../src/domain/types';
import { ok } from '../fakes';

describe('WeeklyReportUseCase', () => {
  it('前週データが存在しない場合、前週比なしのレポートを生成する', () => {
    // 前提: ポートフォリオ取得が成功するが、前週データが存在しない
    // 事前条件: Utilities.formatDateが固定値を返す
    // 検証: 生成日時とポートフォリオが返り、前週比情報がnull
    const portfolioUseCase: PortfolioUseCase = {
      getPortfolioSummary: () =>
        ok({
          totalInvestment: 10000,
          totalSaleAmount: 0,
          realizedGain: 0,
          remainingInvestment: 10000,
          totalCurrentValue: 10000,
          totalUnrealizedGain: 0,
          totalUnrealizedGainRate: 0,
          totalGain: 0,
          totalGainRate: 0,
          holdings: [],
        }),
    };

    const performanceRepository: PerformanceRepository = {
      createPerformance: vi.fn(),
      createGlobalPerformance: vi.fn(),
      findByFundAndDate: vi.fn(),
      findGlobalByDate: () => ok(null), // 前週データなし
      findLatestByFundId: vi.fn(),
      listGlobalHistory: vi.fn(),
      findGlobalByDateRange: vi.fn(),
      findByFundAndDateRange: vi.fn(),
    };

    const formatDateMock = vi
      .spyOn(globalThis.Utilities, 'formatDate')
      .mockReturnValue('2024-04-08 09:00:00');

    const useCase = createWeeklyReportUseCase(portfolioUseCase, performanceRepository);
    const result = useCase.generateWeeklyReport();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.generatedAt).toBe('2024-04-08 09:00:00');
      expect(result.value.portfolio.totalInvestment).toBe(10000);
      // 前週データが存在しないため、前週比はnull
      expect(result.value.portfolio.hasPreviousWeekData).toBe(false);
      expect(result.value.portfolio.remainingInvestmentChange).toBeNull();
      expect(result.value.portfolio.totalCurrentValueChange).toBeNull();
    }

    formatDateMock.mockRestore();
  });

  it('前週データが存在する場合、前週比付きのレポートを生成する', () => {
    // 前提: ポートフォリオ取得が成功し、前週データも存在する
    // 事前条件: 前週の残存投資額が9000円、評価額が9500円
    // 検証: 前週比が正しく計算される
    const portfolioUseCase: PortfolioUseCase = {
      getPortfolioSummary: () =>
        ok({
          totalInvestment: 10000,
          totalSaleAmount: 0,
          realizedGain: 0,
          remainingInvestment: 10000,
          totalCurrentValue: 11000,
          totalUnrealizedGain: 1000,
          totalUnrealizedGainRate: 0.1,
          totalGain: 1000,
          totalGainRate: 0.1,
          holdings: [
            {
              fundId: 'fund-001',
              fundName: '日本株インデックス',
              totalUnits: 10000,
              averageCost: 10000,
              totalInvestment: 10000,
              totalSaleAmount: 0,
              remainingInvestment: 10000,
              currentNavValue: 11000,
              currentNavDate: '2024-04-08',
              currentValue: 11000,
              unrealizedGain: 1000,
              unrealizedGainRate: 0.1,
            },
          ],
        }),
    };

    const previousGlobalRecord: PerformanceRecord = {
      fundId: '',
      date: '2024-04-01',
      totalUnits: 0,
      remainingInvestment: 9000,
      currentValue: 9500,
      totalGain: 500,
      unrealizedGainRate: 0.0556,
      createdAt: '2024-04-01T00:00:00.000Z',
    };

    const previousFundRecord: PerformanceRecord = {
      fundId: 'fund-001',
      date: '2024-04-01',
      totalUnits: 9000,
      remainingInvestment: 9000,
      currentValue: 9500,
      totalGain: 500,
      unrealizedGainRate: 0.0556,
      createdAt: '2024-04-01T00:00:00.000Z',
    };

    const performanceRepository: PerformanceRepository = {
      createPerformance: vi.fn(),
      createGlobalPerformance: vi.fn(),
      findByFundAndDate: () => ok(previousFundRecord),
      findGlobalByDate: () => ok(previousGlobalRecord),
      findLatestByFundId: vi.fn(),
      listGlobalHistory: vi.fn(),
      findGlobalByDateRange: vi.fn(),
      findByFundAndDateRange: vi.fn(),
    };

    const formatDateMock = vi
      .spyOn(globalThis.Utilities, 'formatDate')
      .mockReturnValue('2024-04-08 09:00:00');

    const useCase = createWeeklyReportUseCase(portfolioUseCase, performanceRepository);
    const result = useCase.generateWeeklyReport();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.generatedAt).toBe('2024-04-08 09:00:00');
      expect(result.value.portfolio.totalInvestment).toBe(10000);

      // 前週データが存在するため、前週比が計算される
      expect(result.value.portfolio.hasPreviousWeekData).toBe(true);

      // 残存投資額の前週比: 10000 - 9000 = +1000 (+11.11%)
      expect(result.value.portfolio.remainingInvestmentChange?.difference).toBe(1000);
      expect(result.value.portfolio.remainingInvestmentChange?.changeRate).toBeCloseTo(11.11, 1);

      // 評価額の前週比: 11000 - 9500 = +1500 (+15.79%)
      expect(result.value.portfolio.totalCurrentValueChange?.difference).toBe(1500);
      expect(result.value.portfolio.totalCurrentValueChange?.changeRate).toBeCloseTo(15.79, 1);

      // 損益の前週比: 1000 - 500 = +500
      expect(result.value.portfolio.totalUnrealizedGainChange).toBe(500);

      // 損益率の前週比: (0.1 - 0.0556) * 100 = +4.44%ポイント
      expect(result.value.portfolio.totalUnrealizedGainRateChange).toBeCloseTo(4.44, 1);

      // 銘柄別の前週比も計算される
      expect(result.value.portfolio.holdings).toHaveLength(1);
      expect(result.value.portfolio.holdings[0].hasPreviousWeekData).toBe(true);
      expect(result.value.portfolio.holdings[0].remainingInvestmentChange?.difference).toBe(1000);
    }

    formatDateMock.mockRestore();
  });

  it('前週データが7日前ではなく6日前に存在する場合も取得できる', () => {
    // 前提: 7日前のデータは存在しないが、6日前のデータが存在する
    // 事前条件: findGlobalByDateが6日前のデータのみ返す
    // 検証: 前週比が計算される
    const portfolioUseCase: PortfolioUseCase = {
      getPortfolioSummary: () =>
        ok({
          totalInvestment: 10000,
          totalSaleAmount: 0,
          realizedGain: 0,
          remainingInvestment: 10000,
          totalCurrentValue: 11000,
          totalUnrealizedGain: 1000,
          totalUnrealizedGainRate: 0.1,
          totalGain: 1000,
          totalGainRate: 0.1,
          holdings: [],
        }),
    };

    let callCount = 0;
    const previousGlobalRecord: PerformanceRecord = {
      fundId: '',
      date: '2024-04-02',
      totalUnits: 0,
      remainingInvestment: 9000,
      currentValue: 9500,
      totalGain: 500,
      unrealizedGainRate: 0.0556,
      createdAt: '2024-04-02T00:00:00.000Z',
    };

    const performanceRepository: PerformanceRepository = {
      createPerformance: vi.fn(),
      createGlobalPerformance: vi.fn(),
      findByFundAndDate: vi.fn(),
      findGlobalByDate: () => {
        callCount += 1;
        // 1回目（7日前）はnull、2回目（6日前）はデータあり
        return callCount === 1 ? ok(null) : ok(previousGlobalRecord);
      },
      findLatestByFundId: vi.fn(),
      listGlobalHistory: vi.fn(),
      findGlobalByDateRange: vi.fn(),
      findByFundAndDateRange: vi.fn(),
    };

    const formatDateMock = vi
      .spyOn(globalThis.Utilities, 'formatDate')
      .mockReturnValue('2024-04-08 09:00:00');

    const useCase = createWeeklyReportUseCase(portfolioUseCase, performanceRepository);
    const result = useCase.generateWeeklyReport();
    expect(result.success).toBe(true);
    if (result.success) {
      // 前週データが取得できたため、前週比が計算される
      expect(result.value.portfolio.hasPreviousWeekData).toBe(true);
      expect(result.value.portfolio.remainingInvestmentChange?.difference).toBe(1000);
    }

    formatDateMock.mockRestore();
  });
});
