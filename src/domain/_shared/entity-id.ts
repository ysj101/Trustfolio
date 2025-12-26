/**
 * エンティティID生成ユーティリティ
 *
 * ULIDを使用してエンティティの一意識別子を生成する。
 * ULIDは時系列ソートが可能で、UUIDより可読性が高い。
 */

import { ulid } from "ulid";
import { type Branded } from "../../shared/types/branded.js";

/**
 * 投資信託ID
 */
export type FundId = Branded<string, "FundId">;

/**
 * 基準価額ID
 */
export type NavId = Branded<string, "NavId">;

/**
 * 取引ID
 */
export type TransactionId = Branded<string, "TransactionId">;

/**
 * 積立設定ID
 */
export type RecurringPurchaseId = Branded<string, "RecurringPurchaseId">;

/**
 * 新しいFundIdを生成する
 *
 * @returns 新規生成されたFundId
 */
export function generateFundId(): FundId {
  return ulid() as FundId;
}

/**
 * 文字列からFundIdを復元する
 *
 * DBから読み込んだ値など、既存のID文字列を型付きIDに変換する。
 *
 * @param value - ID文字列
 * @returns FundId
 */
export function fundIdFromString(value: string): FundId {
  return value as FundId;
}

/**
 * 新しいNavIdを生成する
 *
 * @returns 新規生成されたNavId
 */
export function generateNavId(): NavId {
  return ulid() as NavId;
}

/**
 * 文字列からNavIdを復元する
 *
 * @param value - ID文字列
 * @returns NavId
 */
export function navIdFromString(value: string): NavId {
  return value as NavId;
}

/**
 * 新しいTransactionIdを生成する
 *
 * @returns 新規生成されたTransactionId
 */
export function generateTransactionId(): TransactionId {
  return ulid() as TransactionId;
}

/**
 * 文字列からTransactionIdを復元する
 *
 * @param value - ID文字列
 * @returns TransactionId
 */
export function transactionIdFromString(value: string): TransactionId {
  return value as TransactionId;
}

/**
 * 新しいRecurringPurchaseIdを生成する
 *
 * @returns 新規生成されたRecurringPurchaseId
 */
export function generateRecurringPurchaseId(): RecurringPurchaseId {
  return ulid() as RecurringPurchaseId;
}

/**
 * 文字列からRecurringPurchaseIdを復元する
 *
 * @param value - ID文字列
 * @returns RecurringPurchaseId
 */
export function recurringPurchaseIdFromString(value: string): RecurringPurchaseId {
  return value as RecurringPurchaseId;
}
