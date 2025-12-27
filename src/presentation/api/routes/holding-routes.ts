/**
 * 保有情報APIルート
 *
 * エンドポイント:
 * - GET /api/funds/:fundId/holding: 個別保有情報取得
 */

import { Hono } from "hono";
import { type Repositories } from "../../../usecase/_shared/repository-interfaces.js";
import { getHolding } from "../../../usecase/holding/index.js";
import { toHoldingResponseDto } from "../dto/holding-dto.js";
import { toErrorResponseDto, getHttpStatusCode } from "../dto/error-dto.js";

/**
 * 保有情報ルートを作成する
 *
 * @param repos - リポジトリ
 * @returns Honoアプリ
 */
export function createHoldingRoutes(repos: Repositories): Hono {
  const app = new Hono();

  /**
   * GET /api/funds/:fundId/holding - 個別保有情報取得
   */
  app.get("/:fundId/holding", async (c) => {
    const fundId = c.req.param("fundId");

    const result = await getHolding(repos, { fundId });

    if (result.isErr()) {
      const error = result.error;
      return c.json(toErrorResponseDto(error), getHttpStatusCode(error.type));
    }

    const holding = result.value.holding;

    if (holding === null) {
      // 取引がない場合は空の状態を返す
      return c.json({ holding: null });
    }

    return c.json({
      holding: toHoldingResponseDto(holding),
    });
  });

  return app;
}
