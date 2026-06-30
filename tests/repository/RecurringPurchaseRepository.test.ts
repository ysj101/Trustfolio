import { describe, expect, it } from 'vitest';
import { createRecurringPurchaseRepository } from '../../src/repository/RecurringPurchaseRepository';
import { SHEET_NAMES } from '../../src/Config';
import { createInMemorySheetRepository } from '../fakes';

describe('RecurringPurchaseRepository', () => {
  it('文字列のisActiveをbooleanに変換する', () => {
    // 前提: isActiveが文字列で保存されている
    // 事前条件: recurringシートにデータがある
    // 検証: trueとして取得できる
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.RECURRING]: [
        [
          'id',
          'fundId',
          'monthlyAmount',
          'executionDay',
          'startDate',
          'endDate',
          'isActive',
          'createdAt',
        ],
        ['rec-1', 'fund-1', 10000, 1, '2024-01-01', '', 'TRUE', '2024-01-01T00:00:00.000Z'],
      ],
    });
    const repository = createRecurringPurchaseRepository(sheetRepository);
    const result = repository.listAll();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.isActive).toBe(true);
    }
  });

  it('更新対象が存在しない場合はnot_foundになる', () => {
    // 前提: 更新対象のIDが存在しない
    // 事前条件: recurringシートにデータがない
    // 検証: not_foundエラーが返る
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.RECURRING]: [
        [
          'id',
          'fundId',
          'monthlyAmount',
          'executionDay',
          'startDate',
          'endDate',
          'isActive',
          'createdAt',
        ],
      ],
    });
    const repository = createRecurringPurchaseRepository(sheetRepository);
    const result = repository.updateRecurringPurchase({
      id: 'rec-1',
      fundId: 'fund-1',
      monthlyAmount: 10000,
      executionDay: 1,
      startDate: '2024-01-01',
      endDate: null,
      isActive: true,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('endDateがDate型の場合は文字列に変換する', () => {
    // 前提: endDateがDateオブジェクトで保存されている
    // 事前条件: recurringシートにDate型のendDateがある
    // 検証: YYYY-MM-DD形式で取得できる
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.RECURRING]: [
        [
          'id',
          'fundId',
          'monthlyAmount',
          'executionDay',
          'startDate',
          'endDate',
          'isActive',
          'createdAt',
        ],
        [
          'rec-2',
          'fund-2',
          10000,
          5,
          '2024-01-01',
          new Date('2024-06-01T00:00:00.000Z'),
          true,
          '2024-01-01T00:00:00.000Z',
        ],
      ],
    });
    const repository = createRecurringPurchaseRepository(sheetRepository);
    const result = repository.listAll();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.endDate).toBe('2024-06-01');
    }
  });

  it('executionDayが非整数（例: 15.5）の行は unexpected エラーを返す', () => {
    // 前提: recurringシートの executionDay 列に非整数 15.5 が保存されている
    //   （仕様は「1〜28の整数」。手動編集や不正データ混入を想定）
    // 事前条件: 非整数のまま約定日計算へ流れると formatIsoDate が不正な日付文字列を生むため、
    //   読み取り段階で fail fast に弾く必要がある（#133）。
    // 検証: listAll が unexpected エラーを返し、メッセージに executionDay が含まれる
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.RECURRING]: [
        [
          'id',
          'fundId',
          'monthlyAmount',
          'executionDay',
          'startDate',
          'endDate',
          'isActive',
          'createdAt',
        ],
        ['rec-1', 'fund-1', 10000, 15.5, '2024-01-01', '', 'TRUE', '2024-01-01T00:00:00.000Z'],
      ],
    });
    const repository = createRecurringPurchaseRepository(sheetRepository);
    const result = repository.listAll();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('executionDay');
    }
  });

  it('executionDayが範囲外の整数（例: 99）の行は unexpected エラーを返す', () => {
    // 前提: recurringシートの executionDay 列に範囲外の整数 99 が保存されている
    //   （仕様は「1〜28の整数」。手動編集等による範囲外データ混入を想定）
    // 事前条件: 範囲外整数のまま約定日計算へ流れると formatIsoDate が "2026-06-99" のような
    //   不正な日付文字列を生み、営業日カレンダーの辞書順比較で誤った結果を招くため、
    //   読み取り段階で整数判定だけでなく範囲(1〜28)判定でも弾く必要がある（#133 レビュー指摘）。
    // 検証: listAll が unexpected エラーを返し、メッセージに executionDay が含まれる
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.RECURRING]: [
        [
          'id',
          'fundId',
          'monthlyAmount',
          'executionDay',
          'startDate',
          'endDate',
          'isActive',
          'createdAt',
        ],
        ['rec-1', 'fund-1', 10000, 99, '2024-01-01', '', 'TRUE', '2024-01-01T00:00:00.000Z'],
      ],
    });
    const repository = createRecurringPurchaseRepository(sheetRepository);
    const result = repository.listAll();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('executionDay');
    }
  });
});
