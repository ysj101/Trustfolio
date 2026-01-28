import { MARKET_DATA_HELPER_CELLS, MARKET_INDEX_TICKERS, SHEET_NAMES } from '../Config';
import type { Result } from '../domain/types';

/**
 * 市場指数データ。
 * GOOGLEFINANCE関数から取得した終値を保持する。
 */
export type MarketIndexData = {
  /** S&P500指数終値 */
  sp500: number;
  /** NASDAQ Composite指数終値 */
  nasdaq: number;
};

/**
 * 市場指数サービス。
 * GOOGLEFINANCE関数を使用して市場指数データを取得する。
 */
export type MarketIndexService = {
  /**
   * S&P500およびNASDAQ Compositeの終値を取得する。
   * ヘルパーシート内のGOOGLEFINANCE関数の結果を読み取る。
   *
   * @returns 市場指数データ
   */
  fetchLatestIndices: () => Result<MarketIndexData>;

  /**
   * ヘルパーシートを初期化する。
   * GOOGLEFINANCE関数を設定したセルを作成する。
   *
   * @returns 成功時はvoid
   */
  ensureHelperSheet: () => Result<void>;
};

/**
 * 市場指数サービスを生成する。
 *
 * @returns 市場指数サービス
 */
export function createMarketIndexService(): MarketIndexService {
  return {
    fetchLatestIndices: (): Result<MarketIndexData> => {
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      const helperSheet = spreadsheet.getSheetByName(SHEET_NAMES.MARKET_DATA_HELPER);

      if (helperSheet === null) {
        return {
          success: false,
          error: {
            type: 'not_found',
            message: `ヘルパーシート「${SHEET_NAMES.MARKET_DATA_HELPER}」が存在しません。先にensureHelperSheet()を実行してください。`,
          },
        };
      }

      // S&P500の終値を取得
      const sp500Cell = helperSheet.getRange(MARKET_DATA_HELPER_CELLS.SP500_PRICE);
      const sp500Value: unknown = sp500Cell.getValue();
      if (typeof sp500Value !== 'number' || Number.isNaN(sp500Value) || sp500Value <= 0) {
        return {
          success: false,
          error: {
            type: 'unexpected',
            message: `S&P500の終値を取得できませんでした。セル値: ${String(sp500Value)}`,
          },
        };
      }

      // NASDAQの終値を取得
      const nasdaqCell = helperSheet.getRange(MARKET_DATA_HELPER_CELLS.NASDAQ_PRICE);
      const nasdaqValue: unknown = nasdaqCell.getValue();
      if (typeof nasdaqValue !== 'number' || Number.isNaN(nasdaqValue) || nasdaqValue <= 0) {
        return {
          success: false,
          error: {
            type: 'unexpected',
            message: `NASDAQの終値を取得できませんでした。セル値: ${String(nasdaqValue)}`,
          },
        };
      }

      return {
        success: true,
        value: {
          sp500: sp500Value,
          nasdaq: nasdaqValue,
        },
      };
    },

    ensureHelperSheet: (): Result<void> => {
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      const helperSheet =
        spreadsheet.getSheetByName(SHEET_NAMES.MARKET_DATA_HELPER) ??
        spreadsheet.insertSheet(SHEET_NAMES.MARKET_DATA_HELPER);

      // S&P500のGOOGLEFINANCE関数を設定
      // GOOGLEFINANCE(ticker, "price") で現在の価格（終値）を取得
      const sp500Formula = `=GOOGLEFINANCE("${MARKET_INDEX_TICKERS.SP500}", "price")`;
      helperSheet.getRange(MARKET_DATA_HELPER_CELLS.SP500_PRICE).setFormula(sp500Formula);

      // NASDAQのGOOGLEFINANCE関数を設定
      const nasdaqFormula = `=GOOGLEFINANCE("${MARKET_INDEX_TICKERS.NASDAQ}", "price")`;
      helperSheet.getRange(MARKET_DATA_HELPER_CELLS.NASDAQ_PRICE).setFormula(nasdaqFormula);

      // ヘッダー行を追加（参照用）
      helperSheet.getRange('A2').setValue('S&P500');
      helperSheet.getRange('B2').setValue('NASDAQ');

      // 使用列数（A列、B列の2列）
      const requiredColumns = 2;

      // 不要な空白列を削除する
      // 新規作成されたシートはデフォルトで26列あるため、使用しない列を削除
      const maxColumns = helperSheet.getMaxColumns();
      if (maxColumns > requiredColumns) {
        helperSheet.deleteColumns(requiredColumns + 1, maxColumns - requiredColumns);
      }

      // シートを非表示にする（ユーザーが誤って編集しないように）
      helperSheet.hideSheet();

      return { success: true, value: undefined };
    },
  };
}
