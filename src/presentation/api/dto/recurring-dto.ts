/**
 * 積立設定用DTO
 *
 * API入出力用のデータ転送オブジェクト。
 */

import {
  type RecurringPurchase,
  executionDayValue,
  recurringDateValue,
} from "../../../domain/recurring/index.js";
import { moneyValue } from "../../../domain/_shared/value-objects/money.js";
import { type SkippedRecurring } from "../../../usecase/recurring/index.js";

/**
 * 積立設定レスポンスDTO
 */
export type RecurringPurchaseResponseDto = {
  readonly id: string;
  readonly fundId: string;
  readonly monthlyAmount: number;
  readonly executionDay: number;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
};

/**
 * RecurringPurchaseエンティティをレスポンスDTOに変換する
 *
 * @param recurringPurchase - RecurringPurchaseエンティティ
 * @returns レスポンスDTO
 */
export function toRecurringPurchaseResponseDto(
  recurringPurchase: RecurringPurchase
): RecurringPurchaseResponseDto {
  return {
    id: recurringPurchase.id,
    fundId: recurringPurchase.fundId,
    monthlyAmount: moneyValue(recurringPurchase.monthlyAmount),
    executionDay: executionDayValue(recurringPurchase.executionDay),
    startDate: recurringDateValue(recurringPurchase.startDate),
    endDate: recurringPurchase.endDate !== null
      ? recurringDateValue(recurringPurchase.endDate)
      : null,
    isActive: recurringPurchase.isActive,
    createdAt: recurringPurchase.createdAt.toISOString(),
  };
}

/**
 * 積立設定登録リクエストDTO
 */
export type RegisterRecurringPurchaseRequestDto = {
  readonly fundId: string;
  readonly monthlyAmount: number;
  readonly executionDay: number;
  readonly startDate: string;
  readonly endDate?: string;
};

/**
 * 積立一括実行リクエストDTO
 */
export type ExecuteRecurringPurchasesRequestDto = {
  readonly targetDate: string;
};

/**
 * スキップされた積立DTO
 */
export type SkippedRecurringDto = {
  readonly recurringPurchaseId: string;
  readonly reason: string;
};

/**
 * SkippedRecurringをDTOに変換する
 *
 * @param skipped - スキップされた積立
 * @returns DTO
 */
export function toSkippedRecurringDto(skipped: SkippedRecurring): SkippedRecurringDto {
  return {
    recurringPurchaseId: skipped.recurringPurchaseId,
    reason: skipped.reason,
  };
}
