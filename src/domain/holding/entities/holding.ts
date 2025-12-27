/**
 * 保有情報エンティティ
 *
 * 投資信託の保有状況を表現する。
 * 取引履歴から集計された保有口数、評価額、損益を含む。
 *
 * 設計方針:
 * - 取引履歴とNAVから計算される読み取り専用データ
 * - NAVがない場合は評価関連項目がnull
 */

import { type FundId } from "../../_shared/entity-id.js";
import { type FundName } from "../../fund/value-objects/fund-name.js";
import { type Money } from "../../_shared/value-objects/money.js";
import { type Percentage } from "../../_shared/value-objects/percentage.js";
import { type Units } from "../../transaction/value-objects/units.js";
import { type NavValue } from "../../nav/value-objects/nav-value.js";
import { type NavDate } from "../../nav/value-objects/nav-date.js";

/**
 * 保有情報エンティティ
 */
export type Holding = {
  /** 投資信託ID */
  readonly fundId: FundId;
  /** 銘柄名 */
  readonly fundName: FundName;
  /** 保有口数 */
  readonly totalUnits: Units;
  /** 平均取得単価（1万口あたり円） */
  readonly averageCost: Money;
  /** 投資総額 */
  readonly totalInvestment: Money;
  /** 最新基準価額（nullの場合はNAV未登録） */
  readonly currentNavValue: NavValue | null;
  /** 最新NAV日付（nullの場合はNAV未登録） */
  readonly currentNavDate: NavDate | null;
  /** 評価額（nullの場合はNAV未登録） */
  readonly currentValue: Money | null;
  /** 含み損益（nullの場合はNAV未登録） */
  readonly unrealizedGain: Money | null;
  /** 損益率（nullの場合はNAV未登録） */
  readonly unrealizedGainRate: Percentage | null;
};

/**
 * 保有情報を生成する
 *
 * @param params - 保有情報パラメータ
 * @returns Holding
 */
export function createHolding(params: {
  readonly fundId: FundId;
  readonly fundName: FundName;
  readonly totalUnits: Units;
  readonly averageCost: Money;
  readonly totalInvestment: Money;
  readonly currentNavValue: NavValue | null;
  readonly currentNavDate: NavDate | null;
  readonly currentValue: Money | null;
  readonly unrealizedGain: Money | null;
  readonly unrealizedGainRate: Percentage | null;
}): Holding {
  return {
    fundId: params.fundId,
    fundName: params.fundName,
    totalUnits: params.totalUnits,
    averageCost: params.averageCost,
    totalInvestment: params.totalInvestment,
    currentNavValue: params.currentNavValue,
    currentNavDate: params.currentNavDate,
    currentValue: params.currentValue,
    unrealizedGain: params.unrealizedGain,
    unrealizedGainRate: params.unrealizedGainRate,
  };
}
