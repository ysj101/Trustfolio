/**
 * 基準価額エンティティ
 *
 * 特定日における投資信託の基準価額を表現する。
 * 同一日付・同一銘柄につき1件のみ存在可能。
 */

import { type Result } from "neverthrow";
import { type FundId } from "../../_shared/entity-id.js";
import { type NavId, generateNavId } from "../../_shared/entity-id.js";
import { type NavDate, createNavDate } from "../value-objects/nav-date.js";
import { type NavValue, createNavValue } from "../value-objects/nav-value.js";
import { type ValidationError } from "../../../shared/errors/base-error.js";

/**
 * 基準価額エンティティ
 */
export type Nav = {
  /** 基準価額の一意識別子 */
  readonly id: NavId;
  /** 対象投資信託ID */
  readonly fundId: FundId;
  /** 基準価額日付 */
  readonly date: NavDate;
  /** 基準価額（1万口あたり円） */
  readonly value: NavValue;
  /** 登録日時 */
  readonly createdAt: Date;
};

/**
 * 基準価額生成パラメータ
 */
export type CreateNavParams = {
  /** 対象投資信託ID */
  readonly fundId: FundId;
  /** 基準価額日付（YYYY-MM-DD形式） */
  readonly date: string;
  /** 基準価額（1万口あたり円） */
  readonly value: number;
};

/**
 * 基準価額を生成する
 *
 * @param params - 生成パラメータ
 * @returns 成功時はNav、失敗時はValidationError
 */
export function createNav(params: CreateNavParams): Result<Nav, ValidationError> {
  return createNavDate(params.date).andThen((date) =>
    createNavValue(params.value).map((value) => ({
      id: generateNavId(),
      fundId: params.fundId,
      date,
      value,
      createdAt: new Date(),
    }))
  );
}

/**
 * DBから読み込んだデータをNavエンティティに復元する
 *
 * @param data - DB行データ
 * @returns Nav
 */
export function reconstituteNav(data: {
  readonly id: NavId;
  readonly fundId: FundId;
  readonly date: NavDate;
  readonly value: NavValue;
  readonly createdAt: Date;
}): Nav {
  return {
    id: data.id,
    fundId: data.fundId,
    date: data.date,
    value: data.value,
    createdAt: data.createdAt,
  };
}
