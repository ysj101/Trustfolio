/**
 * 取引APIルート
 *
 * エンドポイント:
 * - POST /api/funds/:fundId/transactions: スポット購入
 * - GET /api/funds/:fundId/transactions: 取引履歴取得
 */

import { Hono } from "hono";
import { type Repositories } from "../../../usecase/_shared/repository-interfaces.js";
import { executeSpotPurchase } from "../../../usecase/transaction/execute-spot-purchase.js";
import { getTransactionHistory } from "../../../usecase/transaction/get-transaction-history.js";
import { toTransactionResponseDto, type ExecuteSpotPurchaseRequestDto } from "../dto/transaction-dto.js";
import { toErrorResponseDto, getHttpStatusCode } from "../dto/error-dto.js";

/**
 * 取引ルートを作成する
 *
 * @param repos - リポジトリ
 * @returns Honoアプリ
 */
export function createTransactionRoutes(repos: Repositories): Hono {
  const app = new Hono();

  /**
   * POST /api/funds/:fundId/transactions - スポット購入
   */
  app.post("/:fundId/transactions", async (c) => {
    const fundId = c.req.param("fundId");
    const body = await c.req.json<ExecuteSpotPurchaseRequestDto>();

    const result = await executeSpotPurchase(repos, {
      fundId,
      date: body.date,
      amount: body.amount,
      ...(body.fee !== undefined && { fee: body.fee }),
    });

    if (result.isErr()) {
      const error = result.error;
      return c.json(toErrorResponseDto(error), getHttpStatusCode(error.type));
    }

    return c.json(
      {
        transaction: toTransactionResponseDto(result.value.transaction),
      },
      201
    );
  });

  /**
   * GET /api/funds/:fundId/transactions - 取引履歴取得
   */
  app.get("/:fundId/transactions", async (c) => {
    const fundId = c.req.param("fundId");
    const limitParam = c.req.query("limit");

    const result = await getTransactionHistory(
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
      transactions: result.value.transactions.map(toTransactionResponseDto),
    });
  });

  return app;
}
