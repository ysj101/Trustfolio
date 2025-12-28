/**
 * GAS移行版のスプレッドシート設定を定義する。
 * ここで定義したシート名・ヘッダーを唯一の正とする。
 */
export const SHEET_NAMES = {
  FUNDS: '_funds',
  NAVS: '_navs',
  TRANSACTIONS: '_transactions',
  RECURRING: '_recurring',
} as const;

/**
 * シートのヘッダー定義。
 * ヘッダーの順序が壊れている場合は即座に失敗させる。
 */
export const SHEET_HEADERS = {
  [SHEET_NAMES.FUNDS]: ['id', 'name', 'morningstarCode', 'createdAt'],
  [SHEET_NAMES.NAVS]: ['id', 'fundId', 'date', 'value', 'createdAt'],
  [SHEET_NAMES.TRANSACTIONS]: [
    'id',
    'fundId',
    'type',
    'date',
    'amount',
    'fee',
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
 */
export const SHEET_DEFINITIONS: readonly SheetDefinition[] = [
  { name: SHEET_NAMES.FUNDS, headers: SHEET_HEADERS[SHEET_NAMES.FUNDS] },
  { name: SHEET_NAMES.NAVS, headers: SHEET_HEADERS[SHEET_NAMES.NAVS] },
  { name: SHEET_NAMES.TRANSACTIONS, headers: SHEET_HEADERS[SHEET_NAMES.TRANSACTIONS] },
  { name: SHEET_NAMES.RECURRING, headers: SHEET_HEADERS[SHEET_NAMES.RECURRING] },
];
