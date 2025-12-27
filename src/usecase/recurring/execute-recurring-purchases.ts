/**
 * 積立一括実行ユースケース
 *
 * 前提条件:
 * - 対象日の積立設定が存在すること
 *
 * 処理内容:
 * 1. 対象日のアクティブな積立設定を取得
 * 2. 各積立設定に対して:
 *    - 冪等性チェック（同日再実行でスキップ）
 *    - NAV取得
 *    - 口数計算
 *    - 取引生成・保存
 *
 * 冪等性保証:
 * - 冪等性キー形式: {recurringPurchaseId}_{targetDate}
 * - 既に実行済みの場合はスキップ
 */

import { type ResultAsync, okAsync } from "neverthrow";
import {
  type NavRepository,
  type TransactionRepository,
  type RecurringPurchaseRepository,
} from "../_shared/repository-interfaces.js";
import {
  type Transaction,
  createRecurringTransaction,
  calculateUnits,
  createIdempotencyKeyFromRecurring,
} from "../../domain/transaction/index.js";
import {
  type RecurringPurchase,
  isRecurringExecutable,
} from "../../domain/recurring/index.js";
import { ZERO_MONEY } from "../../domain/_shared/value-objects/money.js";
import { navDateFromString } from "../../domain/nav/index.js";
import { type RepositoryError } from "../../shared/errors/base-error.js";

/**
 * スキップ理由
 */
export const SKIP_REASONS = {
  /** 既に実行済み */
  ALREADY_EXECUTED: "ALREADY_EXECUTED",
  /** NAVが未登録 */
  NO_NAV: "NO_NAV",
  /** 非アクティブ */
  INACTIVE: "INACTIVE",
  /** 対象日ではない */
  NOT_TARGET_DATE: "NOT_TARGET_DATE",
} as const;

export type SkipReason = (typeof SKIP_REASONS)[keyof typeof SKIP_REASONS];

/**
 * 積立一括実行の入力
 */
export type ExecuteRecurringPurchasesInput = {
  /** 実行対象日（YYYY-MM-DD） */
  readonly targetDate: string;
};

/**
 * スキップされた積立情報
 */
export type SkippedRecurring = {
  /** 積立設定ID */
  readonly recurringPurchaseId: string;
  /** スキップ理由 */
  readonly reason: SkipReason;
};

/**
 * 積立一括実行の出力
 */
export type ExecuteRecurringPurchasesOutput = {
  /** 新規実行された取引 */
  readonly executed: readonly Transaction[];
  /** スキップされた積立 */
  readonly skipped: readonly SkippedRecurring[];
};

/**
 * 積立一括実行のエラー
 */
export type ExecuteRecurringPurchasesError = RepositoryError;

/**
 * 積立を一括実行する
 *
 * @param repos - リポジトリ
 * @param input - 実行入力
 * @returns 成功時は実行結果、失敗時はエラー
 */
export function executeRecurringPurchases(
  repos: {
    nav: NavRepository;
    transaction: TransactionRepository;
    recurringPurchase: RecurringPurchaseRepository;
  },
  input: ExecuteRecurringPurchasesInput
): ResultAsync<ExecuteRecurringPurchasesOutput, ExecuteRecurringPurchasesError> {
  const { targetDate } = input;

  // 1. 全アクティブな積立設定を取得
  return repos.recurringPurchase.findAllActive().andThen((allRecurrings) => {
    // 対象日に実行すべき積立設定をフィルタリング
    const recurrings = allRecurrings.filter((r) => isRecurringExecutable(r, targetDate));
    const nonExecutable = allRecurrings.filter((r) => !isRecurringExecutable(r, targetDate));

    // 非対象の積立はスキップとして記録
    const skippedNonTarget: SkippedRecurring[] = nonExecutable.map((r) => ({
      recurringPurchaseId: r.id as string,
      reason: r.isActive ? SKIP_REASONS.NOT_TARGET_DATE : SKIP_REASONS.INACTIVE,
    }));

    if (recurrings.length === 0) {
      return okAsync<ExecuteRecurringPurchasesOutput, ExecuteRecurringPurchasesError>({
        executed: [],
        skipped: skippedNonTarget,
      });
    }

    // 2. 各積立設定を順次処理
    return processRecurrings(repos, recurrings, targetDate, skippedNonTarget);
  });
}

