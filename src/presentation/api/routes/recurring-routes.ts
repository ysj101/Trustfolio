/**
 * 積立設定APIルート
 *
 * エンドポイント:
 * - POST /api/recurring: 積立設定登録
 * - GET /api/recurring: 積立設定一覧
 * - POST /api/recurring/execute: 積立一括実行
 */

import { Hono } from "hono";
import { type Repositories } from "../../../usecase/_shared/repository-interfaces.js";
import { registerRecurringPurchase } from "../../../usecase/recurring/register-recurring-purchase.js";
import { listRecurringPurchases } from "../../../usecase/recurring/list-recurring-purchases.js";
import { executeRecurringPurchases } from "../../../usecase/recurring/execute-recurring-purchases.js";
import {
  toRecurringPurchaseResponseDto,
  toSkippedRecurringDto,
  type RegisterRecurringPurchaseRequestDto,
  type ExecuteRecurringPurchasesRequestDto,
} from "../dto/recurring-dto.js";
import { toTransactionResponseDto } from "../dto/transaction-dto.js";
import { toErrorResponseDto, getHttpStatusCode } from "../dto/error-dto.js";

/**
 * 積立設定ルートを作成する
 *
 * @param repos - リポジトリ
 * @returns Honoアプリ
 */
export function createRecurringRoutes(repos: Repositories): Hono {
  const app = new Hono();

  /**
   * POST /api/recurring - 積立設定登録
   */
  app.post("/", async (c) => {
    const body = await c.req.json<RegisterRecurringPurchaseRequestDto>();

    const result = await registerRecurringPurchase(repos, {
      fundId: body.fundId,
      monthlyAmount: body.monthlyAmount,
      executionDay: body.executionDay,
      startDate: body.startDate,
      ...(body.endDate !== undefined && { endDate: body.endDate }),
    });

    if (result.isErr()) {
      const error = result.error;
      return c.json(toErrorResponseDto(error), getHttpStatusCode(error.type));
    }

    return c.json(
      {
        recurringPurchase: toRecurringPurchaseResponseDto(result.value.recurringPurchase),
      },
      201
    );
  });

  /**
   * GET /api/recurring - 積立設定一覧
   */
  app.get("/", async (c) => {
    const result = await listRecurringPurchases(repos);

    if (result.isErr()) {
      const error = result.error;
      return c.json(toErrorResponseDto(error), getHttpStatusCode(error.type));
    }

    return c.json({
      recurringPurchases: result.value.recurringPurchases.map(toRecurringPurchaseResponseDto),
    });
  });

  /**
   * POST /api/recurring/execute - 積立一括実行
   */
  app.post("/execute", async (c) => {
    const body = await c.req.json<ExecuteRecurringPurchasesRequestDto>();

    const result = await executeRecurringPurchases(repos, {
      targetDate: body.targetDate,
    });

    if (result.isErr()) {
      const error = result.error;
      return c.json(toErrorResponseDto(error), getHttpStatusCode(error.type));
    }

    return c.json({
      executed: result.value.executed.map(toTransactionResponseDto),
      skipped: result.value.skipped.map(toSkippedRecurringDto),
    });
  });

  return app;
}
