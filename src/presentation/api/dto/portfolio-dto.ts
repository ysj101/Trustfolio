/**
 * ポートフォリオ用DTO
 *
 * API入出力用のデータ転送オブジェクト。
 */

import { type Portfolio } from "../../../domain/portfolio/index.js";
import { moneyValue } from "../../../domain/_shared/value-objects/money.js";
import { percentageValue } from "../../../domain/_shared/value-objects/percentage.js";
import { toHoldingResponseDto, type HoldingResponseDto } from "./holding-dto.js";

/**
 * ポートフォリオサマリDTO
 */
export type PortfolioSummaryDto = {
  readonly totalInvestment: number;
  readonly totalCurrentValue: number | null;
  readonly totalUnrealizedGain: number | null;
  readonly totalUnrealizedGainRate: number | null;
};

/**
 * ポートフォリオレスポンスDTO
 */
export type PortfolioResponseDto = {
  readonly holdings: readonly HoldingResponseDto[];
  readonly summary: PortfolioSummaryDto;
};

/**
 * PortfolioエンティティをレスポンスDTOに変換する
 *
 * @param portfolio - Portfolioエンティティ
 * @returns レスポンスDTO
 */
export function toPortfolioResponseDto(portfolio: Portfolio): PortfolioResponseDto {
  return {
    holdings: portfolio.holdings.map(toHoldingResponseDto),
    summary: {
      totalInvestment: moneyValue(portfolio.totalInvestment),
      totalCurrentValue: portfolio.totalCurrentValue !== null
        ? moneyValue(portfolio.totalCurrentValue)
        : null,
      totalUnrealizedGain: portfolio.totalUnrealizedGain,
      totalUnrealizedGainRate: portfolio.totalUnrealizedGainRate !== null
        ? Math.round(percentageValue(portfolio.totalUnrealizedGainRate) * 10000) / 100
        : null,
    },
  };
}
