/**
 * ポートフォリオAPIルート
 *
 * エンドポイント:
 * - GET /api/portfolio: ポートフォリオ全体取得
 */

import { Hono } from "hono";
import { type Repositories } from "../../../usecase/_shared/repository-interfaces.js";
import { getPortfolioSummary } from "../../../usecase/portfolio/index.js";
import { toPortfolioResponseDto } from "../dto/portfolio-dto.js";
import { toErrorResponseDto, getHttpStatusCode } from "../dto/error-dto.js";

/**
 * ポートフォリオルートを作成する
 *
 * @param repos - リポジトリ
 * @returns Honoアプリ
 */
export function createPortfolioRoutes(repos: Repositories): Hono {
  const app = new Hono();

  /**
   * GET /api/portfolio - ポートフォリオ全体取得
   */
  app.get("/", async (c) => {
    const result = await getPortfolioSummary(repos);

    if (result.isErr()) {
      const error = result.error;
      return c.json(toErrorResponseDto(error), getHttpStatusCode(error.type));
    }

    return c.json(toPortfolioResponseDto(result.value.portfolio));
  });

  return app;
}
