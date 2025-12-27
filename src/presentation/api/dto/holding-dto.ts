/**
 * 保有情報用DTO
 *
 * API入出力用のデータ転送オブジェクト。
 */

import { type Holding } from "../../../domain/holding/index.js";
import { fundNameValue } from "../../../domain/fund/index.js";
import { unitsValue } from "../../../domain/transaction/index.js";
import { moneyValue } from "../../../domain/_shared/value-objects/money.js";
import { percentageValue } from "../../../domain/_shared/value-objects/percentage.js";
import { navValueNumber, navDateValue } from "../../../domain/nav/index.js";

/**
 * 保有情報レスポンスDTO
 */
export type HoldingResponseDto = {
  readonly fundId: string;
  readonly fundName: string;
  readonly totalUnits: number;
  readonly averageCost: number;
  readonly totalInvestment: number;
  readonly currentNavValue: number | null;
  readonly currentNavDate: string | null;
  readonly currentValue: number | null;
  readonly unrealizedGain: number | null;
  readonly unrealizedGainRate: number | null;
};

/**
 * HoldingエンティティをレスポンスDTOに変換する
 *
 * @param holding - Holdingエンティティ
 * @returns レスポンスDTO
 */
export function toHoldingResponseDto(holding: Holding): HoldingResponseDto {
  return {
    fundId: holding.fundId,
    fundName: fundNameValue(holding.fundName),
    totalUnits: unitsValue(holding.totalUnits),
    averageCost: moneyValue(holding.averageCost),
    totalInvestment: moneyValue(holding.totalInvestment),
    currentNavValue: holding.currentNavValue !== null
      ? navValueNumber(holding.currentNavValue)
      : null,
    currentNavDate: holding.currentNavDate !== null
      ? navDateValue(holding.currentNavDate)
      : null,
    currentValue: holding.currentValue !== null
      ? moneyValue(holding.currentValue)
      : null,
    unrealizedGain: holding.unrealizedGain !== null
      ? moneyValue(holding.unrealizedGain)
      : null,
    unrealizedGainRate: holding.unrealizedGainRate !== null
      ? Math.round(percentageValue(holding.unrealizedGainRate) * 10000) / 100
      : null,
  };
}
