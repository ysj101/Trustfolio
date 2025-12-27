/**
 * ポートフォリオエンティティ
 *
 * 全投資信託の保有状況を集約したデータ。
 * 投資総額、評価額合計、含み損益合計などを含む。
 *
 * 設計方針:
 * - 複数のHoldingを集約した読み取り専用データ
 * - NAVがない銘柄がある場合、評価関連の合計はnull
 */

import { type Money, addMoney, ZERO_MONEY, moneyValue } from "../../_shared/value-objects/money.js";
import { type Percentage, createPercentage } from "../../_shared/value-objects/percentage.js";
import { type Holding } from "../../holding/entities/holding.js";

/**
 * ポートフォリオエンティティ
 */
export type Portfolio = {
  /** 保有銘柄一覧 */
  readonly holdings: readonly Holding[];
  /** 投資総額（全銘柄合計） */
  readonly totalInvestment: Money;
  /** 評価額合計（一部でもNAV未登録がある場合はnull） */
  readonly totalCurrentValue: Money | null;
  /** 含み損益合計（一部でもNAV未登録がある場合はnull） */
  readonly totalUnrealizedGain: number | null;
  /** 全体損益率（一部でもNAV未登録がある場合はnull） */
  readonly totalUnrealizedGainRate: Percentage | null;
};

/**
 * ポートフォリオを生成する
 *
 * 複数のHoldingからポートフォリオ全体を集計する。
 * NAV未登録の銘柄が1つでもある場合、評価関連の合計はnullになる。
 *
 * @param holdings - 保有情報一覧
 * @returns Portfolio
 */
export function createPortfolio(holdings: readonly Holding[]): Portfolio {
  // 空の場合
  if (holdings.length === 0) {
    return {
      holdings,
      totalInvestment: ZERO_MONEY,
      totalCurrentValue: ZERO_MONEY,
      totalUnrealizedGain: 0,
      totalUnrealizedGainRate: createPercentage(0),
    };
  }

  // 投資総額を集計
  let totalInvestment: Money = ZERO_MONEY;
  for (const holding of holdings) {
    totalInvestment = addMoney(totalInvestment, holding.totalInvestment);
  }

  // NAV未登録の銘柄があるかチェック
  const hasIncompleteHolding = holdings.some((h) => h.currentValue === null);

  if (hasIncompleteHolding) {
    // 一部でもNAV未登録があれば評価関連はnull
    return {
      holdings,
      totalInvestment,
      totalCurrentValue: null,
      totalUnrealizedGain: null,
      totalUnrealizedGainRate: null,
    };
  }

  // 全銘柄のNAVが登録されている場合のみ評価額を集計
  let totalCurrentValue: Money = ZERO_MONEY;
  for (const holding of holdings) {
    // hasIncompleteHolding === false なので currentValue は非null
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    totalCurrentValue = addMoney(totalCurrentValue, holding.currentValue!);
  }

  // 含み損益合計
  const totalUnrealizedGain = moneyValue(totalCurrentValue) - moneyValue(totalInvestment);

  // 全体損益率
  const totalUnrealizedGainRateValue = moneyValue(totalInvestment) > 0
    ? Math.round((totalUnrealizedGain / moneyValue(totalInvestment)) * 10000) / 10000
    : 0;
  const totalUnrealizedGainRate = createPercentage(totalUnrealizedGainRateValue);

  return {
    holdings,
    totalInvestment,
    totalCurrentValue,
    totalUnrealizedGain,
    totalUnrealizedGainRate,
  };
}

/**
 * ポートフォリオに銘柄を追加する（不変操作）
 *
 * @param portfolio - 既存ポートフォリオ
 * @param holding - 追加する保有情報
 * @returns 新しいPortfolio
 */
export function addHoldingToPortfolio(portfolio: Portfolio, holding: Holding): Portfolio {
  return createPortfolio([...portfolio.holdings, holding]);
}
