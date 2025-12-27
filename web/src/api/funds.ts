/**
 * 投資信託API
 */

import { apiClient } from "./client";
import type { Fund, RegisterFundInput } from "../types/api";

export const fundsApi = {
  /**
   * 投資信託一覧取得
   */
  list: async (): Promise<Fund[]> => {
    const response = await apiClient.get<{ funds: Fund[] }>("/funds");
    return response.data.funds;
  },

  /**
   * 投資信託登録
   */
  register: async (input: RegisterFundInput): Promise<Fund> => {
    const response = await apiClient.post<Fund>("/funds", input);
    return response.data;
  },
};
