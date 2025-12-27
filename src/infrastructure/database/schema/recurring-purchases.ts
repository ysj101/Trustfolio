/**
 * 積立設定テーブルスキーマ
 *
 * 投資信託の積立購入設定を格納する。
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { funds } from "./funds.js";

/**
 * 積立設定テーブル
 */
export const recurringPurchases = sqliteTable(
  "recurring_purchases",
  {
    /** 積立設定ID（ULID） */
    id: text("id").primaryKey(),
    /** 投資信託ID（外部キー） */
    fundId: text("fund_id")
      .notNull()
      .references(() => funds.id),
    /** 月額購入金額（円） */
    monthlyAmount: integer("monthly_amount").notNull(),
    /** 毎月の実行日（1〜28） */
    executionDay: integer("execution_day").notNull(),
    /** 開始日（YYYY-MM-DD） */
    startDate: text("start_date").notNull(),
    /** 終了日（YYYY-MM-DD、nullの場合は無期限） */
    endDate: text("end_date"),
    /** アクティブ状態 */
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    /** 登録日時（Unix timestamp ミリ秒） */
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  }
);

/**
 * 積立設定テーブルのSELECT結果型
 */
export type RecurringPurchaseRow = typeof recurringPurchases.$inferSelect;

/**
 * 積立設定テーブルのINSERT入力型
 */
export type RecurringPurchaseInsert = typeof recurringPurchases.$inferInsert;
