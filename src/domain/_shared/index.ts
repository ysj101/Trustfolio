/**
 * Domain層共通モジュールのエクスポート
 */

// Value Objects
export type { Money } from "./value-objects/money.js";
export {
  createMoney,
  moneyFromNumber,
  moneyValue,
  ZERO_MONEY,
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  compareMoney,
  equalsMoney,
  formatMoney,
} from "./value-objects/money.js";

export type { Percentage } from "./value-objects/percentage.js";
export {
  createPercentage,
  percentageFromPercent,
  percentageValue,
  percentageToPercent,
  ZERO_PERCENTAGE,
  addPercentage,
  comparePercentage,
  formatPercentage,
  formatPercentageUnsigned,
} from "./value-objects/percentage.js";

// Entity IDs
export type {
  FundId,
  NavId,
  TransactionId,
  RecurringPurchaseId,
} from "./entity-id.js";

export {
  generateFundId,
  fundIdFromString,
  generateNavId,
  navIdFromString,
  generateTransactionId,
  transactionIdFromString,
  generateRecurringPurchaseId,
  recurringPurchaseIdFromString,
} from "./entity-id.js";
