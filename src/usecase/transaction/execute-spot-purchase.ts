/**
 * スポット購入実行ユースケース
 *
 * 前提条件:
 * - 対象投資信託が存在すること
 * - 購入日のNAVが登録されていること
 * - 購入金額が正の値であること
 *
 * 処理内容:
 * 1. 投資信託の存在確認
 * 2. 購入日のNAV取得
 * 3. 口数計算
 * 4. 取引エンティティ生成・保存
 */

import { type ResultAsync, errAsync } from "neverthrow";
import {
  type FundRepository,
  type NavRepository,
  type TransactionRepository,
} from "../_shared/repository-interfaces.js";
import {
  type Transaction,
  createSpotTransaction,
  calculateUnits,
} from "../../domain/transaction/index.js";
import { fundIdFromString } from "../../domain/_shared/index.js";
import { createMoney, ZERO_MONEY } from "../../domain/_shared/value-objects/money.js";
import { navDateFromString } from "../../domain/nav/index.js";
import {
  type ValidationError,
  type RepositoryError,
  type NotFoundError,
  createNotFoundError,
  createValidationError,
} from "../../shared/errors/base-error.js";

/**
 * スポット購入実行の入力
 */
export type ExecuteSpotPurchaseInput = {
  /** 投資信託ID */
  readonly fundId: string;
  /** 購入日（YYYY-MM-DD） */
  readonly date: string;
  /** 購入金額（円） */
  readonly amount: number;
  /** 手数料（円）、省略時は0 */
  readonly fee?: number;
};

/**
 * スポット購入実行の出力
 */
export type ExecuteSpotPurchaseOutput = {
  /** 登録された取引 */
  readonly transaction: Transaction;
};

/**
 * スポット購入実行のエラー
 */
export type ExecuteSpotPurchaseError = ValidationError | NotFoundError | RepositoryError;

/**
 * スポット購入を実行する
 *
 * @param repos - リポジトリ
 * @param input - 購入入力
 * @returns 成功時は取引、失敗時はエラー
 */
export function executeSpotPurchase(
  repos: { fund: FundRepository; nav: NavRepository; transaction: TransactionRepository },
  input: ExecuteSpotPurchaseInput
): ResultAsync<ExecuteSpotPurchaseOutput, ExecuteSpotPurchaseError> {
  const fundId = fundIdFromString(input.fundId);

  // 1. 投資信託の存在確認
  return repos.fund.findById(fundId).andThen((fund) => {
    if (fund === null) {
      return errAsync<ExecuteSpotPurchaseOutput, ExecuteSpotPurchaseError>(
        createNotFoundError("Fund", input.fundId)
      );
    }

    // 2. 入力値のバリデーション
    const amountResult = createMoney(input.amount);
    if (amountResult.isErr()) {
      return errAsync<ExecuteSpotPurchaseOutput, ExecuteSpotPurchaseError>(
        createValidationError("購入金額が無効です", "amount")
      );
    }
    const amount = amountResult.value;

    const feeResult = createMoney(input.fee ?? 0);
    if (feeResult.isErr()) {
      return errAsync<ExecuteSpotPurchaseOutput, ExecuteSpotPurchaseError>(
        createValidationError("手数料が無効です", "fee")
      );
    }
    const fee = input.fee !== undefined ? feeResult.value : ZERO_MONEY;

    // 3. 購入日のNAV取得
    const navDate = navDateFromString(input.date);
    return repos.nav.findByFundAndDate(fundId, navDate).andThen((nav) => {
      if (nav === null) {
        return errAsync<ExecuteSpotPurchaseOutput, ExecuteSpotPurchaseError>(
          createNotFoundError("NAV", `${input.fundId} on ${input.date}`)
        );
      }

      // 4. 口数計算
      const unitsResult = calculateUnits(amount, fee, nav.value);
      if (unitsResult.isErr()) {
        return errAsync<ExecuteSpotPurchaseOutput, ExecuteSpotPurchaseError>(unitsResult.error);
      }
      const units = unitsResult.value;

      // 5. 取引エンティティ生成
      const transactionResult = createSpotTransaction({
        fundId,
        date: input.date,
        amount,
        fee,
        navValue: nav.value,
        units,
      });

      if (transactionResult.isErr()) {
        return errAsync<ExecuteSpotPurchaseOutput, ExecuteSpotPurchaseError>(
          transactionResult.error
        );
      }

      const transaction = transactionResult.value;

      // 6. 保存
      return repos.transaction.save(transaction).map(() => ({
        transaction,
      }));
    });
  });
}
