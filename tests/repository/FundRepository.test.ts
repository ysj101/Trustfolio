import { describe, expect, it } from 'vitest';
import { createFundRepository } from '../../src/repository/FundRepository';
import { SHEET_NAMES } from '../../src/Config';
import { createInMemorySheetRepository } from '../fakes';

describe('FundRepository', () => {
  it('文字列のsettlementBusinessDaysを数値に変換する', () => {
    // 前提: settlementBusinessDaysが文字列で保存されている
    // 事前条件: fundsシートに1件のデータがある
    // 検証: 数値として取得できる
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        ['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'createdAt'],
        ['fund-1', '日本株ファンド', 'ABCD1234EFGH', '3', '2024-01-01T00:00:00.000Z'],
      ],
    });
    const repository = createFundRepository(sheetRepository);
    const result = repository.listFunds();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]?.settlementBusinessDays).toBe(3);
    }
  });

  it('不正なsettlementBusinessDaysの場合はエラーになる', () => {
    // 前提: settlementBusinessDaysが不正な文字列である
    // 事前条件: fundsシートに不正データがある
    // 検証: unexpectedエラーが返る
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [
        ['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'createdAt'],
        ['fund-1', '日本株ファンド', 'ABCD1234EFGH', '不正値', '2024-01-01T00:00:00.000Z'],
      ],
    });
    const repository = createFundRepository(sheetRepository);
    const result = repository.listFunds();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
    }
  });

  it('更新対象が存在しない場合はnot_foundになる', () => {
    // 前提: 更新対象のIDが存在しない
    // 事前条件: fundsシートにデータがない
    // 検証: not_foundエラーが返る
    const sheetRepository = createInMemorySheetRepository({
      [SHEET_NAMES.FUNDS]: [['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'createdAt']],
    });
    const repository = createFundRepository(sheetRepository);
    const result = repository.updateFund({
      id: 'fund-1',
      name: '日本株ファンド',
      rakutenFundId: null,
      settlementBusinessDays: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });
});
