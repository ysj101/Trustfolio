/**
 * 投資信託ユースケース結合テスト
 *
 * 前提条件:
 * - SQLiteインメモリDBを使用
 * - 各テストケースは独立したDB
 *
 * 検証シナリオ:
 * - 投資信託の登録と一覧取得
 * - 重複登録のエラー
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase, runMigrations } from "../../infrastructure/database/client.js";
import { createRepositories } from "../../infrastructure/repositories/index.js";
import { registerFund } from "./register-fund.js";
import { listFunds } from "./list-funds.js";
import { fundNameValue } from "../../domain/fund/index.js";

describe("投資信託ユースケース結合テスト", () => {
  let repos: ReturnType<typeof createRepositories>;

  beforeEach(() => {
    // 各テストで新しいインメモリDBを作成
    const db = createTestDatabase();
    runMigrations(db);
    repos = createRepositories(db);
  });

  describe("registerFund", () => {
    it("有効な銘柄名で投資信託を登録できる", async () => {
      // 実行
      const result = await registerFund(repos.fund, {
        name: "eMAXIS Slim 全世界株式（オール・カントリー）",
      });

      // 検証
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.fund.id).toBeDefined();
      expect(fundNameValue(output.fund.name)).toBe("eMAXIS Slim 全世界株式（オール・カントリー）");
    });

    it("複数の投資信託を登録できる", async () => {
      // 実行
      const result1 = await registerFund(repos.fund, {
        name: "eMAXIS Slim 全世界株式",
      });
      const result2 = await registerFund(repos.fund, {
        name: "楽天・全米株式インデックス・ファンド",
      });

      // 検証
      expect(result1.isOk()).toBe(true);
      expect(result2.isOk()).toBe(true);
    });

    it("同名の投資信託は登録できない", async () => {
      // 準備: 1件目を登録
      await registerFund(repos.fund, {
        name: "eMAXIS Slim 全世界株式",
      });

      // 実行: 同名で再登録
      const result = await registerFund(repos.fund, {
        name: "eMAXIS Slim 全世界株式",
      });

      // 検証
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe("DUPLICATE_ERROR");
    });

    it("空の銘柄名は登録できない", async () => {
      // 実行
      const result = await registerFund(repos.fund, {
        name: "",
      });

      // 検証
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe("VALIDATION_ERROR");
    });
  });

  describe("listFunds", () => {
    it("登録済みの投資信託一覧を取得できる", async () => {
      // 準備: 3件登録
      await registerFund(repos.fund, { name: "ファンドA" });
      await registerFund(repos.fund, { name: "ファンドB" });
      await registerFund(repos.fund, { name: "ファンドC" });

      // 実行
      const result = await listFunds(repos.fund);

      // 検証
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.funds).toHaveLength(3);
    });

    it("投資信託が登録されていない場合は空配列を返す", async () => {
      // 実行
      const result = await listFunds(repos.fund);

      // 検証
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.funds).toHaveLength(0);
    });
  });
});
