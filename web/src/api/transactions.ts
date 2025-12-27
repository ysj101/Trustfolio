/**
 * 取引API
 */

import { apiClient } from "./client";
import type { Transaction, ExecuteSpotPurchaseInput } from "../types/api";

export const transactionsApi = {
  /**
   * 取引履歴取得
   */
  getHistory: async (fundId: string, limit?: number): Promise<Transaction[]> => {
    const params = limit ? { limit: String(limit) } : {};
    const response = await apiClient.get<{ transactions: Transaction[] }>(
      `/funds/${fundId}/transactions`,
      { params }
    );
    return response.data.transactions;
  },

  /**
   * スポット購入実行
   */
  executeSpotPurchase: async (
    fundId: string,
    input: ExecuteSpotPurchaseInput
  ): Promise<Transaction> => {
    const response = await apiClient.post<{ transaction: Transaction }>(
      `/funds/${fundId}/transactions/spot`,
      input
    );
    return response.data.transaction;
  },
};
