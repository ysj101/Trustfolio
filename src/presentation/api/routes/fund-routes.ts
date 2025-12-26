/**
 * 投資信託APIルート
 *
 * エンドポイント:
 * - POST /api/funds: 投資信託登録
 * - GET /api/funds: 投資信託一覧取得
 */

import { Hono } from "hono";
import { type Repositories } from "../../../usecase/_shared/repository-interfaces.js";
import { registerFund } from "../../../usecase/fund/register-fund.js";
import { listFunds } from "../../../usecase/fund/list-funds.js";
import { toFundResponseDto, type RegisterFundRequestDto } from "../dto/fund-dto.js";
import { toErrorResponseDto, getHttpStatusCode } from "../dto/error-dto.js";

/**
 * 投資信託ルートを作成する
 *
 * @param repos - リポジトリ
 * @returns Honoアプリ
 */
export function createFundRoutes(repos: Repositories): Hono {
  const app = new Hono();

  /**
   * POST /api/funds - 投資信託登録
   */
  app.post("/", async (c) => {
    const body = await c.req.json<RegisterFundRequestDto>();

    const result = await registerFund(repos.fund, { name: body.name });

    if (result.isErr()) {
      const error = result.error;
      return c.json(toErrorResponseDto(error), getHttpStatusCode(error.type));
    }

    return c.json(toFundResponseDto(result.value.fund), 201 as const);
  });

  /**
   * GET /api/funds - 投資信託一覧取得
   */
  app.get("/", async (c) => {
    const result = await listFunds(repos.fund);

    if (result.isErr()) {
      const error = result.error;
      return c.json(toErrorResponseDto(error), getHttpStatusCode(error.type));
    }

    return c.json({
      funds: result.value.funds.map(toFundResponseDto),
    });
  });

  return app;
}
