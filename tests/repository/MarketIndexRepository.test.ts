import { describe, expect, it, vi } from 'vitest';
import { createMarketIndexRepository } from '../../src/repository/MarketIndexRepository';
import { SHEET_NAMES } from '../../src/Config';
import type { MarketIndex } from '../../src/domain/types';
import { createInMemorySheetRepository, createStubSheetRepository, ok } from '../fakes';

/**
 * 市場指数リポジトリ（_market_indices シート）のテスト。
 *
 * 検証対象:
 * - findByDate: 指定日付の市場指数を取得（存在しなければ null）
 * - listAll: 全件を日付降順で取得
 * - create: 1件追記
 * - highlightAlertCell: 指定日付・指定列のセル背景色をアラート色に設定
 * - 異常系: 行データの型不正でパースエラー、シート読み取り失敗の伝播
 *
 * 前提: _market_indices シートのヘッダーは [date, sp500, nasdaq, createdAt]。
 */
describe('MarketIndexRepository', () => {
  /**
   * 正常系のテストで再利用する市場指数データ（2営業日分）。
   * S&P500 と NASDAQ Composite の終値を保持する。
   */
  const sp500FridayValue = 5000;
  const nasdaqFridayValue = 15000;

  describe('findByDate', () => {
    it('指定日付の市場指数データを取得する', () => {
      // 前提: _market_indices シートに2024-01-19の行が存在する
      // 検証: 指定日付のレコードが date / sp500 / nasdaq / createdAt まで一致して返る
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.MARKET_INDICES]: [
          ['date', 'sp500', 'nasdaq', 'createdAt'],
          ['2024-01-19', sp500FridayValue, nasdaqFridayValue, '2024-01-20T00:00:00.000Z'],
        ],
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const result = repository.findByDate('2024-01-19');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({
          date: '2024-01-19',
          sp500: sp500FridayValue,
          nasdaq: nasdaqFridayValue,
          createdAt: '2024-01-20T00:00:00.000Z',
        });
      }
    });

    it('指定日付のデータが存在しない場合は null を返す', () => {
      // 前提: シートには2024-01-19の行しか存在しない
      // 検証: 別日付（2024-01-18）を指定すると null が返る（エラーではない）
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.MARKET_INDICES]: [
          ['date', 'sp500', 'nasdaq', 'createdAt'],
          ['2024-01-19', sp500FridayValue, nasdaqFridayValue, '2024-01-20T00:00:00.000Z'],
        ],
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const result = repository.findByDate('2024-01-18');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeNull();
      }
    });

    it('Date型で格納された日付も文字列日付として比較できる', () => {
      // 前提: date 列が文字列ではなく Date オブジェクトで格納されている
      // 検証: YYYY-MM-DD に変換した上で一致判定され、レコードが取得できる
      const dateAsObject = new Date('2024-01-19T00:00:00.000Z');
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.MARKET_INDICES]: [
          ['date', 'sp500', 'nasdaq', 'createdAt'],
          [dateAsObject, sp500FridayValue, nasdaqFridayValue, '2024-01-20T00:00:00.000Z'],
        ],
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const result = repository.findByDate('2024-01-19');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value?.date).toBe('2024-01-19');
        expect(result.value?.sp500).toBe(sp500FridayValue);
      }
    });
  });

  describe('listAll', () => {
    it('全ての市場指数データを日付の降順で取得する', () => {
      // 前提: 3営業日分のデータが日付の昇順でシートに並んでいる
      // 検証: 返却配列が日付の降順（新しい順）に並び替えられている
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.MARKET_INDICES]: [
          ['date', 'sp500', 'nasdaq', 'createdAt'],
          ['2024-01-17', 4900, 14800, '2024-01-18T00:00:00.000Z'],
          ['2024-01-18', 4950, 14900, '2024-01-19T00:00:00.000Z'],
          ['2024-01-19', sp500FridayValue, nasdaqFridayValue, '2024-01-20T00:00:00.000Z'],
        ],
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const result = repository.listAll();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.map((record) => record.date)).toEqual([
          '2024-01-19',
          '2024-01-18',
          '2024-01-17',
        ]);
      }
    });

    it('データが存在しない場合は空配列を返す', () => {
      // 前提: シートはヘッダー行のみでデータ行が無い
      // 検証: 空配列が返る
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.MARKET_INDICES]: [['date', 'sp500', 'nasdaq', 'createdAt']],
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const result = repository.listAll();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('create', () => {
    it('市場指数データを1件追記する', () => {
      // 前提: ヘッダーのみのシートに新規レコードを追記する
      // 検証: 追記後に listAll で同じ内容が取得できる
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.MARKET_INDICES]: [['date', 'sp500', 'nasdaq', 'createdAt']],
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const newRecord: MarketIndex = {
        date: '2024-01-22',
        sp500: 5050,
        nasdaq: 15200,
        createdAt: '2024-01-23T00:00:00.000Z',
      };
      const createResult = repository.create(newRecord);
      expect(createResult.success).toBe(true);

      const listResult = repository.listAll();
      expect(listResult.success).toBe(true);
      if (listResult.success) {
        expect(listResult.value).toEqual([newRecord]);
      }
    });
  });

  describe('highlightAlertCell', () => {
    it('指定日付・指定列のセル背景色をアラート色（赤）に設定する', () => {
      // 前提: 2行のデータがあり、2行目（2024-01-19）のsp500列をハイライト対象とする
      // 検証: シート上の正しい行・列（date=1始まりで sp500=2列目、ヘッダー込みで行番号+2）
      //       に対して赤系の背景色 #FFCDD2 が設定される
      const dataRows = [
        ['2024-01-18', 4950, 14900, '2024-01-19T00:00:00.000Z'],
        ['2024-01-19', sp500FridayValue, nasdaqFridayValue, '2024-01-20T00:00:00.000Z'],
      ];

      // setBackground の呼び出し引数を記録するためのフェイクシート。
      const setBackground = vi.fn();
      const getRange = vi.fn(() => ({ setBackground }));
      const fakeSheet = { getRange } as unknown as GoogleAppsScript.Spreadsheet.Sheet;

      const sheetRepository = createStubSheetRepository({
        getRequiredSheet: () => ok(fakeSheet),
        readAllRows: () => ok(dataRows),
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const result = repository.highlightAlertCell('2024-01-19', 'sp500');

      expect(result.success).toBe(true);
      // 2024-01-19 はデータ2行目（index=1）→ ヘッダー込みでシート行番号3
      // sp500 は列番号2
      expect(getRange).toHaveBeenCalledWith(3, 2);
      expect(setBackground).toHaveBeenCalledWith('#FFCDD2');
    });

    it('nasdaq列を指定すると列番号3が対象になる', () => {
      // 前提: 1行のデータがあり、その nasdaq 列をハイライト対象とする
      // 検証: 列番号3（nasdaq）に対して背景色が設定される
      const dataRows = [
        ['2024-01-19', sp500FridayValue, nasdaqFridayValue, '2024-01-20T00:00:00.000Z'],
      ];

      const setBackground = vi.fn();
      const getRange = vi.fn(() => ({ setBackground }));
      const fakeSheet = { getRange } as unknown as GoogleAppsScript.Spreadsheet.Sheet;

      const sheetRepository = createStubSheetRepository({
        getRequiredSheet: () => ok(fakeSheet),
        readAllRows: () => ok(dataRows),
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const result = repository.highlightAlertCell('2024-01-19', 'nasdaq');

      expect(result.success).toBe(true);
      // 2024-01-19 はデータ1行目（index=0）→ シート行番号2、nasdaq は列番号3
      expect(getRange).toHaveBeenCalledWith(2, 3);
      expect(setBackground).toHaveBeenCalledWith('#FFCDD2');
    });

    it('指定日付の行が存在しない場合は not_found エラーを返す', () => {
      // 前提: シートには2024-01-19の行しか存在しない
      // 検証: 別日付を指定すると not_found エラーが返り、背景色は設定されない
      const dataRows = [
        ['2024-01-19', sp500FridayValue, nasdaqFridayValue, '2024-01-20T00:00:00.000Z'],
      ];

      const setBackground = vi.fn();
      const getRange = vi.fn(() => ({ setBackground }));
      const fakeSheet = { getRange } as unknown as GoogleAppsScript.Spreadsheet.Sheet;

      const sheetRepository = createStubSheetRepository({
        getRequiredSheet: () => ok(fakeSheet),
        readAllRows: () => ok(dataRows),
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const result = repository.highlightAlertCell('2024-01-18', 'sp500');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('not_found');
        expect(result.error.message).toContain('2024-01-18');
      }
      expect(setBackground).not.toHaveBeenCalled();
    });
  });

  describe('異常系（行データのパース）', () => {
    it('sp500が数値でない行が含まれる場合はパースエラーを返す', () => {
      // 前提: sp500 列に文字列 "#N/A"（GOOGLEFINANCE のエラー値を模擬）が混入している
      // 検証: listAll が unexpected エラーを返し、メッセージに該当列名が含まれる
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.MARKET_INDICES]: [
          ['date', 'sp500', 'nasdaq', 'createdAt'],
          ['2024-01-19', '#N/A', nasdaqFridayValue, '2024-01-20T00:00:00.000Z'],
        ],
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const result = repository.listAll();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('unexpected');
        expect(result.error.message).toContain('sp500');
      }
    });

    it('createdAtが空文字の行が含まれる場合はパースエラーを返す', () => {
      // 前提: createdAt 列が空文字になっている
      // 検証: findByDate が unexpected エラーを返し、メッセージに createdAt が含まれる
      const sheetRepository = createInMemorySheetRepository({
        [SHEET_NAMES.MARKET_INDICES]: [
          ['date', 'sp500', 'nasdaq', 'createdAt'],
          ['2024-01-19', sp500FridayValue, nasdaqFridayValue, ''],
        ],
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const result = repository.findByDate('2024-01-19');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('unexpected');
        expect(result.error.message).toContain('createdAt');
      }
    });

    it('シートの読み取りに失敗した場合はそのエラーを伝播する', () => {
      // 前提: SheetRepository.readAllRows がエラーを返す（シート未作成など）
      // 検証: listAll がそのエラーをそのまま伝播する
      const sheetRepository = createStubSheetRepository({
        readAllRows: () => ({
          success: false,
          error: { type: 'unexpected', message: 'シートが存在しません: _market_indices' },
        }),
      });
      const repository = createMarketIndexRepository(sheetRepository);

      const result = repository.listAll();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('unexpected');
        expect(result.error.message).toBe('シートが存在しません: _market_indices');
      }
    });
  });
});
