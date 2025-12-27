/**
 * Drizzle ORMクライアント初期化
 *
 * SQLiteデータベースへの接続を管理する。
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.js";

/**
 * データベース接続の型
 */
export type DatabaseConnection = ReturnType<typeof drizzle<typeof schema>>;

/**
 * SQLiteデータベース接続を作成する
 *
 * @param filename - データベースファイルパス（":memory:"でインメモリDB）
 * @returns Drizzle ORMクライアント
 */
export function createDatabase(filename: string): DatabaseConnection {
  const sqlite = new Database(filename);

  // WALモードを有効化（パフォーマンス向上）
  sqlite.pragma("journal_mode = WAL");
  // 外部キー制約を有効化
  sqlite.pragma("foreign_keys = ON");

  return drizzle(sqlite, { schema });
}

/**
 * テスト用インメモリデータベースを作成する
 *
 * @returns Drizzle ORMクライアント
 */
export function createTestDatabase(): DatabaseConnection {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

/**
 * データベースのマイグレーションを実行する（スキーマ同期）
 *
 * テスト用にテーブルを直接作成する。
 * 本番ではdrizzle-kitのマイグレーションを使用すること。
 *
 * @param db - データベース接続
 */
export function runMigrations(db: DatabaseConnection): void {
  // fundsテーブル作成
  db.run(`
    CREATE TABLE IF NOT EXISTS funds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `);

  // navsテーブル作成
  db.run(`
    CREATE TABLE IF NOT EXISTS navs (
      id TEXT PRIMARY KEY,
      fund_id TEXT NOT NULL REFERENCES funds(id),
      date TEXT NOT NULL,
      value INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(fund_id, date)
    )
  `);

  // navsのインデックス作成
  db.run(`
    CREATE INDEX IF NOT EXISTS navs_fund_date_idx ON navs(fund_id, date)
  `);

  // recurring_purchasesテーブル作成
  db.run(`
    CREATE TABLE IF NOT EXISTS recurring_purchases (
      id TEXT PRIMARY KEY,
      fund_id TEXT NOT NULL REFERENCES funds(id),
      monthly_amount INTEGER NOT NULL,
      execution_day INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )
  `);

  // transactionsテーブル作成
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      fund_id TEXT NOT NULL REFERENCES funds(id),
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      fee INTEGER NOT NULL,
      nav_value INTEGER NOT NULL,
      units INTEGER NOT NULL,
      recurring_purchase_id TEXT REFERENCES recurring_purchases(id),
      idempotency_key TEXT UNIQUE,
      created_at INTEGER NOT NULL
    )
  `);

  // transactionsのインデックス作成
  db.run(`
    CREATE INDEX IF NOT EXISTS transactions_fund_date_idx ON transactions(fund_id, date)
  `);
}
