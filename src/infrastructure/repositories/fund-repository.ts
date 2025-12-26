/**
 * 投資信託リポジトリ実装
 *
 * SQLiteを使用した投資信託の永続化を担当する。
 */

import { eq } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { type DatabaseConnection } from "../database/client.js";
import { funds } from "../database/schema/index.js";
import { type FundRepository } from "../../usecase/_shared/repository-interfaces.js";
import { type Fund, reconstituteFund } from "../../domain/fund/index.js";
import { fundNameFromString } from "../../domain/fund/index.js";
import { type FundId, fundIdFromString } from "../../domain/_shared/index.js";
import { type RepositoryError, createRepositoryError } from "../../shared/errors/base-error.js";
import { tryCatch } from "../../shared/utils/result-helpers.js";

/**
 * 投資信託リポジトリを作成する
 *
 * @param db - データベース接続
 * @returns FundRepository
 */
export function createFundRepository(db: DatabaseConnection): FundRepository {
  return {
    findById: (id: FundId): ResultAsync<Fund | null, RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const row = db.select().from(funds).where(eq(funds.id, id)).get();
              if (row === undefined) {
                return null;
              }
              return reconstituteFund({
                id: fundIdFromString(row.id),
                name: fundNameFromString(row.name),
                createdAt: row.createdAt,
              });
            },
            (error) => createRepositoryError("投資信託の取得に失敗しました", error)
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

    findAll: (): ResultAsync<readonly Fund[], RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const rows = db
                .select()
                .from(funds)
                .orderBy(funds.createdAt)
                .all();
              return rows.map((row) =>
                reconstituteFund({
                  id: fundIdFromString(row.id),
                  name: fundNameFromString(row.name),
                  createdAt: row.createdAt,
                })
              );
            },
            (error) => createRepositoryError("投資信託一覧の取得に失敗しました", error)
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

    findByName: (name: string): ResultAsync<Fund | null, RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const row = db
                .select()
                .from(funds)
                .where(eq(funds.name, name))
                .get();
              if (row === undefined) {
                return null;
              }
              return reconstituteFund({
                id: fundIdFromString(row.id),
                name: fundNameFromString(row.name),
                createdAt: row.createdAt,
              });
            },
            (error) => createRepositoryError("投資信託の検索に失敗しました", error)
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

    save: (fund: Fund): ResultAsync<void, RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              db.insert(funds)
                .values({
                  id: fund.id,
                  name: fund.name,
                  createdAt: fund.createdAt,
                })
                .run();
            },
            (error) => createRepositoryError("投資信託の保存に失敗しました", error)
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
  };
}
