import { describe, expect, it } from 'vitest';
import { createNavRepository } from './NavRepository';
import { SHEET_NAMES } from '../Config';
import { createInMemorySheetRepository } from '../test/fakes';

describe('NavRepository', () => {
  it('Date型の日付をYYYY-MM-DDに変換する', () => {
    // 前提: dateがDateオブジェクトで渡される
    // 事前条件: navsシートにDate型の日付がある
    // 検証: 文字列の日付に変換される
    const date = new Date('2024-03-01T00:00:00.000Z');
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.NAV_RECORDS]: [
        ['fundId', 'date', 'value', 'createdAt'],
        ['fund-1', date, 12345, '2024-03-01T00:00:00.000Z'],
      ],
    });
    const repository = createNavRepository(sheetRepository);
    const result = repository.listByFundId('fund-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.date).toBe('2024-03-01');
    }
  });

  it('最新の基準価額が先頭に並ぶ', () => {
    // 前提: 異なる日付の基準価額が複数存在する
    // 事前条件: navsシートに2件以上のデータがある
    // 検証: 返却順が降順になる
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.NAV_RECORDS]: [
        ['fundId', 'date', 'value', 'createdAt'],
        ['fund-1', '2024-02-01', 12000, '2024-02-01T00:00:00.000Z'],
        ['fund-1', '2024-03-01', 13000, '2024-03-01T00:00:00.000Z'],
      ],
    });
    const repository = createNavRepository(sheetRepository);
    const result = repository.listByFundId('fund-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.date).toBe('2024-03-01');
    }
  });

  it('無効な日付の場合はエラーになる', () => {
    // 前提: dateが無効なDateオブジェクトである
    // 事前条件: navsシートに無効な日付がある
    // 検証: unexpectedエラーが返る
    const invalidDate = new Date('invalid');
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.NAV_RECORDS]: [
        ['fundId', 'date', 'value', 'createdAt'],
        ['fund-1', invalidDate, 12000, '2024-03-01T00:00:00.000Z'],
      ],
    });
    const repository = createNavRepository(sheetRepository);
    const result = repository.listByFundId('fund-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
    }
  });
});
