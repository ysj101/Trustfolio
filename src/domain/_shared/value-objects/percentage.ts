/**
 * 割合Value Object
 *
 * パーセンテージを表現する不変オブジェクト。
 * 内部的には小数（0.01 = 1%）で保持する。
 *
 * 設計方針:
 * - 負の割合も許容する（損益率等で使用）
 * - 表示時は小数第2位までを表示
 */

import { type Branded } from "../../../shared/types/branded.js";

/**
 * 割合の内部表現
 *
 * 0.01 = 1%、-0.05 = -5% のように表現する。
 */
export type Percentage = Branded<number, "Percentage">;

/**
 * 割合を生成する
 *
 * @param value - 割合（小数表現。0.01 = 1%）
 * @returns Percentage
 *
 * @example
 * ```typescript
 * const rate = createPercentage(0.1234); // 12.34%
 * ```
 */
export function createPercentage(value: number): Percentage {
  if (!Number.isFinite(value)) {
    return 0 as Percentage;
  }
  return value as Percentage;
}

/**
 * パーセント値からPercentageを生成する
 *
 * @param percent - パーセント値（12.34なら12.34%）
 * @returns Percentage
 *
 * @example
 * ```typescript
 * const rate = percentageFromPercent(12.34); // 12.34% = 0.1234
 * ```
 */
export function percentageFromPercent(percent: number): Percentage {
  return createPercentage(percent / 100);
}

/**
 * Percentageの生値を取得する（小数表現）
 *
 * @param percentage - Percentage型の値
 * @returns 小数表現（0.01 = 1%）
 */
export function percentageValue(percentage: Percentage): number {
  return percentage as number;
}

/**
 * Percentageをパーセント値で取得する
 *
 * @param percentage - Percentage型の値
 * @returns パーセント値（1% = 1.0）
 */
export function percentageToPercent(percentage: Percentage): number {
  return percentageValue(percentage) * 100;
}

/**
 * ゼロパーセントを表すPercentage
 */
export const ZERO_PERCENTAGE: Percentage = 0 as Percentage;

/**
 * 2つの割合を加算する
 *
 * @param a - 加算元
 * @param b - 加算する値
 * @returns 加算結果
 */
export function addPercentage(a: Percentage, b: Percentage): Percentage {
  return createPercentage(percentageValue(a) + percentageValue(b));
}

/**
 * 2つの割合を比較する
 *
 * @param a - 比較元
 * @param b - 比較対象
 * @returns a > b なら正、a < b なら負、等しければ0
 */
export function comparePercentage(a: Percentage, b: Percentage): number {
  return percentageValue(a) - percentageValue(b);
}

/**
 * 割合を表示用文字列にフォーマットする
 *
 * 小数第2位までを表示し、正の値には+符号を付与する。
 *
 * @param percentage - フォーマット対象
 * @returns フォーマット済み文字列（例: "+12.34%", "-5.67%", "0.00%"）
 */
export function formatPercentage(percentage: Percentage): string {
  const percent = percentageToPercent(percentage);
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

/**
 * 割合を符号なしでフォーマットする
 *
 * @param percentage - フォーマット対象
 * @returns フォーマット済み文字列（例: "12.34%"）
 */
export function formatPercentageUnsigned(percentage: Percentage): string {
  const percent = percentageToPercent(percentage);
  return `${percent.toFixed(2)}%`;
}
