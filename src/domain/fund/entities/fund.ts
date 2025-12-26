/**
 * 投資信託エンティティ
 *
 * 投資信託の銘柄情報を表現する。
 * 銘柄名は登録後に変更不可であり、一意性が保証される。
 */

import { type Result } from "neverthrow";
import { type FundId, generateFundId } from "../../_shared/entity-id.js";
import { type FundName, createFundName } from "../value-objects/fund-name.js";
import { type ValidationError } from "../../../shared/errors/base-error.js";

/**
 * 投資信託エンティティ
 */
export type Fund = {
  /** 投資信託の一意識別子 */
  readonly id: FundId;
  /** 銘柄名（変更不可） */
  readonly name: FundName;
  /** 登録日時 */
  readonly createdAt: Date;
};

/**
 * 投資信託生成パラメータ
 */
export type CreateFundParams = {
  /** 銘柄名 */
  readonly name: string;
};

/**
 * 投資信託を生成する
 *
 * 新規登録時に使用する。IDは自動生成される。
 *
 * @param params - 生成パラメータ
 * @returns 成功時はFund、失敗時はValidationError
 */
export function createFund(params: CreateFundParams): Result<Fund, ValidationError> {
  return createFundName(params.name).map((name) => ({
    id: generateFundId(),
    name,
    createdAt: new Date(),
  }));
}

/**
 * DBから読み込んだデータをFundエンティティに復元する
 *
 * @param data - DB行データ
 * @returns Fund
 */
export function reconstituteFund(data: {
  readonly id: FundId;
  readonly name: FundName;
  readonly createdAt: Date;
}): Fund {
  return {
    id: data.id,
    name: data.name,
    createdAt: data.createdAt,
  };
}
