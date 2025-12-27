/**
 * API クライアント設定
 */

import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// エラーハンドリング
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // エラーレスポンスの統一処理
    if (axios.isAxiosError(error) && error.response) {
      const data = error.response.data as { type?: string; message?: string };
      if (data.message) {
        return Promise.reject(new Error(data.message));
      }
    }
    return Promise.reject(error);
  }
);
