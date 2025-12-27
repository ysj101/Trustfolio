/**
 * ポートフォリオAPI
 */

import { apiClient } from "./client";
import type { Holding, Portfolio } from "../types/api";

export const portfolioApi = {
  /**
   * ポートフォリオ全体取得
   */
  getSummary: async (): Promise<Portfolio> => {
    const response = await apiClient.get<Portfolio>("/portfolio");
    return response.data;
  },

  /**
   * 個別保有情報取得
   */
  getHolding: async (fundId: string): Promise<Holding | null> => {
    const response = await apiClient.get<{ holding: Holding | null }>(
      `/funds/${fundId}/holding`
    );
    return response.data.holding;
  },
};
