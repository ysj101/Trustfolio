/**
 * 取引テーブルスキーマ
 *
 * 投資信託の購入取引を格納する。
 * スポット購入と積立購入の両方をサポート。
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { funds } from "./funds.js";
import { recurringPurchases } from "./recurring-purchases.js";

/**
 * 取引テーブル
 */
export const transactions = sqliteTable(
  "transactions",
  {
    /** 取引ID（ULID） */
    id: text("id").primaryKey(),
    /** 投資信託ID（外部キー） */
    fundId: text("fund_id")
      .notNull()
      .references(() => funds.id),
    /** 取引種別（SPOT_PURCHASE | RECURRING_PURCHASE） */
    type: text("type").notNull(),
    /** 取引日（YYYY-MM-DD） */
    date: text("date").notNull(),
    /** 購入金額（円） */
    amount: integer("amount").notNull(),
    /** 手数料（円） */
    fee: integer("fee").notNull(),
    /** 適用基準価額（1万口あたり円） */
    navValue: integer("nav_value").notNull(),
    /** 取得口数 */
    units: integer("units").notNull(),
    /** 積立設定ID（積立購入時のみ） */
    recurringPurchaseId: text("recurring_purchase_id")
      .references(() => recurringPurchases.id),
    /** 冪等性キー（積立購入時のみ、一意制約） */
    idempotencyKey: text("idempotency_key").unique(),
    /** 登録日時（Unix timestamp ミリ秒） */
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  }
);

/**
 * 取引テーブルのSELECT結果型
 */
export type TransactionRow = typeof transactions.$inferSelect;

/**
 * 取引テーブルのINSERT入力型
 */
export type TransactionInsert = typeof transactions.$inferInsert;
