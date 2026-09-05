import { describe, expect, it } from 'vitest';
import {
  calculateWeekOverWeekChange,
  enrichHoldingWithWeekOverWeek,
  enrichPortfolioWithWeekOverWeek,
} from '../../src/domain/WeekOverWeekCalculator';
import type { Holding, PerformanceRecord, Portfolio } from '../../src/domain/types';

describe('WeekOverWeekCalculator', () => {
  describe('calculateWeekOverWeekChange', () => {
    it('前週比（増加）を正しく計算する', () => {
      // 前提: 現在値が100、前週値が80の場合
      // 事前条件: 両方の値が正の数
      // 検証: 差分が+20、変化率が+25.0%として計算される
      const result = calculateWeekOverWeekChange(100, 80);
      expect(result.difference).toBe(20);
      expect(result.changeRate).toBe(25);
    });

    it('前週比（減少）を正しく計算する', () => {
      // 前提: 現在値が80、前週値が100の場合
      // 事前条件: 両方の値が正の数
      // 検証: 差分が-20、変化率が-20.0%として計算される
      const result = calculateWeekOverWeekChange(80, 100);
      expect(result.difference).toBe(-20);
      expect(result.changeRate).toBe(-20);
    });

    it('前週値が0の場合、変化率を0とする', () => {
      // 前提: 現在値が100、前週値が0の場合（新規購入など）
      // 事前条件: 前週値が0
      // 検証: 差分は+100だが、変化率は0（ゼロ除算を回避）
      const result = calculateWeekOverWeekChange(100, 0);
      expect(result.difference).toBe(100);
      expect(result.changeRate).toBe(0);
    });

    it('現在値が0の場合も正しく計算する', () => {
      // 前提: 現在値が0、前週値が100の場合（全売却など）
      // 事前条件: 現在値が0
      // 検証: 差分が-100、変化率が-100.0%として計算される
      const result = calculateWeekOverWeekChange(0, 100);
      expect(result.difference).toBe(-100);
      expect(result.changeRate).toBe(-100);
    });

    it('両方の値が同じ場合、変化率を0とする', () => {
      // 前提: 現在値と前週値がともに100の場合
      // 事前条件: 値が変化していない
      // 検証: 差分が0、変化率が0として計算される
      const result = calculateWeekOverWeekChange(100, 100);
      expect(result.difference).toBe(0);
      expect(result.changeRate).toBe(0);
    });

    it('負の値でも正しく計算する（損失が拡大）', () => {
      // 前提: 現在値が-50、前週値が-30の場合（損失の拡大）
      // 事前条件: 両方の値が負の数
      // 検証: 差分が-20、変化率は-30に対して-20の変化なので約+66.67%
      const result = calculateWeekOverWeekChange(-50, -30);
      expect(result.difference).toBe(-20);
      expect(result.changeRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('enrichHoldingWithWeekOverWeek', () => {
    const baseHolding: Holding = {
      fundId: 'fund-001',
      fundName: '日本株インデックス',
      assetClass: null,
      totalUnits: 10000,
      averageCost: 10000,
      totalInvestment: 100000,
      totalSaleAmount: 0,
      remainingInvestment: 100000,
      currentNavValue: 11000,
      currentNavDate: '2024-01-20',
      currentValue: 110000,
      unrealizedGain: 10000,
      unrealizedGainRate: 0.1,
    };

    it('前週データが存在する場合、前週比を計算する', () => {
      // 前提: 保有情報と前週のパフォーマンスレコードが存在する
      // 事前条件: 前週の残存投資額が90000円、評価額が99000円、損益が9000円、損益率が10%
      // 検証: 各項目の前週比が正しく計算される
      const previousRecord: PerformanceRecord = {
        fundId: 'fund-001',
        date: '2024-01-13',
        totalUnits: 9000,
        remainingInvestment: 90000,
        currentValue: 99000,
        totalGain: 9000,
        unrealizedGainRate: 0.1,
        createdAt: '2024-01-13T00:00:00.000Z',
      };

      const result = enrichHoldingWithWeekOverWeek(baseHolding, previousRecord);

      // 残存投資額: 100000 - 90000 = +10000 (+11.11%)
      expect(result.remainingInvestmentChange?.difference).toBe(10000);
      expect(result.remainingInvestmentChange?.changeRate).toBeCloseTo(11.11, 1);

      // 評価額: 110000 - 99000 = +11000 (+11.11%)
      expect(result.currentValueChange?.difference).toBe(11000);
      expect(result.currentValueChange?.changeRate).toBeCloseTo(11.11, 1);

      // 損益: 10000 - 9000 = +1000
      expect(result.unrealizedGainChange).toBe(1000);

      // 損益率: (0.1 - 0.1) * 100 = 0%ポイント
      expect(result.unrealizedGainRateChange).toBe(0);

      expect(result.hasPreviousWeekData).toBe(true);
    });

    it('前週データが存在しない場合、全ての前週比がnullとなる', () => {
      // 前提: 保有情報は存在するが、前週のパフォーマンスレコードが存在しない
      // 事前条件: previousRecordがnull（新規保有銘柄など）
      // 検証: 全ての前週比情報がnullで、hasPreviousWeekDataがfalse
      const result = enrichHoldingWithWeekOverWeek(baseHolding, null);

      expect(result.remainingInvestmentChange).toBeNull();
      expect(result.currentValueChange).toBeNull();
      expect(result.unrealizedGainChange).toBeNull();
      expect(result.unrealizedGainRateChange).toBeNull();
      expect(result.hasPreviousWeekData).toBe(false);
    });

    it('現在の評価額がnullの場合、評価額の前週比もnullとなる', () => {
      // 前提: 現在の評価額がnull（基準価額未取得など）
      // 事前条件: holding.currentValueがnull
      // 検証: currentValueChangeがnullとなる
      const holdingWithoutCurrentValue: Holding = {
        ...baseHolding,
        currentValue: null,
        unrealizedGain: null,
        unrealizedGainRate: null,
      };

      const previousRecord: PerformanceRecord = {
        fundId: 'fund-001',
        date: '2024-01-13',
        totalUnits: 9000,
        remainingInvestment: 90000,
        currentValue: 99000,
        totalGain: 9000,
        unrealizedGainRate: 0.1,
        createdAt: '2024-01-13T00:00:00.000Z',
      };

      const result = enrichHoldingWithWeekOverWeek(holdingWithoutCurrentValue, previousRecord);

      expect(result.currentValueChange).toBeNull();
      expect(result.unrealizedGainChange).toBeNull();
      expect(result.unrealizedGainRateChange).toBeNull();
      // 残存投資額の前週比は計算される
      expect(result.remainingInvestmentChange).not.toBeNull();
    });
  });

  describe('enrichPortfolioWithWeekOverWeek', () => {
    const basePortfolio: Portfolio = {
      totalInvestment: 200000,
      totalSaleAmount: 0,
      realizedGain: 0,
      totalTax: 0,
      realizedGainAfterTax: 0,
      taxUnrecordedSaleCount: 0,
      remainingInvestment: 200000,
      totalCurrentValue: 220000,
      totalUnrealizedGain: 20000,
      totalUnrealizedGainRate: 0.1,
      totalGain: 20000,
      totalGainRate: 0.1,
      holdings: [
        {
          fundId: 'fund-001',
          fundName: '日本株インデックス',
          assetClass: null,
          totalUnits: 10000,
          averageCost: 10000,
          totalInvestment: 100000,
          totalSaleAmount: 0,
          remainingInvestment: 100000,
          currentNavValue: 11000,
          currentNavDate: '2024-01-20',
          currentValue: 110000,
          unrealizedGain: 10000,
          unrealizedGainRate: 0.1,
        },
        {
          fundId: 'fund-002',
          fundName: '米国株インデックス',
          assetClass: null,
          totalUnits: 10000,
          averageCost: 10000,
          totalInvestment: 100000,
          totalSaleAmount: 0,
          remainingInvestment: 100000,
          currentNavValue: 11000,
          currentNavDate: '2024-01-20',
          currentValue: 110000,
          unrealizedGain: 10000,
          unrealizedGainRate: 0.1,
        },
      ],
    };

    it('前週データが存在する場合、全体および各銘柄の前週比を計算する', () => {
      // 前提: ポートフォリオ全体と各銘柄の前週データが存在する
      // 事前条件: 全体の残存投資額が180000円、評価額が198000円
      // 検証: ポートフォリオ全体と各銘柄の前週比が正しく計算される
      const previousGlobalRecord: PerformanceRecord = {
        fundId: '',
        date: '2024-01-13',
        totalUnits: 0,
        remainingInvestment: 180000,
        currentValue: 198000,
        totalGain: 18000,
        unrealizedGainRate: 0.1,
        createdAt: '2024-01-13T00:00:00.000Z',
      };

      const previousFundRecordsMap = new Map<string, PerformanceRecord>([
        [
          'fund-001',
          {
            fundId: 'fund-001',
            date: '2024-01-13',
            totalUnits: 9000,
            remainingInvestment: 90000,
            currentValue: 99000,
            totalGain: 9000,
            unrealizedGainRate: 0.1,
            createdAt: '2024-01-13T00:00:00.000Z',
          },
        ],
        [
          'fund-002',
          {
            fundId: 'fund-002',
            date: '2024-01-13',
            totalUnits: 9000,
            remainingInvestment: 90000,
            currentValue: 99000,
            totalGain: 9000,
            unrealizedGainRate: 0.1,
            createdAt: '2024-01-13T00:00:00.000Z',
          },
        ],
      ]);

      const result = enrichPortfolioWithWeekOverWeek(
        basePortfolio,
        previousGlobalRecord,
        previousFundRecordsMap
      );

      // ポートフォリオ全体の前週比
      expect(result.remainingInvestmentChange?.difference).toBe(20000);
      expect(result.totalCurrentValueChange?.difference).toBe(22000);
      expect(result.totalUnrealizedGainChange).toBe(2000);
      expect(result.totalUnrealizedGainRateChange).toBe(0);
      expect(result.hasPreviousWeekData).toBe(true);

      // 各銘柄の前週比
      expect(result.holdings).toHaveLength(2);
      expect(result.holdings[0].hasPreviousWeekData).toBe(true);
      expect(result.holdings[1].hasPreviousWeekData).toBe(true);
    });

    it('前週の全体データが存在しない場合、全ての前週比がnullとなる', () => {
      // 前提: ポートフォリオは存在するが、前週のデータが存在しない
      // 事前条件: previousGlobalRecordがnull
      // 検証: ポートフォリオ全体および各銘柄の前週比がnullとなる
      const previousFundRecordsMap = new Map<string, PerformanceRecord>();

      const result = enrichPortfolioWithWeekOverWeek(basePortfolio, null, previousFundRecordsMap);

      expect(result.remainingInvestmentChange).toBeNull();
      expect(result.totalCurrentValueChange).toBeNull();
      expect(result.totalUnrealizedGainChange).toBeNull();
      expect(result.totalUnrealizedGainRateChange).toBeNull();
      expect(result.hasPreviousWeekData).toBe(false);

      // 各銘柄も前週データなし
      expect(result.holdings[0].hasPreviousWeekData).toBe(false);
      expect(result.holdings[1].hasPreviousWeekData).toBe(false);
    });

    it('一部の銘柄のみ前週データが存在する場合、存在する銘柄のみ前週比を計算する', () => {
      // 前提: 全体データは存在するが、fund-002の前週データのみ存在しない（新規銘柄）
      // 事前条件: fund-001の前週データは存在、fund-002の前週データは存在しない
      // 検証: fund-001は前週比あり、fund-002は前週比なし
      const previousGlobalRecord: PerformanceRecord = {
        fundId: '',
        date: '2024-01-13',
        totalUnits: 0,
        remainingInvestment: 180000,
        currentValue: 198000,
        totalGain: 18000,
        unrealizedGainRate: 0.1,
        createdAt: '2024-01-13T00:00:00.000Z',
      };

      // fund-001のみ前週データが存在
      const previousFundRecordsMap = new Map<string, PerformanceRecord>([
        [
          'fund-001',
          {
            fundId: 'fund-001',
            date: '2024-01-13',
            totalUnits: 9000,
            remainingInvestment: 90000,
            currentValue: 99000,
            totalGain: 9000,
            unrealizedGainRate: 0.1,
            createdAt: '2024-01-13T00:00:00.000Z',
          },
        ],
      ]);

      const result = enrichPortfolioWithWeekOverWeek(
        basePortfolio,
        previousGlobalRecord,
        previousFundRecordsMap
      );

      // 全体の前週比は計算される
      expect(result.hasPreviousWeekData).toBe(true);

      // fund-001は前週比あり
      expect(result.holdings[0].hasPreviousWeekData).toBe(true);
      expect(result.holdings[0].remainingInvestmentChange).not.toBeNull();

      // fund-002は前週比なし（新規銘柄）
      expect(result.holdings[1].hasPreviousWeekData).toBe(false);
      expect(result.holdings[1].remainingInvestmentChange).toBeNull();
    });
  });
});
