/**
 * 基準価額用DTO
 *
 * API入出力用のデータ転送オブジェクト。
 */

import { type Nav, navDateValue, navValueNumber } from "../../../domain/nav/index.js";

/**
 * 基準価額レスポンスDTO
 */
export type NavResponseDto = {
  readonly id: string;
  readonly fundId: string;
  readonly date: string;
  readonly value: number;
  readonly createdAt: string;
};

/**
 * NavエンティティをレスポンスDTOに変換する
 *
 * @param nav - Navエンティティ
 * @returns レスポンスDTO
 */
export function toNavResponseDto(nav: Nav): NavResponseDto {
  return {
    id: nav.id,
    fundId: nav.fundId,
    date: navDateValue(nav.date),
    value: navValueNumber(nav.value),
    createdAt: nav.createdAt.toISOString(),
  };
}

/**
 * 基準価額登録リクエストDTO
 */
export type RegisterNavRequestDto = {
  readonly date: string;
  readonly value: number;
};
