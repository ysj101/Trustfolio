/**
 * 基準価額登録ユースケース
 *
 * 前提条件:
 * - 対象投資信託が存在すること
 * - 基準価額が正の整数であること
 * - 日付が有効なフォーマットであること
 *
 * 処理内容:
 * 1. 投資信託の存在確認
 * 2. 入力バリデーション
 * 3. 同一日付の既存データ確認
 * 4. NAVエンティティの生成・保存（既存時は上書き）
 */

import { type ResultAsync, errAsync } from "neverthrow";
import { type FundRepository, type NavRepository } from "../_shared/repository-interfaces.js";
import { type Nav, createNav, navDateFromString } from "../../domain/nav/index.js";
import { fundIdFromString } from "../../domain/_shared/index.js";
import {
  type ValidationError,
  type RepositoryError,
  type NotFoundError,
  createNotFoundError,
} from "../../shared/errors/base-error.js";

/**
 * 基準価額登録の入力
 */
export type RegisterNavInput = {
  /** 投資信託ID */
  readonly fundId: string;
  /** 基準価額日付（YYYY-MM-DD） */
  readonly date: string;
  /** 基準価額（1万口あたり円） */
  readonly value: number;
};

/**
 * 基準価額登録の出力
 */
export type RegisterNavOutput = {
  /** 登録された基準価額 */
  readonly nav: Nav;
  /** 上書きフラグ */
  readonly isOverwritten: boolean;
};

/**
 * 基準価額登録のエラー
 */
export type RegisterNavError = ValidationError | NotFoundError | RepositoryError;

/**
 * 基準価額を登録する
 *
 * @param repos - リポジトリ
 * @param input - 登録入力
 * @returns 成功時は登録されたNav、失敗時はエラー
 */
export function registerNav(
  repos: { fund: FundRepository; nav: NavRepository },
  input: RegisterNavInput
): ResultAsync<RegisterNavOutput, RegisterNavError> {
  const fundId = fundIdFromString(input.fundId);

  // 1. 投資信託の存在確認
  return repos.fund.findById(fundId).andThen((fund) => {
    if (fund === null) {
      return errAsync<RegisterNavOutput, RegisterNavError>(
        createNotFoundError("Fund", input.fundId)
      );
    }

    // 2. NAVエンティティを生成（バリデーション含む）
    const navResult = createNav({
      fundId,
      date: input.date,
      value: input.value,
    });

    if (navResult.isErr()) {
      return errAsync<RegisterNavOutput, RegisterNavError>(navResult.error);
    }

    const nav = navResult.value;
    const navDate = navDateFromString(input.date);

    // 3. 既存データ確認
    return repos.nav.findByFundAndDate(fundId, navDate).andThen((existingNav) => {
      const isOverwritten = existingNav !== null;

      // 4. 保存
      return repos.nav.save(nav).map(() => ({
        nav,
        isOverwritten,
      }));
    });
  });
}
