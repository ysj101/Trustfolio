/**
 * 投資信託用DTO
 *
 * API入出力用のデータ転送オブジェクト。
 */

import { type Fund, fundNameValue } from "../../../domain/fund/index.js";

/**
 * 投資信託レスポンスDTO
 */
export type FundResponseDto = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
};

/**
 * FundエンティティをレスポンスDTOに変換する
 *
 * @param fund - Fundエンティティ
 * @returns レスポンスDTO
 */
export function toFundResponseDto(fund: Fund): FundResponseDto {
  return {
    id: fund.id,
    name: fundNameValue(fund.name),
    createdAt: fund.createdAt.toISOString(),
  };
}

/**
 * 投資信託登録リクエストDTO
 */
export type RegisterFundRequestDto = {
  readonly name: string;
};
