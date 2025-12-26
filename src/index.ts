/**
 * アプリケーションエントリーポイント
 *
 * サーバーの起動とデータベースの初期化を行う。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { serve } from "@hono/node-server";
import { createDatabase, runMigrations } from "./infrastructure/database/client.js";
import { createRepositories } from "./infrastructure/repositories/index.js";
import { createApp } from "./presentation/api/app.js";

/**
 * サーバー設定
 */
const PORT = Number(process.env.PORT) || 3000;
const DATABASE_PATH = process.env.DATABASE_PATH ?? "./data/trustfolio.db";

/**
 * メイン関数
 *
 * データベース接続を初期化し、APIサーバーを起動する。
 */
function main(): void {
  // データベースディレクトリを作成（存在しない場合）
  const dbDir = path.dirname(DATABASE_PATH);
  if (dbDir !== "." && !fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // データベース初期化
  const db = createDatabase(DATABASE_PATH);
  runMigrations(db);

  // リポジトリ作成
  const repos = createRepositories(db);

  // アプリケーション作成
  const app = createApp(repos);

  // サーバー起動
  serve(
    {
      fetch: app.fetch,
      port: PORT,
    },
    (info) => {
      console.log(`🚀 Server is running on http://localhost:${String(info.port)}`);
    }
  );
}

main();
