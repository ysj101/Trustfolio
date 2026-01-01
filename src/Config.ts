/**
 * GAS移行版のスプレッドシート設定を定義する。
 * ここで定義したシート名・ヘッダーを唯一の正とする。
 */
export const SHEET_NAMES = {
  FUNDS: '_funds',
  NAV_RECORDS: '_nav_records',
  TRANSACTIONS: '_transactions',
  RECURRING: '_recurring',
} as const;

/**
 * シートのヘッダー定義。
 * ヘッダーの順序が壊れている場合は即座に失敗させる。
 */
export const SHEET_HEADERS = {
  [SHEET_NAMES.FUNDS]: ['id', 'name', 'rakutenFundId', 'settlementBusinessDays', 'createdAt'],
  [SHEET_NAMES.NAV_RECORDS]: ['id', 'fundId', 'date', 'value', 'createdAt'],
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
} as const;

export type SheetName = (typeof SHEET_NAMES)[keyof typeof SHEET_NAMES];

export type SheetDefinition = {
  name: SheetName;
  headers: readonly string[];
};

/**
 * 初期化対象となるシート定義一覧。
 * 注: _transactionsシートは削除済み。取引データは_transactions_{fundId}に記録される。
 */
export const SHEET_DEFINITIONS: readonly SheetDefinition[] = [
  { name: SHEET_NAMES.FUNDS, headers: SHEET_HEADERS[SHEET_NAMES.FUNDS] },
  { name: SHEET_NAMES.NAV_RECORDS, headers: SHEET_HEADERS[SHEET_NAMES.NAV_RECORDS] },
  { name: SHEET_NAMES.RECURRING, headers: SHEET_HEADERS[SHEET_NAMES.RECURRING] },
];

/**
 * 動的に生成されるシート名のプレフィックス定数
 */
export const SHEET_NAME_PREFIXES = {
  TRANSACTIONS: '_transactions_',
  PERFORMANCE: '_performance_',
} as const;

/**
 * ファンドIDから取引シート名を生成する
 * @param fundId ファンドID
 * @returns 取引シート名(例: _transactions_fund001)
 */
export function getTransactionSheetName(fundId: string): string {
  return `${SHEET_NAME_PREFIXES.TRANSACTIONS}${fundId}`;
}

/**
 * ファンドIDから実績シート名を生成する
 * @param fundId ファンドID
 * @returns 実績シート名(例: _performance_fund001)
 */
export function getPerformanceSheetName(fundId: string): string {
  return `${SHEET_NAME_PREFIXES.PERFORMANCE}${fundId}`;
}

/**
 * 全体実績シート名
 */
export const PERFORMANCE_SHEET_NAME = '_performance' as const;

/**
 * 実績シートのヘッダー定義
 */
export const PERFORMANCE_HEADERS = [
  'id',
  'fundId',
  'date',
  'totalUnits',
  'remainingInvestment',
  'currentValue',
  'totalGain',
  'unrealizedGainRate',
  'createdAt',
] as const;
