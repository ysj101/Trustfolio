/**
 * 取引種別 Value Object
 *
 * 取引の種類を表現する定数オブジェクト。
 * enumは禁止のため、as constを使用する。
 */

/**
 * 取引種別の定数定義
 */
export const TRANSACTION_TYPES = {
  /** スポット購入 */
  SPOT_PURCHASE: "SPOT_PURCHASE",
  /** 積立購入 */
  RECURRING_PURCHASE: "RECURRING_PURCHASE",
} as const;

/**
 * 取引種別の型
 */
export type TransactionType = (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];

/**
 * 文字列が有効な取引種別かどうかを判定する
 *
 * @param value - 検査対象の文字列
 * @returns 有効な取引種別であればtrue
 */
export function isTransactionType(value: string): value is TransactionType {
  return Object.values(TRANSACTION_TYPES).includes(value as TransactionType);
}

/**
 * 文字列から取引種別を復元する
 *
 * DBから読み込んだ値など、既に検証済みの値を変換する場合に使用する。
 * 不正な値の場合はSPOT_PURCHASEを返す。
 *
 * @param value - 取引種別文字列
 * @returns TransactionType
 */
export function transactionTypeFromString(value: string): TransactionType {
  if (isTransactionType(value)) {
    return value;
  }
  return TRANSACTION_TYPES.SPOT_PURCHASE;
}

/**
 * 取引種別を日本語で表示する
 *
 * @param type - 取引種別
 * @returns 日本語の表示文字列
 */
export function formatTransactionType(type: TransactionType): string {
  switch (type) {
    case TRANSACTION_TYPES.SPOT_PURCHASE:
      return "スポット購入";
    case TRANSACTION_TYPES.RECURRING_PURCHASE:
      return "積立購入";
  }
}
