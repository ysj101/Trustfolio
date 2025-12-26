/**
 * 投資信託ユースケースのエクスポート
 */

export type {
  RegisterFundInput,
  RegisterFundOutput,
  RegisterFundError,
} from "./register-fund.js";
export { registerFund } from "./register-fund.js";

export type { ListFundsOutput, ListFundsError } from "./list-funds.js";
export { listFunds } from "./list-funds.js";
