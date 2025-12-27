/**
 * 保有情報ドメインモジュール
 *
 * エクスポート:
 * - Holdingエンティティ
 * - 保有情報計算サービス
 */

// エンティティ
export { type Holding, createHolding } from "./entities/holding.js";

// 計算サービス
export {
  calculateHolding,
  calculateCurrentValue,
  calculateUnrealizedGain,
  calculateUnrealizedGainRate,
} from "./services/holding-calculator.js";
