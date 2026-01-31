import { describe, expect, it } from 'vitest';
import { createMarketIndexAlertUseCase } from '../../src/usecase/MarketIndexAlertUseCase';
import type { MarketIndexRepository } from '../../src/repository/MarketIndexRepository';
import type { MarketIndex } from '../../src/domain/types';
import { ok, fail } from '../fakes';

describe('MarketIndexAlertUseCase', () => {
  /**
   * テスト用の市場指数リポジトリを作成するヘルパー関数。
   *
   * @param records 市場指数データの配列（日付降順でソートされる）
   * @returns モックされたMarketIndexRepository
   */
  function createMockRepository(records: MarketIndex[]): MarketIndexRepository {
    return {
      findByDate: (date: string) => {
        const record = records.find((r) => r.date === date);
        return ok(record ?? null);
      },
      listAll: () => {
        // 日付降順でソート
        const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));
        return ok(sorted);
      },
      create: () => ok(undefined),
      highlightAlertCell: () => ok(undefined),
    };
  }

  describe('checkAlert', () => {
    it('S&P500が-5%以上下落した場合、アラートがトリガーされる', () => {
      // 前提: S&P500が前週比-6%下落（5000 → 4700）、NASDAQは-2%下落
      // 検証: isAlertTriggered=true、sp500.isTriggered=true、nasdaq.isTriggered=false
      const records: MarketIndex[] = [
        { date: '2024-01-20', sp500: 4700, nasdaq: 14700, createdAt: '2024-01-20T00:00:00Z' },
        { date: '2024-01-13', sp500: 5000, nasdaq: 15000, createdAt: '2024-01-13T00:00:00Z' },
      ];

      const repository = createMockRepository(records);
      const useCase = createMarketIndexAlertUseCase(repository);
      const result = useCase.checkAlert();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isAlertTriggered).toBe(true);
        expect(result.value.sp500?.isTriggered).toBe(true);
        expect(result.value.sp500?.changeRate).toBe(-6);
        expect(result.value.nasdaq?.isTriggered).toBe(false);
        expect(result.value.nasdaq?.changeRate).toBe(-2);
        expect(result.value.alertDate).toBe('2024-01-20');
        expect(result.value.comparisonDate).toBe('2024-01-13');
      }
    });

    it('NASDAQが-5%以上下落した場合、アラートがトリガーされる', () => {
      // 前提: S&P500は-1%下落、NASDAQが前週比-7%下落（15000 → 13950）
      // 検証: isAlertTriggered=true、sp500.isTriggered=false、nasdaq.isTriggered=true
      const records: MarketIndex[] = [
        { date: '2024-01-20', sp500: 4950, nasdaq: 13950, createdAt: '2024-01-20T00:00:00Z' },
        { date: '2024-01-13', sp500: 5000, nasdaq: 15000, createdAt: '2024-01-13T00:00:00Z' },
      ];

      const repository = createMockRepository(records);
      const useCase = createMarketIndexAlertUseCase(repository);
      const result = useCase.checkAlert();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isAlertTriggered).toBe(true);
        expect(result.value.sp500?.isTriggered).toBe(false);
        expect(result.value.nasdaq?.isTriggered).toBe(true);
        expect(result.value.nasdaq?.changeRate).toBe(-7);
      }
    });

    it('S&P500とNASDAQの両方が-5%以上下落した場合、両方のアラートがトリガーされる', () => {
      // 前提: S&P500が-8%下落、NASDAQが-10%下落
      // 検証: isAlertTriggered=true、両方のisTriggered=true
      const records: MarketIndex[] = [
        { date: '2024-01-20', sp500: 4600, nasdaq: 13500, createdAt: '2024-01-20T00:00:00Z' },
        { date: '2024-01-13', sp500: 5000, nasdaq: 15000, createdAt: '2024-01-13T00:00:00Z' },
      ];

      const repository = createMockRepository(records);
      const useCase = createMarketIndexAlertUseCase(repository);
      const result = useCase.checkAlert();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isAlertTriggered).toBe(true);
        expect(result.value.sp500?.isTriggered).toBe(true);
        expect(result.value.nasdaq?.isTriggered).toBe(true);
      }
    });

    it('-5%未満の下落ではアラートがトリガーされない', () => {
      // 前提: S&P500が-3%下落、NASDAQが-2%下落
      // 検証: isAlertTriggered=false
      const records: MarketIndex[] = [
        { date: '2024-01-20', sp500: 4850, nasdaq: 14700, createdAt: '2024-01-20T00:00:00Z' },
        { date: '2024-01-13', sp500: 5000, nasdaq: 15000, createdAt: '2024-01-13T00:00:00Z' },
      ];

      const repository = createMockRepository(records);
      const useCase = createMarketIndexAlertUseCase(repository);
      const result = useCase.checkAlert();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isAlertTriggered).toBe(false);
        expect(result.value.sp500?.isTriggered).toBe(false);
        expect(result.value.nasdaq?.isTriggered).toBe(false);
      }
    });

    it('上昇相場ではアラートがトリガーされない', () => {
      // 前提: S&P500が+5%上昇、NASDAQが+3%上昇
      // 検証: isAlertTriggered=false
      const records: MarketIndex[] = [
        { date: '2024-01-20', sp500: 5250, nasdaq: 15450, createdAt: '2024-01-20T00:00:00Z' },
        { date: '2024-01-13', sp500: 5000, nasdaq: 15000, createdAt: '2024-01-13T00:00:00Z' },
      ];

      const repository = createMockRepository(records);
      const useCase = createMarketIndexAlertUseCase(repository);
      const result = useCase.checkAlert();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isAlertTriggered).toBe(false);
        expect(result.value.sp500?.changeRate).toBe(5);
        expect(result.value.nasdaq?.changeRate).toBe(3);
      }
    });

    describe('境界値テスト', () => {
      it('-4.99%の下落ではアラートがトリガーされない', () => {
        // 前提: S&P500が-4.99%下落（5000 → 4750.5）
        // 検証: isTriggered=false（-5.0%以下でないため）
        const records: MarketIndex[] = [
          { date: '2024-01-20', sp500: 4750.5, nasdaq: 15000, createdAt: '2024-01-20T00:00:00Z' },
          { date: '2024-01-13', sp500: 5000, nasdaq: 15000, createdAt: '2024-01-13T00:00:00Z' },
        ];

        const repository = createMockRepository(records);
        const useCase = createMarketIndexAlertUseCase(repository);
        const result = useCase.checkAlert();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.isAlertTriggered).toBe(false);
          expect(result.value.sp500?.isTriggered).toBe(false);
          expect(result.value.sp500?.changeRate).toBe(-4.99);
        }
      });

      it('-5.0%の下落ではアラートがトリガーされる', () => {
        // 前提: S&P500がちょうど-5.0%下落（5000 → 4750）
        // 検証: isTriggered=true（-5.0%以下のため）
        const records: MarketIndex[] = [
          { date: '2024-01-20', sp500: 4750, nasdaq: 15000, createdAt: '2024-01-20T00:00:00Z' },
          { date: '2024-01-13', sp500: 5000, nasdaq: 15000, createdAt: '2024-01-13T00:00:00Z' },
        ];

        const repository = createMockRepository(records);
        const useCase = createMarketIndexAlertUseCase(repository);
        const result = useCase.checkAlert();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.isAlertTriggered).toBe(true);
          expect(result.value.sp500?.isTriggered).toBe(true);
          expect(result.value.sp500?.changeRate).toBe(-5);
        }
      });

      it('-5.01%の下落ではアラートがトリガーされる', () => {
        // 前提: S&P500が-5.01%下落（5000 → 4749.5）
        // 検証: isTriggered=true
        const records: MarketIndex[] = [
          { date: '2024-01-20', sp500: 4749.5, nasdaq: 15000, createdAt: '2024-01-20T00:00:00Z' },
          { date: '2024-01-13', sp500: 5000, nasdaq: 15000, createdAt: '2024-01-13T00:00:00Z' },
        ];

        const repository = createMockRepository(records);
        const useCase = createMarketIndexAlertUseCase(repository);
        const result = useCase.checkAlert();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.isAlertTriggered).toBe(true);
          expect(result.value.sp500?.isTriggered).toBe(true);
          expect(result.value.sp500?.changeRate).toBe(-5.01);
        }
      });
    });

    describe('前週データ検索', () => {
      it('7日前のデータが存在しない場合、6日前のデータを使用する', () => {
        // 前提: 7日前（1/13）のデータがなく、6日前（1/14）のデータがある
        // 検証: 6日前のデータと比較される
        const records: MarketIndex[] = [
          { date: '2024-01-20', sp500: 4700, nasdaq: 14000, createdAt: '2024-01-20T00:00:00Z' },
          { date: '2024-01-14', sp500: 5000, nasdaq: 15000, createdAt: '2024-01-14T00:00:00Z' },
        ];

        const repository = createMockRepository(records);
        const useCase = createMarketIndexAlertUseCase(repository);
        const result = useCase.checkAlert();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.comparisonDate).toBe('2024-01-14');
          expect(result.value.isAlertTriggered).toBe(true);
        }
      });

      it('7日前と6日前のデータが存在しない場合、8日前のデータを使用する', () => {
        // 前提: 7日前と6日前のデータがなく、8日前（1/12）のデータがある
        // 検証: 8日前のデータと比較される
        const records: MarketIndex[] = [
          { date: '2024-01-20', sp500: 4700, nasdaq: 14000, createdAt: '2024-01-20T00:00:00Z' },
          { date: '2024-01-12', sp500: 5000, nasdaq: 15000, createdAt: '2024-01-12T00:00:00Z' },
        ];

        const repository = createMockRepository(records);
        const useCase = createMarketIndexAlertUseCase(repository);
        const result = useCase.checkAlert();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.comparisonDate).toBe('2024-01-12');
        }
      });

      it('±2日の範囲内に前週データが存在しない場合、エラーを返す', () => {
        // 前提: 最新データのみ存在し、前週データがない
        // 検証: not_foundエラーが返る
        const records: MarketIndex[] = [
          { date: '2024-01-20', sp500: 4700, nasdaq: 14000, createdAt: '2024-01-20T00:00:00Z' },
        ];

        const repository = createMockRepository(records);
        const useCase = createMarketIndexAlertUseCase(repository);
        const result = useCase.checkAlert();

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('not_found');
          expect(result.error.message).toContain('前週');
        }
      });
    });

    describe('エラーハンドリング', () => {
      it('市場指数データが空の場合、エラーを返す', () => {
        // 前提: シートにデータが存在しない
        // 検証: not_foundエラーが返る
        const repository = createMockRepository([]);
        const useCase = createMarketIndexAlertUseCase(repository);
        const result = useCase.checkAlert();

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('not_found');
          expect(result.error.message).toContain('市場指数データが存在しません');
        }
      });

      it('リポジトリでエラーが発生した場合、エラーを伝播する', () => {
        // 前提: listAllがエラーを返す
        // 検証: エラーがそのまま返る
        const repository: MarketIndexRepository = {
          findByDate: () => ok(null),
          listAll: () => fail('unexpected', 'シートの読み取りに失敗しました'),
          create: () => ok(undefined),
          highlightAlertCell: () => ok(undefined),
        };

        const useCase = createMarketIndexAlertUseCase(repository);
        const result = useCase.checkAlert();

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.type).toBe('unexpected');
          expect(result.error.message).toBe('シートの読み取りに失敗しました');
        }
      });
    });
  });
});
