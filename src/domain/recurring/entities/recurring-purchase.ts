/**
 * 積立設定エンティティ
 *
 * 投資信託の積立購入設定を表現する。
 * 毎月指定日に自動的に購入を行うための設定。
 *
 * 設計方針:
 * - 開始日以降、終了日まで（または無期限で）毎月実行日に購入
 * - isActiveがfalseの場合は実行をスキップ
 * - 実行日は1〜28日のみ指定可能
 */

import { type Result, ok, err } from "neverthrow";
import {
  type RecurringPurchaseId,
  type FundId,
  generateRecurringPurchaseId,
} from "../../_shared/entity-id.js";
import { type Money, createMoney, moneyValue } from "../../_shared/value-objects/money.js";
import { type ExecutionDay, createExecutionDay } from "../value-objects/execution-day.js";
import {
  type RecurringDate,
  createRecurringDate,
  compareRecurringDate,
} from "../value-objects/recurring-date.js";
import { type ValidationError, createValidationError } from "../../../shared/errors/base-error.js";

/**
 * 積立設定エンティティ
 */
export type RecurringPurchase = {
  /** 積立設定の一意識別子 */
  readonly id: RecurringPurchaseId;
  /** 対象の投資信託ID */
  readonly fundId: FundId;
  /** 月額購入金額（円） */
  readonly monthlyAmount: Money;
  /** 毎月の実行日（1〜28） */
  readonly executionDay: ExecutionDay;
  /** 開始日 */
  readonly startDate: RecurringDate;
  /** 終了日（nullの場合は無期限） */
  readonly endDate: RecurringDate | null;
  /** アクティブ状態 */
  readonly isActive: boolean;
  /** 作成日時 */
  readonly createdAt: Date;
};

/**
 * 積立設定の生成パラメータ
 */
export type CreateRecurringPurchaseParams = {
  /** 投資信託ID */
  readonly fundId: FundId;
  /** 月額購入金額（円） */
  readonly monthlyAmount: number;
  /** 毎月の実行日（1〜28） */
  readonly executionDay: number;
  /** 開始日（YYYY-MM-DD形式） */
  readonly startDate: string;
  /** 終了日（YYYY-MM-DD形式、省略時は無期限） */
  readonly endDate?: string;
};

/**
 * 積立設定を生成する
 *
 * @param params - 生成パラメータ
 * @returns 成功時はRecurringPurchase、失敗時はValidationError
 */
export function createRecurringPurchase(
  params: CreateRecurringPurchaseParams
): Result<RecurringPurchase, ValidationError> {
  // 月額のバリデーション
  const monthlyAmountResult = createMoney(params.monthlyAmount);
  if (monthlyAmountResult.isErr()) {
    return err(createValidationError(
      "月額は有効な金額である必要があります",
      "monthlyAmount"
    ));
  }

  const monthlyAmount = monthlyAmountResult.value;
  if (moneyValue(monthlyAmount) <= 0) {
    return err(createValidationError(
      "月額は正の値である必要があります",
      "monthlyAmount"
    ));
  }

  // 実行日のバリデーション
  const executionDayResult = createExecutionDay(params.executionDay);
  if (executionDayResult.isErr()) {
    return err(executionDayResult.error);
  }

  // 開始日のバリデーション
  const startDateResult = createRecurringDate(params.startDate);
  if (startDateResult.isErr()) {
    return err(createValidationError(
      "開始日が無効です",
      "startDate"
    ));
  }

  // 終了日のバリデーション（指定がある場合）
  let endDate: RecurringDate | null = null;
  if (params.endDate !== undefined) {
    const endDateResult = createRecurringDate(params.endDate);
    if (endDateResult.isErr()) {
      return err(createValidationError(
        "終了日が無効です",
        "endDate"
      ));
    }
    endDate = endDateResult.value;

    // 終了日は開始日以降であること
    if (compareRecurringDate(endDate, startDateResult.value) < 0) {
      return err(createValidationError(
        "終了日は開始日以降である必要があります",
        "endDate"
      ));
    }
  }

  return ok({
    id: generateRecurringPurchaseId(),
    fundId: params.fundId,
    monthlyAmount,
    executionDay: executionDayResult.value,
    startDate: startDateResult.value,
    endDate,
    isActive: true,
    createdAt: new Date(),
  });
}

/**
 * DBから読み込んだデータをRecurringPurchaseエンティティに復元する
 *
 * @param data - DB行データ
 * @returns RecurringPurchase
 */
export function reconstituteRecurringPurchase(data: {
  readonly id: RecurringPurchaseId;
  readonly fundId: FundId;
  readonly monthlyAmount: Money;
  readonly executionDay: ExecutionDay;
  readonly startDate: RecurringDate;
  readonly endDate: RecurringDate | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
}): RecurringPurchase {
  return {
    id: data.id,
    fundId: data.fundId,
    monthlyAmount: data.monthlyAmount,
    executionDay: data.executionDay,
    startDate: data.startDate,
    endDate: data.endDate,
    isActive: data.isActive,
    createdAt: data.createdAt,
  };
}

/**
 * 積立設定が指定日に実行対象かどうかを判定する
 *
 * @param recurring - 積立設定
 * @param targetDate - 対象日（YYYY-MM-DD形式）
 * @returns 実行対象であればtrue
 */
export function isRecurringExecutable(
  recurring: RecurringPurchase,
  targetDate: string
): boolean {
  // 非アクティブな場合はスキップ
  if (!recurring.isActive) {
    return false;
  }

  // 対象日から日を抽出
  const day = Number.parseInt(targetDate.slice(8, 10), 10);
  if (day !== (recurring.executionDay as number)) {
    return false;
  }

  // 開始日より前はスキップ
  if (targetDate < (recurring.startDate as string)) {
    return false;
  }

  // 終了日より後はスキップ
  if (recurring.endDate !== null && targetDate > (recurring.endDate as string)) {
    return false;
  }

  return true;
}
