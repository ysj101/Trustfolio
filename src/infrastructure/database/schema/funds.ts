/**
 * 投資信託テーブルスキーマ
 *
 * 投資信託の銘柄情報を格納する。
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * 投資信託テーブル
 */
export const funds = sqliteTable("funds", {
  /** 投資信託ID（ULID） */
  id: text("id").primaryKey(),
  /** 銘柄名 */
  name: text("name").notNull().unique(),
  /** 登録日時（Unix timestamp ミリ秒） */
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * 投資信託テーブルのSELECT結果型
 */
export type FundRow = typeof funds.$inferSelect;

/**
 * 投資信託テーブルのINSERT入力型
 */
export type FundInsert = typeof funds.$inferInsert;
