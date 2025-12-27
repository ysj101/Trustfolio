/**
 * 取引リポジトリ実装
 *
 * SQLiteを使用した取引の永続化を担当する。
 */

import { eq, desc } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { type DatabaseConnection } from "../database/client.js";
import { transactions } from "../database/schema/index.js";
import { type TransactionRepository } from "../../usecase/_shared/repository-interfaces.js";
import {
  type Transaction,
  type IdempotencyKey,
  reconstituteTransaction,
  transactionDateFromString,
  transactionTypeFromString,
  idempotencyKeyFromString,
  unitsFromNumber,
} from "../../domain/transaction/index.js";
import {
  type FundId,
  transactionIdFromString,
  fundIdFromString,
  recurringPurchaseIdFromString,
} from "../../domain/_shared/index.js";
import { navValueFromNumber } from "../../domain/nav/index.js";
import { moneyFromNumber } from "../../domain/_shared/value-objects/money.js";
import { type RepositoryError, createRepositoryError } from "../../shared/errors/base-error.js";
import { tryCatch } from "../../shared/utils/result-helpers.js";

/**
 * 取引リポジトリを作成する
 *
 * @param db - データベース接続
 * @returns TransactionRepository
 */
export function createTransactionRepository(db: DatabaseConnection): TransactionRepository {
  return {
    save: (transaction: Transaction): ResultAsync<void, RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              db.insert(transactions)
                .values({
                  id: transaction.id,
                  fundId: transaction.fundId,
                  type: transaction.type,
                  date: transaction.date as string,
                  amount: transaction.amount as number,
                  fee: transaction.fee as number,
                  navValue: transaction.navValue as number,
                  units: transaction.units as number,
                  recurringPurchaseId: transaction.recurringPurchaseId,
                  idempotencyKey: transaction.idempotencyKey as string | null,
                  createdAt: transaction.createdAt,
                })
                .run();
            },
            (error) => createRepositoryError("取引の保存に失敗しました", error)
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

    findByIdempotencyKey: (
      key: IdempotencyKey
    ): ResultAsync<Transaction | null, RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const row = db
                .select()
                .from(transactions)
                .where(eq(transactions.idempotencyKey, key as string))
                .get();
              if (row === undefined) {
                return null;
              }
              return reconstituteTransaction({
                id: transactionIdFromString(row.id),
                fundId: fundIdFromString(row.fundId),
                type: transactionTypeFromString(row.type),
                date: transactionDateFromString(row.date),
                amount: moneyFromNumber(row.amount),
                fee: moneyFromNumber(row.fee),
                navValue: navValueFromNumber(row.navValue),
                units: unitsFromNumber(row.units),
                recurringPurchaseId: row.recurringPurchaseId !== null
                  ? recurringPurchaseIdFromString(row.recurringPurchaseId)
                  : null,
                idempotencyKey: row.idempotencyKey !== null
                  ? idempotencyKeyFromString(row.idempotencyKey)
                  : null,
                createdAt: row.createdAt,
              });
            },
            (error) => createRepositoryError("取引の取得に失敗しました", error)
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

    findByFund: (
      fundId: FundId,
      limit?: number
    ): ResultAsync<readonly Transaction[], RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const baseQuery = db
                .select()
                .from(transactions)
                .where(eq(transactions.fundId, fundId))
                .orderBy(desc(transactions.date));

              const rows = limit !== undefined
                ? baseQuery.limit(limit).all()
                : baseQuery.all();
              return rows.map((row) =>
                reconstituteTransaction({
                  id: transactionIdFromString(row.id),
                  fundId: fundIdFromString(row.fundId),
                  type: transactionTypeFromString(row.type),
                  date: transactionDateFromString(row.date),
                  amount: moneyFromNumber(row.amount),
                  fee: moneyFromNumber(row.fee),
                  navValue: navValueFromNumber(row.navValue),
                  units: unitsFromNumber(row.units),
                  recurringPurchaseId: row.recurringPurchaseId !== null
                    ? recurringPurchaseIdFromString(row.recurringPurchaseId)
                    : null,
                  idempotencyKey: row.idempotencyKey !== null
                    ? idempotencyKeyFromString(row.idempotencyKey)
                    : null,
                  createdAt: row.createdAt,
                })
              );
            },
            (error) => createRepositoryError("取引履歴の取得に失敗しました", error)
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

    findAll: (): ResultAsync<readonly Transaction[], RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const rows = db
                .select()
                .from(transactions)
                .orderBy(desc(transactions.date))
                .all();
              return rows.map((row) =>
                reconstituteTransaction({
                  id: transactionIdFromString(row.id),
                  fundId: fundIdFromString(row.fundId),
                  type: transactionTypeFromString(row.type),
                  date: transactionDateFromString(row.date),
                  amount: moneyFromNumber(row.amount),
                  fee: moneyFromNumber(row.fee),
                  navValue: navValueFromNumber(row.navValue),
                  units: unitsFromNumber(row.units),
                  recurringPurchaseId: row.recurringPurchaseId !== null
                    ? recurringPurchaseIdFromString(row.recurringPurchaseId)
                    : null,
                  idempotencyKey: row.idempotencyKey !== null
                    ? idempotencyKeyFromString(row.idempotencyKey)
                    : null,
                  createdAt: row.createdAt,
                })
              );
            },
            (error) => createRepositoryError("全取引の取得に失敗しました", error)
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
