/**
 * 投資信託コンテキストのエクスポート
 */

// Entities
export type { Fund, CreateFundParams } from "./entities/fund.js";
export { createFund, reconstituteFund } from "./entities/fund.js";

// Value Objects
export type { FundName } from "./value-objects/fund-name.js";
export {
  createFundName,
  fundNameFromString,
  fundNameValue,
} from "./value-objects/fund-name.js";
