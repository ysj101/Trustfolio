/**
 * 取引用DTO
 *
 * API入出力用のデータ転送オブジェクト。
 */

import {
  type Transaction,
  transactionDateValue,
  unitsValue,
} from "../../../domain/transaction/index.js";
import { moneyValue } from "../../../domain/_shared/value-objects/money.js";
import { navValueNumber } from "../../../domain/nav/index.js";

/**
 * 取引レスポンスDTO
 */
export type TransactionResponseDto = {
  readonly id: string;
  readonly fundId: string;
  readonly type: "SPOT_PURCHASE" | "RECURRING_PURCHASE";
  readonly date: string;
  readonly amount: number;
  readonly fee: number;
  readonly navValue: number;
  readonly units: number;
  readonly recurringPurchaseId: string | null;
  readonly createdAt: string;
};

/**
 * TransactionエンティティをレスポンスDTOに変換する
 *
 * @param transaction - Transactionエンティティ
 * @returns レスポンスDTO
 */
export function toTransactionResponseDto(transaction: Transaction): TransactionResponseDto {
  return {
    id: transaction.id,
    fundId: transaction.fundId,
    type: transaction.type,
    date: transactionDateValue(transaction.date),
    amount: moneyValue(transaction.amount),
    fee: moneyValue(transaction.fee),
    navValue: navValueNumber(transaction.navValue),
    units: unitsValue(transaction.units),
    recurringPurchaseId: transaction.recurringPurchaseId,
    createdAt: transaction.createdAt.toISOString(),
  };
}

/**
 * スポット購入リクエストDTO
 */
export type ExecuteSpotPurchaseRequestDto = {
  readonly date: string;
  readonly amount: number;
  readonly fee?: number;
};
