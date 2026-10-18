import { describe, expect, it } from 'vite-plus/test';
import { createNavRepository } from '../../src/repository/NavRepository';
import { SHEET_NAMES } from '../../src/Config';
import { createInMemorySheetRepository } from '../fakes';

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

  describe('findLatestByFundIds', () => {
    it('複数のファンドIDに対する最新の基準価額を取得する', () => {
      // 前提: 複数のファンドに対して基準価額が存在する
      // 事前条件: navsシートに複数ファンドのデータがある
      // 検証: 各ファンドの最新NAVがMapで返される
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.NAV_RECORDS]: [
          ['fundId', 'date', 'value', 'createdAt'],
          ['三菱UFJ国際投信-eMAXIS', '2024-02-01', 12000, '2024-02-01T00:00:00.000Z'],
          ['三菱UFJ国際投信-eMAXIS', '2024-03-01', 13000, '2024-03-01T00:00:00.000Z'],
          ['野村アセット-NASDAQ100', '2024-02-15', 25000, '2024-02-15T00:00:00.000Z'],
          ['野村アセット-NASDAQ100', '2024-03-15', 26000, '2024-03-15T00:00:00.000Z'],
        ],
      });
      const repository = createNavRepository(sheetRepository);
      const result = repository.findLatestByFundIds([
        '三菱UFJ国際投信-eMAXIS',
        '野村アセット-NASDAQ100',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        const navMap = result.value;
        expect(navMap.size).toBe(2);

        const emaxisNav = navMap.get('三菱UFJ国際投信-eMAXIS');
        expect(emaxisNav?.date).toBe('2024-03-01');
        expect(emaxisNav?.value).toBe(13000);

        const nasdaqNav = navMap.get('野村アセット-NASDAQ100');
        expect(nasdaqNav?.date).toBe('2024-03-15');
        expect(nasdaqNav?.value).toBe(26000);
      }
    });

    it('基準価額が存在しないファンドにはnullを設定する', () => {
      // 前提: 一部のファンドに基準価額が存在しない
      // 事前条件: navsシートに一部のファンドのデータのみ存在
      // 検証: 存在しないファンドにはnullが設定される
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.NAV_RECORDS]: [
          ['fundId', 'date', 'value', 'createdAt'],
          ['三菱UFJ国際投信-eMAXIS', '2024-03-01', 13000, '2024-03-01T00:00:00.000Z'],
        ],
      });
      const repository = createNavRepository(sheetRepository);
      const result = repository.findLatestByFundIds([
        '三菱UFJ国際投信-eMAXIS',
        '野村アセット-NASDAQ100',
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        const navMap = result.value;
        expect(navMap.size).toBe(2);

        const emaxisNav = navMap.get('三菱UFJ国際投信-eMAXIS');
        expect(emaxisNav?.value).toBe(13000);

        const nasdaqNav = navMap.get('野村アセット-NASDAQ100');
        expect(nasdaqNav).toBeNull();
      }
    });

    it('空のファンドID配列を渡すと空のMapを返す', () => {
      // 前提: ファンドIDが空配列である
      // 事前条件: navsシートにデータがある
      // 検証: 空のMapが返される
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.NAV_RECORDS]: [
          ['fundId', 'date', 'value', 'createdAt'],
          ['三菱UFJ国際投信-eMAXIS', '2024-03-01', 13000, '2024-03-01T00:00:00.000Z'],
        ],
      });
      const repository = createNavRepository(sheetRepository);
      const result = repository.findLatestByFundIds([]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.size).toBe(0);
      }
    });

    it('Date型の日付でも正しく最新を判定する', () => {
      // 前提: シートからDate型で日付が返される
      // 事前条件: navsシートにDate型の日付がある
      // 検証: 最新の日付のNAVが返される
      const olderDate = new Date('2024-02-01T00:00:00.000Z');
      const newerDate = new Date('2024-03-01T00:00:00.000Z');
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.NAV_RECORDS]: [
          ['fundId', 'date', 'value', 'createdAt'],
          ['三菱UFJ国際投信-eMAXIS', olderDate, 12000, '2024-02-01T00:00:00.000Z'],
          ['三菱UFJ国際投信-eMAXIS', newerDate, 13000, '2024-03-01T00:00:00.000Z'],
        ],
      });
      const repository = createNavRepository(sheetRepository);
      const result = repository.findLatestByFundIds(['三菱UFJ国際投信-eMAXIS']);

      expect(result.success).toBe(true);
      if (result.success) {
        const navMap = result.value;
        const emaxisNav = navMap.get('三菱UFJ国際投信-eMAXIS');
        expect(emaxisNav?.date).toBe('2024-03-01');
        expect(emaxisNav?.value).toBe(13000);
      }
    });
  });
});
