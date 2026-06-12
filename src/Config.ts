/**
 * GAS移行版のスプレッドシート設定を定義する。
 * ここで定義したシート名・ヘッダーを唯一の正とする。
 */
export const SHEET_NAMES = {
  FUNDS: '_funds',
  NAV_RECORDS: '_nav_records',
  TRANSACTIONS: '_transactions',
  RECURRING: '_recurring',
  MARKET_INDICES: '_market_indices',
  MARKET_DATA_HELPER: '_market_data_helper',
} as const;

/**
 * シートのヘッダー定義。
 * ヘッダーの順序が壊れている場合は即座に失敗させる。
 */
export const SHEET_HEADERS = {
  [SHEET_NAMES.FUNDS]: ['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'createdAt'],
  [SHEET_NAMES.NAV_RECORDS]: ['fundId', 'date', 'value', 'createdAt'],
  [SHEET_NAMES.TRANSACTIONS]: [
    'id',
    'fundId',
    'type',
    'date',
    'amount',
    'navValue',
    'units',
    'recurringPurchaseId',
    'idempotencyKey',
    'createdAt',
  ],
  [SHEET_NAMES.RECURRING]: [
    'id',
    'fundId',
    'monthlyAmount',
    'executionDay',
    'startDate',
    'endDate',
    'isActive',
    'createdAt',
  ],
  [SHEET_NAMES.MARKET_INDICES]: ['date', 'sp500', 'nasdaq', 'createdAt'],
} as const;

export type SheetName = (typeof SHEET_NAMES)[keyof typeof SHEET_NAMES];

/**
 * ファンド別取引シート名（例: `_tx_001`）の型。
 * {@link getTransactionSheetName} が生成する動的シート名を表す。
 */
export type TransactionSheetName = `${typeof SHEET_NAME_PREFIXES.TRANSACTIONS}${string}`;

/**
 * ファンド別実績シート名（例: `_perf_001`）の型。
 * {@link getPerformanceSheetName} が生成する動的シート名を表す。
 */
export type PerformanceSheetName = `${typeof SHEET_NAME_PREFIXES.PERFORMANCE}${string}`;

/**
 * `ensureSheet` に渡しうる全てのシート名。
 * 静的シート名（{@link SheetName}）に加え、ファンド別の動的シート名
 * （{@link TransactionSheetName} / {@link PerformanceSheetName}）と
 * 全体実績シート名（{@link PERFORMANCE_SHEET_NAME}）を含む。
 * 動的シート名を扱う箇所で `as never` キャストを不要にするために導入している。
 */
export type AnySheetName =
  | SheetName
  | TransactionSheetName
  | PerformanceSheetName
  | typeof PERFORMANCE_SHEET_NAME;

export type SheetDefinition = {
  name: AnySheetName;
  headers: readonly string[];
};

/**
 * 初期化対象となるシート定義一覧。
 * 注: _transactionsシートは削除済み。取引データは_tx_{fundId末尾3文字}に記録される。
 */
export const SHEET_DEFINITIONS: readonly SheetDefinition[] = [
  { name: SHEET_NAMES.FUNDS, headers: SHEET_HEADERS[SHEET_NAMES.FUNDS] },
  { name: SHEET_NAMES.NAV_RECORDS, headers: SHEET_HEADERS[SHEET_NAMES.NAV_RECORDS] },
  { name: SHEET_NAMES.RECURRING, headers: SHEET_HEADERS[SHEET_NAMES.RECURRING] },
  { name: SHEET_NAMES.MARKET_INDICES, headers: SHEET_HEADERS[SHEET_NAMES.MARKET_INDICES] },
];

/**
 * 動的に生成されるシート名のプレフィックス定数。
 * ファンド別シート名を短縮するための新しいプレフィックスを定義する。
 */
export const SHEET_NAME_PREFIXES = {
  TRANSACTIONS: '_tx_',
  PERFORMANCE: '_perf_',
} as const;

/**
 * ファンドIDの末尾3文字を取得する。
 * シート名短縮のために使用する。
 *
 * @param fundId ファンドID
 * @returns ファンドIDの末尾3文字（3文字未満の場合は全体）
 *
 * 注意: 末尾3文字が重複するとシート名が競合するため、ユースケースで重複検知する。
 */
export function getFundIdSuffix(fundId: string): string {
  return fundId.slice(-3);
}

/**
 * ファンドIDから取引シート名を生成する。
 * ファンドIDの末尾3文字を使用して短縮する。
 *
 * @param fundId ファンドID
 * @returns 取引シート名(例: _tx_001)
 */
export function getTransactionSheetName(fundId: string): TransactionSheetName {
  return `${SHEET_NAME_PREFIXES.TRANSACTIONS}${getFundIdSuffix(fundId)}`;
}

/**
 * ファンドIDから実績シート名を生成する。
 * ファンドIDの末尾3文字を使用して短縮する。
 *
 * @param fundId ファンドID
 * @returns 実績シート名(例: _perf_001)
 */
export function getPerformanceSheetName(fundId: string): PerformanceSheetName {
  return `${SHEET_NAME_PREFIXES.PERFORMANCE}${getFundIdSuffix(fundId)}`;
}

/**
 * 全体実績シート名
 */
export const PERFORMANCE_SHEET_NAME = '_performance' as const;

/**
 * 実績シートのヘッダー定義
 */
export const PERFORMANCE_HEADERS = [
  'fundId',
  'date',
  'totalUnits',
  'remainingInvestment',
  'currentValue',
  'totalGain',
  'unrealizedGainRate',
  'createdAt',
] as const;

/**
 * 週次レポート送信先メールアドレスを取得する。
 * スクリプトプロパティから取得する。
 * 設定されていない場合はnullを返す。
 *
 * @returns 週次レポート送信先メールアドレス、未設定の場合はnull
 */
export function getWeeklyReportEmail(): string | null {
  const email = PropertiesService.getScriptProperties().getProperty('WEEKLY_REPORT_EMAIL');
  if (email === null || email.trim() === '') {
    return null;
  }
  return email;
}

/**
 * GOOGLEFINANCE関数で使用する市場指数のティッカーシンボル。
 * GASからは直接GOOGLEFINANCE関数を呼び出せないため、
 * ヘルパーシートにGOOGLEFINANCE関数を設定し、セル値を読み取る。
 */
export const MARKET_INDEX_TICKERS = {
  /** S&P500指数のティッカー */
  SP500: 'INDEXSP:.INX',
  /** NASDAQ Composite指数のティッカー */
  NASDAQ: 'INDEXNASDAQ:.IXIC',
} as const;

/**
 * ヘルパーシート内のセル配置定義。
 * GOOGLEFINANCE関数の結果を読み取るためのセル位置を指定する。
 */
export const MARKET_DATA_HELPER_CELLS = {
  /** S&P500終値を取得するセル（A1にGOOGLEFINANCE式を設定） */
  SP500_PRICE: 'A1',
  /** NASDAQ終値を取得するセル（B1にGOOGLEFINANCE式を設定） */
  NASDAQ_PRICE: 'B1',
} as const;
