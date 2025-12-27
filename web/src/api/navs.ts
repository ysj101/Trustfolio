/**
 * 基準価額API
 */

import { apiClient } from "./client";
import type { Nav, RegisterNavInput } from "../types/api";

export const navsApi = {
  /**
   * 基準価額履歴取得
   */
  getHistory: async (fundId: string, limit?: number): Promise<Nav[]> => {
    const params = limit ? { limit: String(limit) } : {};
    const response = await apiClient.get<{ navs: Nav[] }>(
      `/funds/${fundId}/navs`,
      { params }
    );
    return response.data.navs;
  },

  /**
   * 基準価額登録
   */
  register: async (
    fundId: string,
    input: RegisterNavInput
  ): Promise<{ nav: Nav; isOverwritten: boolean }> => {
    const response = await apiClient.post<{ nav: Nav; isOverwritten: boolean }>(
      `/funds/${fundId}/navs`,
      input
    );
    return response.data;
  },
};
