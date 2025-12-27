/**
 * 積立設定API
 */

import { apiClient } from "./client";
import type {
  RecurringPurchase,
  RegisterRecurringPurchaseInput,
  ExecuteRecurringPurchasesInput,
} from "../types/api";

export const recurringApi = {
  /**
   * 積立設定一覧取得
   */
  list: async (): Promise<RecurringPurchase[]> => {
    const response = await apiClient.get<{
      recurringPurchases: RecurringPurchase[];
    }>("/recurring");
    return response.data.recurringPurchases;
  },

  /**
   * 積立設定登録
   */
  register: async (
    input: RegisterRecurringPurchaseInput
  ): Promise<RecurringPurchase> => {
    const response = await apiClient.post<{
      recurringPurchase: RecurringPurchase;
    }>("/recurring", input);
    return response.data.recurringPurchase;
  },

  /**
   * 積立一括実行
   */
  execute: async (
    input: ExecuteRecurringPurchasesInput
  ): Promise<{ executed: number; skipped: number }> => {
    const response = await apiClient.post<{
      summary: { executed: number; skipped: number };
    }>("/recurring/execute", input);
    return response.data.summary;
  },
};
