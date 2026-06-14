import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarketIndexService } from '../../src/service/MarketIndexService';
import { MARKET_DATA_HELPER_CELLS, MARKET_INDEX_TICKERS, SHEET_NAMES } from '../../src/Config';

/**
 * 市場指数サービス（GOOGLEFINANCE ヘルパーシート経由）のテスト。
 *
 * 検証対象:
 * - fetchLatestIndices: ヘルパーシートのセル値から S&P500 / NASDAQ の終値を読み取る
 * - ensureHelperSheet: GOOGLEFINANCE 数式の設定・余分な列の削除・シートの非表示化
 * - 異常系: ヘルパーシート未作成、セル値が数値でない／0以下
 *
 * 補足:
 * - 本サービスは SpreadsheetApp.getActiveSpreadsheet() を直接呼ぶため、
 *   テスト専用のフェイクスプレッドシート／フェイクシートで GAS API を再現する。
 * - フェイクは値を実際に保持し、setFormula / setValue / 列削除 / 非表示化を
 *   状態として記録する（NO-OP ではなく実挙動を持つ）。
 */
describe('MarketIndexService', () => {
  /**
   * ヘルパーシートのセル状態を表す内部型。
   * A1記法（例: 'A1'）をキーに、値または数式・記録を保持する。
   */
  type FakeCell = {
    value: unknown;
    formula: string | null;
  };

  /**
   * GAS の Sheet を模したフェイク。市場指数サービスが使用するメソッドのみ実装する。
   */
  type FakeHelperSheet = {
    /** A1記法のセルを取得する。 */
    getRange: (a1Notation: string) => {
      getValue: () => unknown;
      setFormula: (formula: string) => void;
      setValue: (value: unknown) => void;
    };
    getMaxColumns: () => number;
    deleteColumns: (columnPosition: number, howMany: number) => void;
    hideSheet: () => void;
    /** テスト検証用: 現在のセル状態を読み出す。 */
    readCell: (a1Notation: string) => FakeCell;
    /** テスト検証用: 非表示化されたかどうか。 */
    isHidden: () => boolean;
    /** テスト検証用: 現在の列数。 */
    columnCount: () => number;
  };

  /**
   * フェイクヘルパーシートを生成する。
   *
   * @param initialCells 初期セル値（A1記法→値）。GOOGLEFINANCE 結果の事前設定に使う。
   * @param maxColumns 初期列数（GAS 新規シートのデフォルト26列を模擬可能にする）。
   * @returns フェイクヘルパーシート
   */
  function createFakeHelperSheet(
    initialCells: Record<string, unknown> = {},
    maxColumns = 26
  ): FakeHelperSheet {
    const cells = new Map<string, FakeCell>();
    for (const [a1, value] of Object.entries(initialCells)) {
      cells.set(a1, { value, formula: null });
    }
    let columns = maxColumns;
    let hidden = false;

    const ensureCell = (a1: string): FakeCell => {
      const existing = cells.get(a1);
      if (existing) {
        return existing;
      }
      const created: FakeCell = { value: '', formula: null };
      cells.set(a1, created);
      return created;
    };

    return {
      getRange: (a1Notation: string) => ({
        getValue: () => ensureCell(a1Notation).value,
        setFormula: (formula: string) => {
          const cell = ensureCell(a1Notation);
          cell.formula = formula;
        },
        setValue: (value: unknown) => {
          const cell = ensureCell(a1Notation);
          cell.value = value;
        },
      }),
      getMaxColumns: () => columns,
      deleteColumns: (columnPosition: number, howMany: number) => {
        // 実挙動の近似: 列数を減らす（市場指数サービスは末尾列の削除のみ行う）
        if (columnPosition + howMany - 1 > columns) {
          throw new Error('削除対象の列が範囲外です。');
        }
        columns -= howMany;
      },
      hideSheet: () => {
        hidden = true;
      },
      readCell: (a1Notation: string) => ensureCell(a1Notation),
      isHidden: () => hidden,
      columnCount: () => columns,
    };
  }

  /**
   * フェイクスプレッドシートを生成し、SpreadsheetApp.getActiveSpreadsheet をスタブする。
   *
   * @param existingSheets 既存シート（シート名→フェイクシート）。
   * @returns insertSheet で新規作成されたシートを記録する追跡情報を含むフェイク
   */
  function setupFakeSpreadsheet(existingSheets: Record<string, FakeHelperSheet> = {}): {
    insertedSheetNames: string[];
    getSheet: (name: string) => FakeHelperSheet | undefined;
  } {
    const sheets = new Map<string, FakeHelperSheet>(Object.entries(existingSheets));
    const insertedSheetNames: string[] = [];

    const fakeSpreadsheet = {
      getSheetByName: (name: string) => sheets.get(name) ?? null,
      insertSheet: (name: string) => {
        const sheet = createFakeHelperSheet();
        sheets.set(name, sheet);
        insertedSheetNames.push(name);
        return sheet;
      },
    };

    vi.spyOn(globalThis.SpreadsheetApp, 'getActiveSpreadsheet').mockReturnValue(
      fakeSpreadsheet as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet
    );

    return {
      insertedSheetNames,
      getSheet: (name: string) => sheets.get(name),
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchLatestIndices', () => {
    it('ヘルパーシートのセル値からS&P500とNASDAQの終値を取得する', () => {
      // 前提: ヘルパーシートが存在し、A1=S&P500終値、B1=NASDAQ終値が数値で入っている
      // 検証: 両指数の終値が取得できる
      const helperSheet = createFakeHelperSheet({
        [MARKET_DATA_HELPER_CELLS.SP500_PRICE]: 4783.45,
        [MARKET_DATA_HELPER_CELLS.NASDAQ_PRICE]: 15055.65,
      });
      setupFakeSpreadsheet({ [SHEET_NAMES.MARKET_DATA_HELPER]: helperSheet });
      const service = createMarketIndexService();

      const result = service.fetchLatestIndices();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ sp500: 4783.45, nasdaq: 15055.65 });
      }
    });

    it('ヘルパーシートが存在しない場合は not_found エラーを返す', () => {
      // 前提: ヘルパーシートが未作成
      // 検証: not_found エラーが返り、ensureHelperSheet 実行を促すメッセージを含む
      setupFakeSpreadsheet();
      const service = createMarketIndexService();

      const result = service.fetchLatestIndices();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('not_found');
        expect(result.error.message).toContain('ensureHelperSheet');
      }
    });

    it('S&P500のセル値が数値でない場合（GOOGLEFINANCEのエラー値）は unexpected エラーを返す', () => {
      // 前提: A1 に GOOGLEFINANCE のエラー文字列 "#N/A" が入っている
      // 検証: unexpected エラーが返り、メッセージに S&P500 とセル値が含まれる
      const helperSheet = createFakeHelperSheet({
        [MARKET_DATA_HELPER_CELLS.SP500_PRICE]: '#N/A',
        [MARKET_DATA_HELPER_CELLS.NASDAQ_PRICE]: 15055.65,
      });
      setupFakeSpreadsheet({ [SHEET_NAMES.MARKET_DATA_HELPER]: helperSheet });
      const service = createMarketIndexService();

      const result = service.fetchLatestIndices();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('unexpected');
        expect(result.error.message).toContain('S&P500');
        expect(result.error.message).toContain('#N/A');
      }
    });

    it('NASDAQのセル値が0以下の場合は unexpected エラーを返す', () => {
      // 前提: B1 が 0（未取得・ロード中などの異常値）
      // 検証: unexpected エラーが返り、メッセージに NASDAQ が含まれる
      const helperSheet = createFakeHelperSheet({
        [MARKET_DATA_HELPER_CELLS.SP500_PRICE]: 4783.45,
        [MARKET_DATA_HELPER_CELLS.NASDAQ_PRICE]: 0,
      });
      setupFakeSpreadsheet({ [SHEET_NAMES.MARKET_DATA_HELPER]: helperSheet });
      const service = createMarketIndexService();

      const result = service.fetchLatestIndices();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('unexpected');
        expect(result.error.message).toContain('NASDAQ');
      }
    });
  });

  describe('ensureHelperSheet', () => {
    it('ヘルパーシートが存在しない場合は新規作成し、GOOGLEFINANCE数式を設定する', () => {
      // 前提: ヘルパーシートが未作成
      // 検証: シートが新規作成され、A1/B1 に各指数の GOOGLEFINANCE 数式が設定される
      //       A2/B2 に参照用ラベルが設定され、余分な列が削除され（2列に）、非表示化される
      const tracker = setupFakeSpreadsheet();
      const service = createMarketIndexService();

      const result = service.ensureHelperSheet();

      expect(result.success).toBe(true);
      expect(tracker.insertedSheetNames).toEqual([SHEET_NAMES.MARKET_DATA_HELPER]);

      const sheet = tracker.getSheet(SHEET_NAMES.MARKET_DATA_HELPER);
      expect(sheet).toBeDefined();
      if (sheet) {
        // GOOGLEFINANCE 数式にティッカーと "price" 指定が含まれること
        const sp500Formula = sheet.readCell(MARKET_DATA_HELPER_CELLS.SP500_PRICE).formula;
        const nasdaqFormula = sheet.readCell(MARKET_DATA_HELPER_CELLS.NASDAQ_PRICE).formula;
        expect(sp500Formula).toBe(`=GOOGLEFINANCE("${MARKET_INDEX_TICKERS.SP500}", "price")`);
        expect(nasdaqFormula).toBe(`=GOOGLEFINANCE("${MARKET_INDEX_TICKERS.NASDAQ}", "price")`);

        // 参照用ラベル
        expect(sheet.readCell('A2').value).toBe('S&P500');
        expect(sheet.readCell('B2').value).toBe('NASDAQ');

        // 26列 → 使用する2列まで削減され、非表示化されること
        expect(sheet.columnCount()).toBe(2);
        expect(sheet.isHidden()).toBe(true);
      }
    });

    it('ヘルパーシートが既に存在する場合は新規作成せず数式を再設定する', () => {
      // 前提: ヘルパーシートが既に存在する（列数は使用列ちょうどの2列）
      // 検証: insertSheet は呼ばれず、既存シートに数式が再設定される
      const existingSheet = createFakeHelperSheet({}, 2);
      const tracker = setupFakeSpreadsheet({
        [SHEET_NAMES.MARKET_DATA_HELPER]: existingSheet,
      });
      const service = createMarketIndexService();

      const result = service.ensureHelperSheet();

      expect(result.success).toBe(true);
      // 既存シートを再利用するため、新規作成は発生しない
      expect(tracker.insertedSheetNames).toEqual([]);
      expect(existingSheet.readCell(MARKET_DATA_HELPER_CELLS.SP500_PRICE).formula).toBe(
        `=GOOGLEFINANCE("${MARKET_INDEX_TICKERS.SP500}", "price")`
      );
      expect(existingSheet.isHidden()).toBe(true);
    });
  });
});
