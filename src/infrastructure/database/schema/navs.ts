/**
 * 基準価額テーブルスキーマ
 *
 * 投資信託の日次基準価額を格納する。
 * 同一日付・同一銘柄につき1件のみ許容。
 */

import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";
import { funds } from "./funds.js";

/**
 * 基準価額テーブル
 */
export const navs = sqliteTable(
  "navs",
  {
    /** 基準価額ID（ULID） */
    id: text("id").primaryKey(),
    /** 投資信託ID（外部キー） */
    fundId: text("fund_id")
      .notNull()
      .references(() => funds.id),
    /** 基準価額日付（YYYY-MM-DD） */
    date: text("date").notNull(),
    /** 基準価額（1万口あたり円） */
    value: integer("value").notNull(),
    /** 登録日時（Unix timestamp ミリ秒） */
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    /** 同一銘柄・同一日付の一意制約 */
    unique("navs_fund_date_unique").on(table.fundId, table.date),
  ]
);

/**
 * 基準価額テーブルのSELECT結果型
 */
export type NavRow = typeof navs.$inferSelect;

/**
 * 基準価額テーブルのINSERT入力型
 */
export type NavInsert = typeof navs.$inferInsert;
