/**
 * 積立設定リポジトリ実装
 *
 * SQLiteを使用した積立設定の永続化を担当する。
 */

import { eq, and } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { type DatabaseConnection } from "../database/client.js";
import { recurringPurchases } from "../database/schema/index.js";
import { type RecurringPurchaseRepository } from "../../usecase/_shared/repository-interfaces.js";
import {
  type RecurringPurchase,
  reconstituteRecurringPurchase,
  executionDayFromNumber,
  recurringDateFromString,
} from "../../domain/recurring/index.js";
import {
  type FundId,
  type RecurringPurchaseId,
  recurringPurchaseIdFromString,
  fundIdFromString,
} from "../../domain/_shared/index.js";
import { moneyFromNumber } from "../../domain/_shared/value-objects/money.js";
import { type RepositoryError, createRepositoryError } from "../../shared/errors/base-error.js";
import { tryCatch } from "../../shared/utils/result-helpers.js";

/**
 * 積立設定リポジトリを作成する
 *
 * @param db - データベース接続
 * @returns RecurringPurchaseRepository
 */
export function createRecurringPurchaseRepository(
  db: DatabaseConnection
): RecurringPurchaseRepository {
  return {
    save: (recurringPurchase: RecurringPurchase): ResultAsync<void, RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              db.insert(recurringPurchases)
                .values({
                  id: recurringPurchase.id,
                  fundId: recurringPurchase.fundId,
                  monthlyAmount: recurringPurchase.monthlyAmount as number,
                  executionDay: recurringPurchase.executionDay as number,
                  startDate: recurringPurchase.startDate as string,
                  endDate: recurringPurchase.endDate as string | null,
                  isActive: recurringPurchase.isActive,
                  createdAt: recurringPurchase.createdAt,
                })
                .run();
            },
            (error) => createRepositoryError("積立設定の保存に失敗しました", error)
          )
        ).then((result) => {
          if (result.isErr()) {
            return Promise.reject(result.error);
          }
          return undefined;
        }),
        (error) => error as RepositoryError
      );
    },

    findById: (
      id: RecurringPurchaseId
    ): ResultAsync<RecurringPurchase | null, RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const row = db
                .select()
                .from(recurringPurchases)
                .where(eq(recurringPurchases.id, id))
                .get();
              if (row === undefined) {
                return null;
              }
              return reconstituteRecurringPurchase({
                id: recurringPurchaseIdFromString(row.id),
                fundId: fundIdFromString(row.fundId),
                monthlyAmount: moneyFromNumber(row.monthlyAmount),
                executionDay: executionDayFromNumber(row.executionDay),
                startDate: recurringDateFromString(row.startDate),
                endDate: row.endDate !== null
                  ? recurringDateFromString(row.endDate)
                  : null,
                isActive: row.isActive,
                createdAt: row.createdAt,
              });
            },
            (error) => createRepositoryError("積立設定の取得に失敗しました", error)
          )
        ).then((result) => {
          if (result.isErr()) {
            return Promise.reject(result.error);
          }
          return result.value;
        }),
        (error) => error as RepositoryError
      );
    },

    findActiveByFund: (
      fundId: FundId
    ): ResultAsync<readonly RecurringPurchase[], RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const rows = db
                .select()
                .from(recurringPurchases)
                .where(
                  and(
                    eq(recurringPurchases.fundId, fundId),
                    eq(recurringPurchases.isActive, true)
                  )
                )
                .all();
              return rows.map((row) =>
                reconstituteRecurringPurchase({
                  id: recurringPurchaseIdFromString(row.id),
                  fundId: fundIdFromString(row.fundId),
                  monthlyAmount: moneyFromNumber(row.monthlyAmount),
                  executionDay: executionDayFromNumber(row.executionDay),
                  startDate: recurringDateFromString(row.startDate),
                  endDate: row.endDate !== null
                    ? recurringDateFromString(row.endDate)
                    : null,
                  isActive: row.isActive,
                  createdAt: row.createdAt,
                })
              );
            },
            (error) => createRepositoryError("アクティブな積立設定の取得に失敗しました", error)
          )
        ).then((result) => {
          if (result.isErr()) {
            return Promise.reject(result.error);
          }
          return result.value;
        }),
        (error) => error as RepositoryError
      );
    },

    findAll: (): ResultAsync<readonly RecurringPurchase[], RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const rows = db
                .select()
                .from(recurringPurchases)
                .all();
              return rows.map((row) =>
                reconstituteRecurringPurchase({
                  id: recurringPurchaseIdFromString(row.id),
                  fundId: fundIdFromString(row.fundId),
                  monthlyAmount: moneyFromNumber(row.monthlyAmount),
                  executionDay: executionDayFromNumber(row.executionDay),
                  startDate: recurringDateFromString(row.startDate),
                  endDate: row.endDate !== null
                    ? recurringDateFromString(row.endDate)
                    : null,
                  isActive: row.isActive,
                  createdAt: row.createdAt,
                })
              );
            },
            (error) => createRepositoryError("全積立設定の取得に失敗しました", error)
          )
        ).then((result) => {
          if (result.isErr()) {
            return Promise.reject(result.error);
          }
          return result.value;
        }),
        (error) => error as RepositoryError
      );
    },

    findAllActive: (): ResultAsync<readonly RecurringPurchase[], RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const rows = db
                .select()
                .from(recurringPurchases)
                .where(eq(recurringPurchases.isActive, true))
                .all();
              return rows.map((row) =>
                reconstituteRecurringPurchase({
                  id: recurringPurchaseIdFromString(row.id),
                  fundId: fundIdFromString(row.fundId),
                  monthlyAmount: moneyFromNumber(row.monthlyAmount),
                  executionDay: executionDayFromNumber(row.executionDay),
                  startDate: recurringDateFromString(row.startDate),
                  endDate: row.endDate !== null
                    ? recurringDateFromString(row.endDate)
                    : null,
                  isActive: row.isActive,
                  createdAt: row.createdAt,
                })
              );
            },
            (error) => createRepositoryError("全アクティブ積立設定の取得に失敗しました", error)
          )
        ).then((result) => {
          if (result.isErr()) {
            return Promise.reject(result.error);
          }
          return result.value;
        }),
        (error) => error as RepositoryError
      );
    },
  };
}
