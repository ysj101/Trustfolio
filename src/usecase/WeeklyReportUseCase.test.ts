import { describe, expect, it, vi } from 'vitest';
import { createWeeklyReportUseCase } from './WeeklyReportUseCase';
import type { PortfolioUseCase } from './PortfolioUseCase';
import { ok } from '../test/fakes';

describe('WeeklyReportUseCase', () => {
  it('ポートフォリオ情報と生成日時を返す', () => {
    // 前提: ポートフォリオ取得が成功する
    // 事前条件: Utilities.formatDateが固定値を返す
    // 検証: 生成日時とポートフォリオが返る
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

    const formatDateMock = vi
      .spyOn(globalThis.Utilities, 'formatDate')
      .mockReturnValue('2024-04-01 09:00:00');

    const useCase = createWeeklyReportUseCase(portfolioUseCase);
    const result = useCase.generateWeeklyReport();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.generatedAt).toBe('2024-04-01 09:00:00');
      expect(result.value.portfolio.totalInvestment).toBe(10000);
    }

    formatDateMock.mockRestore();
  });
});
