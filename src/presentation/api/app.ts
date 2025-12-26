/**
 * Hono アプリケーション
 *
 * 投資信託ポートフォリオ管理APIのメインアプリケーション。
 * 全ルートを統合し、共通ミドルウェアを適用する。
 */

import { Hono } from "hono";
import { type Repositories } from "../../usecase/_shared/repository-interfaces.js";
import { createFundRoutes } from "./routes/fund-routes.js";
import { createNavRoutes } from "./routes/nav-routes.js";

/**
 * APIアプリケーションを作成する
 *
 * @param repos - リポジトリ
 * @returns Honoアプリ
 */
export function createApp(repos: Repositories): Hono {
  const app = new Hono();

  // ヘルスチェックエンドポイント
  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  // 投資信託ルート
  app.route("/api/funds", createFundRoutes(repos));

  // 基準価額ルート（/api/funds/:fundId/navs）
  app.route("/api/funds", createNavRoutes(repos));

  return app;
}