/**
 * 積立設定を順次処理する
 */
function processRecurrings(
  repos: {
    nav: NavRepository;
    transaction: TransactionRepository;
    recurringPurchase: RecurringPurchaseRepository;
  },
  recurrings: readonly RecurringPurchase[],
  targetDate: string,
  initialSkipped: readonly SkippedRecurring[]
): ResultAsync<ExecuteRecurringPurchasesOutput, ExecuteRecurringPurchasesError> {
  const executed: Transaction[] = [];
  const skipped: SkippedRecurring[] = [...initialSkipped];

  // 再帰的に処理（Promiseチェーン）
  function processNext(
    index: number
  ): ResultAsync<ExecuteRecurringPurchasesOutput, ExecuteRecurringPurchasesError> {
    if (index >= recurrings.length) {
      return okAsync({ executed, skipped });
    }

    const recurring = recurrings[index];
    if (recurring === undefined) {
      return okAsync({ executed, skipped });
    }

    return processOneRecurring(repos, recurring, targetDate).andThen((result) => {
      if (result.type === "executed") {
        executed.push(result.transaction);
      } else {
        skipped.push({
          recurringPurchaseId: recurring.id as string,
          reason: result.reason,
        });
      }
      return processNext(index + 1);
    });
  }

  return processNext(0);
}

/**
 * 1つの積立設定を処理する
 */
type ProcessResult =
  | { type: "executed"; transaction: Transaction }
  | { type: "skipped"; reason: SkipReason };

function processOneRecurring(
  repos: {
    nav: NavRepository;
    transaction: TransactionRepository;
  },
  recurring: RecurringPurchase,
  targetDate: string
): ResultAsync<ProcessResult, ExecuteRecurringPurchasesError> {
  const idempotencyKey = createIdempotencyKeyFromRecurring(recurring.id as string, targetDate);

  // 冪等性チェック
  return repos.transaction.findByIdempotencyKey(idempotencyKey).andThen((existing) => {
    if (existing !== null) {
      return okAsync<ProcessResult, ExecuteRecurringPurchasesError>({
        type: "skipped",
        reason: SKIP_REASONS.ALREADY_EXECUTED,
      });
    }

    // NAV取得
    const navDate = navDateFromString(targetDate);
    return repos.nav.findByFundAndDate(recurring.fundId, navDate).andThen((nav) => {
      if (nav === null) {
        return okAsync<ProcessResult, ExecuteRecurringPurchasesError>({
          type: "skipped",
          reason: SKIP_REASONS.NO_NAV,
        });
      }

      // 口数計算
      const unitsResult = calculateUnits(recurring.monthlyAmount, ZERO_MONEY, nav.value);
      if (unitsResult.isErr()) {
        // 口数計算失敗はNAVなしと同様にスキップ
        return okAsync<ProcessResult, ExecuteRecurringPurchasesError>({
          type: "skipped",
          reason: SKIP_REASONS.NO_NAV,
        });
      }

      // 取引生成
      const transactionResult = createRecurringTransaction({
        fundId: recurring.fundId,
        date: targetDate,
        amount: recurring.monthlyAmount,
        fee: ZERO_MONEY,
        navValue: nav.value,
        units: unitsResult.value,
        recurringPurchaseId: recurring.id,
        idempotencyKey,
      });

      if (transactionResult.isErr()) {
        return okAsync<ProcessResult, ExecuteRecurringPurchasesError>({
          type: "skipped",
          reason: SKIP_REASONS.NO_NAV,
        });
      }

      const transaction = transactionResult.value;

      // 保存
      return repos.transaction.save(transaction).map(() => ({
        type: "executed" as const,
        transaction,
      }));
    });
  });
}
