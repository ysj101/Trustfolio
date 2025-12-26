/**
 * 基準価額APIルート
 *
 * エンドポイント:
 * - POST /api/funds/:fundId/navs: 基準価額登録
 * - GET /api/funds/:fundId/navs: 基準価額履歴取得
 */

import { Hono } from "hono";
import { type Repositories } from "../../../usecase/_shared/repository-interfaces.js";
import { registerNav } from "../../../usecase/nav/register-nav.js";
import { getNavHistory } from "../../../usecase/nav/get-nav-history.js";
import { toNavResponseDto, type RegisterNavRequestDto } from "../dto/nav-dto.js";
import { toErrorResponseDto, getHttpStatusCode } from "../dto/error-dto.js";

/**
 * 基準価額ルートを作成する
 *
 * @param repos - リポジトリ
 * @returns Honoアプリ
 */
export function createNavRoutes(repos: Repositories): Hono {
  const app = new Hono();

  /**
   * POST /api/funds/:fundId/navs - 基準価額登録
   */
  app.post("/:fundId/navs", async (c) => {
    const fundId = c.req.param("fundId");
    const body = await c.req.json<RegisterNavRequestDto>();

    const result = await registerNav(repos, {
      fundId,
      date: body.date,
      value: body.value,
    });

    if (result.isErr()) {
      const error = result.error;
      return c.json(toErrorResponseDto(error), getHttpStatusCode(error.type));
    }

    const status = result.value.isOverwritten ? 200 : 201;
    return c.json(
      {
        nav: toNavResponseDto(result.value.nav),
        isOverwritten: result.value.isOverwritten,
      },
      status
    );
  });

  /**
   * GET /api/funds/:fundId/navs - 基準価額履歴取得
   */
  app.get("/:fundId/navs", async (c) => {
    const fundId = c.req.param("fundId");
    const limitParam = c.req.query("limit");

    // limitが指定された場合のみ含める
    const result = await getNavHistory(
      repos,
      limitParam !== undefined
        ? { fundId, limit: parseInt(limitParam, 10) }
        : { fundId }
    );

    if (result.isErr()) {
      const error = result.error;
      return c.json(toErrorResponseDto(error), getHttpStatusCode(error.type));
    }

    return c.json({
      navs: result.value.navs.map(toNavResponseDto),
    });
  });

  return app;
}
