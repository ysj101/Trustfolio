/**
 * 基準価額リポジトリ実装
 *
 * SQLiteを使用した基準価額の永続化を担当する。
 */

import { and, eq, desc } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { type DatabaseConnection } from "../database/client.js";
import { navs } from "../database/schema/index.js";
import { type NavRepository } from "../../usecase/_shared/repository-interfaces.js";
import { type Nav, type NavDate, reconstituteNav, navDateFromString } from "../../domain/nav/index.js";
import { navValueFromNumber } from "../../domain/nav/index.js";
import { type FundId, navIdFromString, fundIdFromString } from "../../domain/_shared/index.js";
import { type RepositoryError, createRepositoryError } from "../../shared/errors/base-error.js";
import { tryCatch } from "../../shared/utils/result-helpers.js";

/**
 * 基準価額リポジトリを作成する
 *
 * @param db - データベース接続
 * @returns NavRepository
 */
export function createNavRepository(db: DatabaseConnection): NavRepository {
  return {
    findByFundAndDate: (
      fundId: FundId,
      date: NavDate
    ): ResultAsync<Nav | null, RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const row = db
                .select()
                .from(navs)
                .where(and(eq(navs.fundId, fundId), eq(navs.date, date)))
                .get();
              if (row === undefined) {
                return null;
              }
              return reconstituteNav({
                id: navIdFromString(row.id),
                fundId: fundIdFromString(row.fundId),
                date: navDateFromString(row.date),
                value: navValueFromNumber(row.value),
                createdAt: row.createdAt,
              });
            },
            (error) => createRepositoryError("基準価額の取得に失敗しました", error)
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

    findLatestByFund: (fundId: FundId): ResultAsync<Nav | null, RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const row = db
                .select()
                .from(navs)
                .where(eq(navs.fundId, fundId))
                .orderBy(desc(navs.date))
                .limit(1)
                .get();
              if (row === undefined) {
                return null;
              }
              return reconstituteNav({
                id: navIdFromString(row.id),
                fundId: fundIdFromString(row.fundId),
                date: navDateFromString(row.date),
                value: navValueFromNumber(row.value),
                createdAt: row.createdAt,
              });
            },
            (error) => createRepositoryError("最新基準価額の取得に失敗しました", error)
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

    findHistoryByFund: (
      fundId: FundId,
      limit?: number
    ): ResultAsync<readonly Nav[], RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              const baseQuery = db
                .select()
                .from(navs)
                .where(eq(navs.fundId, fundId))
                .orderBy(desc(navs.date));

              const rows = limit !== undefined
                ? baseQuery.limit(limit).all()
                : baseQuery.all();
              return rows.map((row) =>
                reconstituteNav({
                  id: navIdFromString(row.id),
                  fundId: fundIdFromString(row.fundId),
                  date: navDateFromString(row.date),
                  value: navValueFromNumber(row.value),
                  createdAt: row.createdAt,
                })
              );
            },
            (error) => createRepositoryError("基準価額履歴の取得に失敗しました", error)
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

    save: (nav: Nav): ResultAsync<void, RepositoryError> => {
      return ResultAsync.fromPromise(
        Promise.resolve(
          tryCatch(
            () => {
              // UPSERT: 同一銘柄・同一日付が存在すれば更新、なければ挿入
              db.insert(navs)
                .values({
                  id: nav.id,
                  fundId: nav.fundId,
                  date: nav.date,
                  value: nav.value,
                  createdAt: nav.createdAt,
                })
                .onConflictDoUpdate({
                  target: [navs.fundId, navs.date],
                  set: {
                    value: nav.value,
                    createdAt: nav.createdAt,
                  },
                })
                .run();
            },
            (error) => createRepositoryError("基準価額の保存に失敗しました", error)
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
