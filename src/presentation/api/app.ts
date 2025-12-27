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
import { createTransactionRoutes } from "./routes/transaction-routes.js";
import { createRecurringRoutes } from "./routes/recurring-routes.js";
import { createHoldingRoutes } from "./routes/holding-routes.js";
import { createPortfolioRoutes } from "./routes/portfolio-routes.js";

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

  // 取引ルート（/api/funds/:fundId/transactions）
  app.route("/api/funds", createTransactionRoutes(repos));

  // 積立設定ルート（/api/recurring）
  app.route("/api/recurring", createRecurringRoutes(repos));

  // 保有情報ルート（/api/funds/:fundId/holding）
  app.route("/api/funds", createHoldingRoutes(repos));

  // ポートフォリオルート（/api/portfolio）
  app.route("/api/portfolio", createPortfolioRoutes(repos));

  return app;
}
