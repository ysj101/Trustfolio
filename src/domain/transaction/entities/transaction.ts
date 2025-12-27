/**
 * 取引エンティティ
 *
 * 投資信託の購入取引を表現する。
 * スポット購入と積立購入の2種類をサポートする。
 *
 * 設計方針:
 * - 取引は一度作成されたら変更不可（Immutable）
 * - 積立購入の場合はrecurringPurchaseIdとidempotencyKeyを持つ
 * - スポット購入の場合はこれらはnull
 */

import { type Result, err } from "neverthrow";
import {
  type TransactionId,
  type FundId,
  type RecurringPurchaseId,
  generateTransactionId,
} from "../../_shared/entity-id.js";
import { type Money, moneyValue, subtractMoney } from "../../_shared/value-objects/money.js";
import { type NavValue } from "../../nav/value-objects/nav-value.js";
import { type TransactionType, TRANSACTION_TYPES } from "../value-objects/transaction-type.js";
import { type TransactionDate, createTransactionDate } from "../value-objects/transaction-date.js";
import { type Units } from "../value-objects/units.js";
import { type IdempotencyKey } from "../value-objects/idempotency-key.js";
import { type ValidationError, createValidationError } from "../../../shared/errors/base-error.js";

/**
 * 取引エンティティ
 */
export type Transaction = {
  /** 取引の一意識別子 */
  readonly id: TransactionId;
  /** 対象の投資信託ID */
  readonly fundId: FundId;
  /** 取引種別 */
  readonly type: TransactionType;
  /** 取引日 */
  readonly date: TransactionDate;
  /** 購入金額（円） */
  readonly amount: Money;
  /** 手数料（円） */
  readonly fee: Money;
  /** 適用基準価額（1万口あたり円） */
  readonly navValue: NavValue;
  /** 取得口数 */
  readonly units: Units;
  /** 積立設定ID（積立購入時のみ） */
  readonly recurringPurchaseId: RecurringPurchaseId | null;
  /** 冪等性キー（積立購入時のみ） */
  readonly idempotencyKey: IdempotencyKey | null;
  /** 作成日時 */
  readonly createdAt: Date;
};

/**
 * スポット購入取引の生成パラメータ
 */
export type CreateSpotTransactionParams = {
  /** 投資信託ID */
  readonly fundId: FundId;
  /** 取引日（YYYY-MM-DD形式） */
  readonly date: string;
  /** 購入金額（円） */
  readonly amount: Money;
  /** 手数料（円） */
  readonly fee: Money;
  /** 適用基準価額（1万口あたり円） */
  readonly navValue: NavValue;
  /** 取得口数 */
  readonly units: Units;
};

/**
 * 積立購入取引の生成パラメータ
 */
export type CreateRecurringTransactionParams = {
  /** 投資信託ID */
  readonly fundId: FundId;
  /** 取引日（YYYY-MM-DD形式） */
  readonly date: string;
  /** 購入金額（円） */
  readonly amount: Money;
  /** 手数料（円） */
  readonly fee: Money;
  /** 適用基準価額（1万口あたり円） */
  readonly navValue: NavValue;
  /** 取得口数 */
  readonly units: Units;
  /** 積立設定ID */
  readonly recurringPurchaseId: RecurringPurchaseId;
  /** 冪等性キー */
  readonly idempotencyKey: IdempotencyKey;
};

/**
 * スポット購入取引を生成する
 *
 * @param params - 生成パラメータ
 * @returns 成功時はTransaction、失敗時はValidationError
 */
export function createSpotTransaction(
  params: CreateSpotTransactionParams
): Result<Transaction, ValidationError> {
  // 金額の妥当性検証
  const netAmountResult = subtractMoney(params.amount, params.fee);
  if (netAmountResult.isErr()) {
    return err(createValidationError(
      "手数料が購入金額を超えています",
      "fee"
    ));
  }

  const netAmount = netAmountResult.value;
  if (moneyValue(netAmount) <= 0) {
    return err(createValidationError(
      "購入金額から手数料を引いた金額は正の値である必要があります",
      "amount"
    ));
  }

  return createTransactionDate(params.date).map((date) => ({
    id: generateTransactionId(),
    fundId: params.fundId,
    type: TRANSACTION_TYPES.SPOT_PURCHASE,
    date,
    amount: params.amount,
    fee: params.fee,
    navValue: params.navValue,
    units: params.units,
    recurringPurchaseId: null,
    idempotencyKey: null,
    createdAt: new Date(),
  }));
}

/**
 * 積立購入取引を生成する
 *
 * @param params - 生成パラメータ
 * @returns 成功時はTransaction、失敗時はValidationError
 */
export function createRecurringTransaction(
  params: CreateRecurringTransactionParams
): Result<Transaction, ValidationError> {
  // 金額の妥当性検証
  const netAmountResult = subtractMoney(params.amount, params.fee);
  if (netAmountResult.isErr()) {
    return err(createValidationError(
      "手数料が購入金額を超えています",
      "fee"
    ));
  }

  const netAmount = netAmountResult.value;
  if (moneyValue(netAmount) <= 0) {
    return err(createValidationError(
      "購入金額から手数料を引いた金額は正の値である必要があります",
      "amount"
    ));
  }

  return createTransactionDate(params.date).map((date) => ({
    id: generateTransactionId(),
    fundId: params.fundId,
    type: TRANSACTION_TYPES.RECURRING_PURCHASE,
    date,
    amount: params.amount,
    fee: params.fee,
    navValue: params.navValue,
    units: params.units,
    recurringPurchaseId: params.recurringPurchaseId,
    idempotencyKey: params.idempotencyKey,
    createdAt: new Date(),
  }));
}

/**
 * DBから読み込んだデータをTransactionエンティティに復元する
 *
 * @param data - DB行データ
 * @returns Transaction
 */
export function reconstituteTransaction(data: {
  readonly id: TransactionId;
  readonly fundId: FundId;
  readonly type: TransactionType;
  readonly date: TransactionDate;
  readonly amount: Money;
  readonly fee: Money;
  readonly navValue: NavValue;
  readonly units: Units;
  readonly recurringPurchaseId: RecurringPurchaseId | null;
  readonly idempotencyKey: IdempotencyKey | null;
  readonly createdAt: Date;
}): Transaction {
  return {
    id: data.id,
    fundId: data.fundId,
    type: data.type,
    date: data.date,
    amount: data.amount,
    fee: data.fee,
    navValue: data.navValue,
    units: data.units,
    recurringPurchaseId: data.recurringPurchaseId,
    idempotencyKey: data.idempotencyKey,
    createdAt: data.createdAt,
  };
}
