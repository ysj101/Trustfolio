import { describe, expect, it } from 'vite-plus/test';
import { createPerformanceRepository } from '../../src/repository/PerformanceRepository';
import {
  PERFORMANCE_HEADERS,
  PERFORMANCE_SHEET_NAME,
  getPerformanceSheetName,
} from '../../src/Config';
import { createInMemorySheetRepository } from '../fakes';

describe('PerformanceRepository', () => {
  it('最新の実績は最後の行を取得する', () => {
    // 前提: 実績シートに複数行が存在する
    // 事前条件: 最終行が最新のデータである
    // 検証: 最終行が返る
    const sheetName = getPerformanceSheetName('fund-1');
    const sheetRepository = createInMemorySheetRepository({
      [sheetName]: [
        [...PERFORMANCE_HEADERS],
        ['fund-1', '2024-03-01', 10000, 10000, 10000, 0, 0, '2024-03-01T00:00:00.000Z'],
        ['fund-1', '2024-03-02', 10000, 10000, 11000, 1000, 0.1, '2024-03-02T00:00:00.000Z'],
      ],
    });
    const repository = createPerformanceRepository(sheetRepository);
    const result = repository.findLatestByFundId('fund-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value?.date).toBe('2024-03-02');
    }
  });

  it('全体実績の特定日データを取得する', () => {
    // 前提: 全体実績シートに該当日が存在する
    // 事前条件: PERFORMANCE_SHEET_NAMEにデータを用意する
    // 検証: 指定日付の実績が返る
    const sheetRepository = createInMemorySheetRepository({
      [PERFORMANCE_SHEET_NAME]: [
        [...PERFORMANCE_HEADERS],
        ['', '2024-03-05', 20000, 20000, 21000, 1000, 0.05, '2024-03-05T00:00:00.000Z'],
      ],
    });
    const repository = createPerformanceRepository(sheetRepository);
    const result = repository.findGlobalByDate('2024-03-05');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value?.currentValue).toBe(21000);
    }
  });
});
