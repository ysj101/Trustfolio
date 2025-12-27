/**
 * 積立設定登録ユースケース
 *
 * 前提条件:
 * - 対象投資信託が存在すること
 * - 入力値が有効であること
 *
 * 処理内容:
 * 1. 投資信託の存在確認
 * 2. 積立設定エンティティ生成
 * 3. 保存
 */

import { type ResultAsync, errAsync } from "neverthrow";
import {
  type FundRepository,
  type RecurringPurchaseRepository,
} from "../_shared/repository-interfaces.js";
import {
  type RecurringPurchase,
  createRecurringPurchase,
} from "../../domain/recurring/index.js";
import { fundIdFromString } from "../../domain/_shared/index.js";
import {
  type ValidationError,
  type RepositoryError,
  type NotFoundError,
  createNotFoundError,
} from "../../shared/errors/base-error.js";

/**
 * 積立設定登録の入力
 */
export type RegisterRecurringPurchaseInput = {
  /** 投資信託ID */
  readonly fundId: string;
  /** 月額購入金額（円） */
  readonly monthlyAmount: number;
  /** 毎月の実行日（1〜28） */
  readonly executionDay: number;
  /** 開始日（YYYY-MM-DD） */
  readonly startDate: string;
  /** 終了日（YYYY-MM-DD）、省略時は無期限 */
  readonly endDate?: string;
};

/**
 * 積立設定登録の出力
 */
export type RegisterRecurringPurchaseOutput = {
  /** 登録された積立設定 */
  readonly recurringPurchase: RecurringPurchase;
};

/**
 * 積立設定登録のエラー
 */
export type RegisterRecurringPurchaseError = ValidationError | NotFoundError | RepositoryError;

/**
 * 積立設定を登録する
 *
 * @param repos - リポジトリ
 * @param input - 登録入力
 * @returns 成功時は積立設定、失敗時はエラー
 */
export function registerRecurringPurchase(
  repos: { fund: FundRepository; recurringPurchase: RecurringPurchaseRepository },
  input: RegisterRecurringPurchaseInput
): ResultAsync<RegisterRecurringPurchaseOutput, RegisterRecurringPurchaseError> {
  const fundId = fundIdFromString(input.fundId);

  // 1. 投資信託の存在確認
  return repos.fund.findById(fundId).andThen((fund) => {
    if (fund === null) {
      return errAsync<RegisterRecurringPurchaseOutput, RegisterRecurringPurchaseError>(
        createNotFoundError("Fund", input.fundId)
      );
    }

    // 2. 積立設定エンティティ生成
    const recurringPurchaseResult = createRecurringPurchase({
      fundId,
      monthlyAmount: input.monthlyAmount,
      executionDay: input.executionDay,
      startDate: input.startDate,
      ...(input.endDate !== undefined && { endDate: input.endDate }),
    });

    if (recurringPurchaseResult.isErr()) {
      return errAsync<RegisterRecurringPurchaseOutput, RegisterRecurringPurchaseError>(
        recurringPurchaseResult.error
      );
    }

    const recurringPurchase = recurringPurchaseResult.value;

    // 3. 保存
    return repos.recurringPurchase.save(recurringPurchase).map(() => ({
      recurringPurchase,
    }));
  });
}
