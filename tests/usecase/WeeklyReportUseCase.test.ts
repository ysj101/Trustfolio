import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createWeeklyReportUseCase } from '../../src/usecase/WeeklyReportUseCase';
import type { PortfolioUseCase } from '../../src/usecase/PortfolioUseCase';
import type { PerformanceRepository } from '../../src/repository/PerformanceRepository';
import type { PerformanceRecord } from '../../src/domain/types';
import { getWeeklyReportEmail } from '../../src/Config';
import { ok, fail, createStubEmailService } from '../fakes';

// Config は getWeeklyReportEmail（sendReport が宛先取得に使用）のみモックし、
// 他の実定義は実体をそのまま使う（tests/main.test.ts と同じ手法）。
vi.mock('../../src/Config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/Config')>();
  return { ...actual, getWeeklyReportEmail: vi.fn() };
});

/**
 * テスト用にDateをJST文字列へ変換する。
 * 週次レポートの探索順を実データに近い形で検証するため、
 * `Utilities.formatDate` が利用する2種類のフォーマットだけを明示的に実装する。
 *
 * @param date - 変換対象の日時
 * @param format - 変換後のフォーマット
 * @returns JSTで整形した文字列
 * @throws 未対応のフォーマットが指定された場合
 */
function formatDateInJstForTest(date: Date, format: string): string {
  const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jstDate.getUTCDate()).padStart(2, '0');
  const hours = String(jstDate.getUTCHours()).padStart(2, '0');
  const minutes = String(jstDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(jstDate.getUTCSeconds()).padStart(2, '0');

  if (format === 'yyyy-MM-dd') {
    return `${year}-${month}-${day}`;
  }

  if (format === 'yyyy-MM-dd HH:mm:ss') {
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  throw new Error(`未対応のformatDateフォーマットです: ${format}`);
}

/**
 * WeeklyReportUseCase向けに`Utilities.formatDate`を実装どおりにスタブする。
 * 生成日時と探索日付の両方を同じモックで扱い、探索順検証を成立させる。
 */
function mockUtilitiesFormatDate(): void {
  vi.spyOn(globalThis.Utilities, 'formatDate').mockImplementation((date, _timeZone, format) =>
    formatDateInJstForTest(date, format)
  );
}

describe('WeeklyReportUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-04-08T09:00:00+09:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('前週データが存在しない場合、前週比なしのレポートを生成する', () => {
    // 前提: ポートフォリオ取得が成功するが、前週データが存在しない
    // 事前条件: 7日前から14日前までの全探索日付でデータが見つからない
    // 検証: 生成日時とポートフォリオが返り、前週比情報がnullになる
    const portfolioUseCase: PortfolioUseCase = {
      getPortfolioSummary: () =>
        ok({
          totalInvestment: 10000,
          totalSaleAmount: 0,
          realizedGain: 0,
          totalTax: 0,
          realizedGainAfterTax: 0,
          taxUnrecordedSaleCount: 0,
          remainingInvestment: 10000,
          totalCurrentValue: 10000,
          totalUnrealizedGain: 0,
          totalUnrealizedGainRate: 0,
          totalGain: 0,
          totalGainRate: 0,
          assetClassSummaries: [],
          holdings: [],
        }),
    };

    const findGlobalByDate = vi.fn(() => ok(null));

    const performanceRepository: PerformanceRepository = {
      createPerformance: vi.fn(),
      createGlobalPerformance: vi.fn(),
      findByFundAndDate: vi.fn(),
      findGlobalByDate,
      findLatestByFundId: vi.fn(),
      listGlobalHistory: vi.fn(),
      findGlobalByDateRange: vi.fn(),
      findByFundAndDateRange: vi.fn(),
    };

    mockUtilitiesFormatDate();

    const useCase = createWeeklyReportUseCase(
      portfolioUseCase,
      performanceRepository,
      createStubEmailService()
    );
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

    expect(findGlobalByDate.mock.calls.map((args) => args[0])).toEqual([
      '2024-04-01',
      '2024-03-31',
      '2024-03-30',
      '2024-03-29',
      '2024-03-28',
      '2024-03-27',
      '2024-03-26',
      '2024-03-25',
    ]);
  });

  it('前週データが存在する場合、前週比付きのレポートを生成する', () => {
    // 前提: ポートフォリオ取得が成功し、前週データも存在する
    // 事前条件: 前週の残存投資額が9000円、評価額が9500円
    // 検証: 前週比が正しく計算され、資産クラス別サマリーも保持される
    const portfolioUseCase: PortfolioUseCase = {
      getPortfolioSummary: () =>
        ok({
          totalInvestment: 10000,
          totalSaleAmount: 0,
          realizedGain: 0,
          totalTax: 0,
          realizedGainAfterTax: 0,
          taxUnrecordedSaleCount: 0,
          remainingInvestment: 10000,
          totalCurrentValue: 11000,
          totalUnrealizedGain: 1000,
          totalUnrealizedGainRate: 0.1,
          totalGain: 1000,
          totalGainRate: 0.1,
          assetClassSummaries: [],
          holdings: [
            {
              fundId: 'fund-001',
              fundName: '日本株インデックス',
              assetClass: null,
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

    const findByFundAndDate = vi.fn(() => ok(previousFundRecord));

    const performanceRepository: PerformanceRepository = {
      createPerformance: vi.fn(),
      createGlobalPerformance: vi.fn(),
      findByFundAndDate,
      findGlobalByDate: () => ok(previousGlobalRecord),
      findLatestByFundId: vi.fn(),
      listGlobalHistory: vi.fn(),
      findGlobalByDateRange: vi.fn(),
      findByFundAndDateRange: vi.fn(),
    };

    mockUtilitiesFormatDate();

    const useCase = createWeeklyReportUseCase(
      portfolioUseCase,
      performanceRepository,
      createStubEmailService()
    );
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

    expect(findByFundAndDate).toHaveBeenCalledWith('fund-001', '2024-04-01');
  });

  it('前週データが7日前ではなく8日前に存在する場合も取得できる', () => {
    // 前提: 7日前のデータは存在しないが、8日前のデータが存在する
    // 事前条件: 7日前を探索した後に、8日前のデータだけが見つかる
    // 検証: 過去方向の探索順で8日前のデータが採用され、前週比が計算される
    const portfolioUseCase: PortfolioUseCase = {
      getPortfolioSummary: () =>
        ok({
          totalInvestment: 10000,
          totalSaleAmount: 0,
          realizedGain: 0,
          totalTax: 0,
          realizedGainAfterTax: 0,
          taxUnrecordedSaleCount: 0,
          remainingInvestment: 10000,
          totalCurrentValue: 11000,
          totalUnrealizedGain: 1000,
          totalUnrealizedGainRate: 0.1,
          totalGain: 1000,
          totalGainRate: 0.1,
          assetClassSummaries: [],
          holdings: [],
        }),
    };

    const previousGlobalRecord: PerformanceRecord = {
      fundId: '',
      date: '2024-03-31',
      totalUnits: 0,
      remainingInvestment: 9000,
      currentValue: 9500,
      totalGain: 500,
      unrealizedGainRate: 0.0556,
      createdAt: '2024-03-31T00:00:00.000Z',
    };

    const findGlobalByDate = vi.fn((date: string) =>
      date === '2024-03-31' ? ok(previousGlobalRecord) : ok(null)
    );

    const performanceRepository: PerformanceRepository = {
      createPerformance: vi.fn(),
      createGlobalPerformance: vi.fn(),
      findByFundAndDate: vi.fn(),
      findGlobalByDate,
      findLatestByFundId: vi.fn(),
      listGlobalHistory: vi.fn(),
      findGlobalByDateRange: vi.fn(),
      findByFundAndDateRange: vi.fn(),
    };

    mockUtilitiesFormatDate();

    const useCase = createWeeklyReportUseCase(
      portfolioUseCase,
      performanceRepository,
      createStubEmailService()
    );
    const result = useCase.generateWeeklyReport();
    expect(result.success).toBe(true);
    if (result.success) {
      // 8日前のデータが取得できたため、前週比が計算される
      expect(result.value.portfolio.hasPreviousWeekData).toBe(true);
      expect(result.value.portfolio.remainingInvestmentChange?.difference).toBe(1000);
    }

    expect(findGlobalByDate.mock.calls.map((args) => args[0])).toEqual([
      '2024-04-01',
      '2024-03-31',
    ]);
  });

  it('前週が祝日・連休の場合でも、14日前までの範囲で前週データを取得できる', () => {
    // 前提: 7日前から9日前まではデータが存在しないが、10日前のデータは存在する
    // 事前条件: 過去方向に探索した4件目で、10日前のデータだけが見つかる
    // 検証: 10日前のデータが採用され、探索順も過去方向のみである
    const portfolioUseCase: PortfolioUseCase = {
      getPortfolioSummary: () =>
        ok({
          totalInvestment: 10000,
          totalSaleAmount: 0,
          realizedGain: 0,
          totalTax: 0,
          realizedGainAfterTax: 0,
          taxUnrecordedSaleCount: 0,
          remainingInvestment: 10000,
          totalCurrentValue: 11000,
          totalUnrealizedGain: 1000,
          totalUnrealizedGainRate: 0.1,
          totalGain: 1000,
          totalGainRate: 0.1,
          assetClassSummaries: [],
          holdings: [],
        }),
    };

    const previousGlobalRecord: PerformanceRecord = {
      fundId: '',
      date: '2024-03-29',
      totalUnits: 0,
      remainingInvestment: 9000,
      currentValue: 9500,
      totalGain: 500,
      unrealizedGainRate: 0.0556,
      createdAt: '2024-03-29T00:00:00.000Z',
    };

    const findGlobalByDate = vi.fn((date: string) =>
      date === '2024-03-29' ? ok(previousGlobalRecord) : ok(null)
    );

    const performanceRepository: PerformanceRepository = {
      createPerformance: vi.fn(),
      createGlobalPerformance: vi.fn(),
      findByFundAndDate: vi.fn(),
      findGlobalByDate,
      findLatestByFundId: vi.fn(),
      listGlobalHistory: vi.fn(),
      findGlobalByDateRange: vi.fn(),
      findByFundAndDateRange: vi.fn(),
    };

    mockUtilitiesFormatDate();

    const useCase = createWeeklyReportUseCase(
      portfolioUseCase,
      performanceRepository,
      createStubEmailService()
    );
    const result = useCase.generateWeeklyReport();
    expect(result.success).toBe(true);
    if (result.success) {
      // 10日前のデータが取得できたため、前週比が計算される
      expect(result.value.portfolio.hasPreviousWeekData).toBe(true);
      expect(result.value.portfolio.remainingInvestmentChange?.difference).toBe(1000);
    }

    expect(findGlobalByDate.mock.calls.map((args) => args[0])).toEqual([
      '2024-04-01',
      '2024-03-31',
      '2024-03-30',
      '2024-03-29',
    ]);
  });

  describe('sendReport', () => {
    /**
     * sendReport 検証用の共通セットアップ。
     * ポートフォリオ取得は成功・前週データなしの最小構成でレポート生成が成功する状態を作る。
     */
    function createSendReportFixture(): {
      portfolioUseCase: PortfolioUseCase;
      performanceRepository: PerformanceRepository;
    } {
      const portfolioUseCase: PortfolioUseCase = {
        getPortfolioSummary: () =>
          ok({
            totalInvestment: 10000,
            totalSaleAmount: 0,
            realizedGain: 0,
            totalTax: 0,
            realizedGainAfterTax: 0,
            taxUnrecordedSaleCount: 0,
            remainingInvestment: 10000,
            totalCurrentValue: 10000,
            totalUnrealizedGain: 0,
            totalUnrealizedGainRate: 0,
            totalGain: 0,
            totalGainRate: 0,
            assetClassSummaries: [
              {
                assetClass: 'equity',
                totalInvestment: 10000,
                totalSaleAmount: 0,
                realizedGain: 0,
                totalTax: 0,
                realizedGainAfterTax: 0,
                taxUnrecordedSaleCount: 0,
                remainingInvestment: 10000,
                totalCurrentValue: 10000,
                totalUnrealizedGain: 0,
                totalUnrealizedGainRate: 0,
                totalGain: 0,
                totalGainRate: 0,
                holdingCount: 1,
                allocationRate: 1,
              },
            ],
            holdings: [],
          }),
      };
      const performanceRepository: PerformanceRepository = {
        createPerformance: vi.fn(),
        createGlobalPerformance: vi.fn(),
        findByFundAndDate: vi.fn(),
        findGlobalByDate: () => ok(null),
        findLatestByFundId: vi.fn(),
        listGlobalHistory: vi.fn(),
        findGlobalByDateRange: vi.fn(),
        findByFundAndDateRange: vi.fn(),
      };
      return { portfolioUseCase, performanceRepository };
    }

    it('宛先が設定されている場合はレポートを生成してメール送信し、完了メッセージを返す', () => {
      // 前提: WEEKLY_REPORT_EMAIL が設定されており、レポート生成・メール送信とも成功する
      // 事前条件: ポートフォリオ取得成功・前週データなし（生成は成功する最小構成）
      // 検証: 生成したレポートと宛先で sendWeeklyReport が1回呼ばれ、
      //   移設前の router 実装と同一の完了メッセージが返る
      vi.mocked(getWeeklyReportEmail).mockReturnValue('notify@example.com');
      const { portfolioUseCase, performanceRepository } = createSendReportFixture();
      const sendWeeklyReport = vi.fn(() => ok<void>(undefined));
      mockUtilitiesFormatDate();

      const useCase = createWeeklyReportUseCase(
        portfolioUseCase,
        performanceRepository,
        createStubEmailService({ sendWeeklyReport })
      );
      const result = useCase.sendReport();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.message).toBe('週次レポートを送信しました。');
      }
      expect(sendWeeklyReport).toHaveBeenCalledTimes(1);
      expect(sendWeeklyReport).toHaveBeenCalledWith(
        expect.objectContaining({
          generatedAt: '2024-04-08 09:00:00',
          // サマリーがenrich処理のスプレッドで失われず、値そのものが週次レポートへ渡ることを検証する。
          portfolio: expect.objectContaining({
            assetClassSummaries: [
              expect.objectContaining({ assetClass: 'equity', allocationRate: 1 }),
            ],
          }),
        }),
        'notify@example.com'
      );
    });

    it('宛先が未設定の場合は validation エラーを返し、レポート生成もメール送信も行わない', () => {
      // 前提: WEEKLY_REPORT_EMAIL が設定されていない
      // 事前条件: なし
      // 検証: 移設前の router 実装と同一メッセージ・field の validation エラーが返り、
      //   ポートフォリオ取得（レポート生成）とメール送信は実行されない
      vi.mocked(getWeeklyReportEmail).mockReturnValue(null);
      const getPortfolioSummary = vi.fn();
      const portfolioUseCase: PortfolioUseCase = { getPortfolioSummary };
      const { performanceRepository } = createSendReportFixture();
      const sendWeeklyReport = vi.fn(() => ok<void>(undefined));

      const useCase = createWeeklyReportUseCase(
        portfolioUseCase,
        performanceRepository,
        createStubEmailService({ sendWeeklyReport })
      );
      const result = useCase.sendReport();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'validation',
          message:
            'WEEKLY_REPORT_EMAILが設定されていません。スクリプトプロパティに設定してください。',
          field: 'WEEKLY_REPORT_EMAIL',
        });
      }
      expect(getPortfolioSummary).not.toHaveBeenCalled();
      expect(sendWeeklyReport).not.toHaveBeenCalled();
    });

    it('レポート生成に失敗した場合はそのエラーを伝播し、メール送信を行わない', () => {
      // 前提: 宛先は設定済みだが、ポートフォリオ取得（レポート生成）が失敗する
      // 事前条件: getPortfolioSummary が失敗を返す
      // 検証: 生成失敗のエラーが伝播し、メール送信は実行されない
      vi.mocked(getWeeklyReportEmail).mockReturnValue('notify@example.com');
      const portfolioUseCase: PortfolioUseCase = {
        getPortfolioSummary: () => fail('unexpected', 'ポートフォリオの取得に失敗しました。'),
      };
      const { performanceRepository } = createSendReportFixture();
      const sendWeeklyReport = vi.fn(() => ok<void>(undefined));

      const useCase = createWeeklyReportUseCase(
        portfolioUseCase,
        performanceRepository,
        createStubEmailService({ sendWeeklyReport })
      );
      const result = useCase.sendReport();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('ポートフォリオの取得に失敗しました。');
      }
      expect(sendWeeklyReport).not.toHaveBeenCalled();
    });

    it('メール送信に失敗した場合はそのエラーを伝播する', () => {
      // 前提: 宛先設定済み・レポート生成成功だが、メール送信が失敗する
      // 事前条件: sendWeeklyReport が失敗を返す
      // 検証: 送信失敗のエラーがそのまま返る
      vi.mocked(getWeeklyReportEmail).mockReturnValue('notify@example.com');
      const { portfolioUseCase, performanceRepository } = createSendReportFixture();
      mockUtilitiesFormatDate();

      const useCase = createWeeklyReportUseCase(
        portfolioUseCase,
        performanceRepository,
        createStubEmailService({
          sendWeeklyReport: () => fail('unexpected', 'メールの送信に失敗しました。'),
        })
      );
      const result = useCase.sendReport();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('メールの送信に失敗しました。');
      }
    });
  });
});
