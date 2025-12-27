/**
 * 取引ドメイン層のエクスポート
 */

// エンティティ
export {
  type Transaction,
  type CreateSpotTransactionParams,
  type CreateRecurringTransactionParams,
  createSpotTransaction,
  createRecurringTransaction,
  reconstituteTransaction,
} from "./entities/transaction.js";

// 値オブジェクト
export {
  type Units,
  createUnits,
  unitsFromNumber,
  unitsValue,
  addUnits,
  subtractUnits,
  compareUnits,
  equalsUnits,
  formatUnits,
} from "./value-objects/units.js";

export {
  type TransactionType,
  TRANSACTION_TYPES,
  isTransactionType,
  transactionTypeFromString,
  formatTransactionType,
} from "./value-objects/transaction-type.js";

export {
  type TransactionDate,
  createTransactionDate,
  transactionDateFromDate,
  transactionDateFromString,
  transactionDateValue,
  transactionDateToDate,
  compareTransactionDate,
} from "./value-objects/transaction-date.js";

export {
  type IdempotencyKey,
  createIdempotencyKey,
  createIdempotencyKeyFromRecurring,
  idempotencyKeyFromString,
  idempotencyKeyValue,
} from "./value-objects/idempotency-key.js";

// サービス
export {
  calculateUnits,
  calculateValue,
} from "./services/purchase-calculator.js";
