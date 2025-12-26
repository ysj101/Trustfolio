/**
 * 基準価額ユースケース結合テスト
 *
 * 前提条件:
 * - SQLiteインメモリDBを使用
 * - 投資信託が事前に登録されていること
 *
 * 検証シナリオ:
 * - 基準価額の登録と履歴取得
 * - 同一日付の上書き
 * - 存在しない投資信託へのアクセス
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase, runMigrations } from "../../infrastructure/database/client.js";
import { createRepositories } from "../../infrastructure/repositories/index.js";
import { registerFund } from "../fund/register-fund.js";
import { registerNav } from "./register-nav.js";
import { getNavHistory } from "./get-nav-history.js";
import { navDateValue, navValueNumber } from "../../domain/nav/index.js";

describe("基準価額ユースケース結合テスト", () => {
  let repos: ReturnType<typeof createRepositories>;
  let fundId: string;

  beforeEach(async () => {
    // 各テストで新しいインメモリDBを作成
    const db = createTestDatabase();
    runMigrations(db);
    repos = createRepositories(db);

    // テスト用投資信託を登録
    const fundResult = await registerFund(repos.fund, {
      name: "テスト用ファンド",
    });
    fundId = fundResult._unsafeUnwrap().fund.id;
  });

  describe("registerNav", () => {
    it("有効なパラメータで基準価額を登録できる", async () => {
      // 実行
      const result = await registerNav(repos, {
        fundId,
        date: "2024-03-15",
        value: 12345,
      });

      // 検証
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.nav.fundId).toBe(fundId);
      expect(navDateValue(output.nav.date)).toBe("2024-03-15");
      expect(navValueNumber(output.nav.value)).toBe(12345);
      expect(output.isOverwritten).toBe(false);
    });

    it("複数日付の基準価額を登録できる", async () => {
      // 実行
      const result1 = await registerNav(repos, {
        fundId,
        date: "2024-03-14",
        value: 12000,
      });
      const result2 = await registerNav(repos, {
        fundId,
        date: "2024-03-15",
        value: 12100,
      });

      // 検証
      expect(result1.isOk()).toBe(true);
      expect(result2.isOk()).toBe(true);
    });

    it("同一日付の基準価額は上書きされる", async () => {
      // 準備: 1件目を登録
      await registerNav(repos, {
        fundId,
        date: "2024-03-15",
        value: 12000,
      });

      // 実行: 同日で再登録
      const result = await registerNav(repos, {
        fundId,
        date: "2024-03-15",
        value: 12500,
      });

      // 検証
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.isOverwritten).toBe(true);
      expect(navValueNumber(output.nav.value)).toBe(12500);
    });

    it("存在しない投資信託にはエラーを返す", async () => {
      // 実行
      const result = await registerNav(repos, {
        fundId: "nonexistent-id",
        date: "2024-03-15",
        value: 12345,
      });

      // 検証
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe("NOT_FOUND");
    });

    it("無効な日付はエラーを返す", async () => {
      // 実行
      const result = await registerNav(repos, {
        fundId,
        date: "invalid-date",
        value: 12345,
      });

      // 検証
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe("VALIDATION_ERROR");
    });

    it("無効な基準価額はエラーを返す", async () => {
      // 実行
      const result = await registerNav(repos, {
        fundId,
        date: "2024-03-15",
        value: -100,
      });

      // 検証
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe("VALIDATION_ERROR");
    });
  });

  describe("getNavHistory", () => {
    beforeEach(async () => {
      // 複数日付の基準価額を登録
      await registerNav(repos, { fundId, date: "2024-03-13", value: 12000 });
      await registerNav(repos, { fundId, date: "2024-03-14", value: 12100 });
      await registerNav(repos, { fundId, date: "2024-03-15", value: 12200 });
    });

    it("基準価額履歴を日付降順で取得できる", async () => {
      // 実行
      const result = await getNavHistory(repos, { fundId });

      // 検証
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.navs).toHaveLength(3);
      // 日付降順であること
      const [nav0, nav1, nav2] = output.navs;
      expect(nav0).toBeDefined();
      expect(nav1).toBeDefined();
      expect(nav2).toBeDefined();
      expect(navDateValue(nav0.date)).toBe("2024-03-15");
      expect(navDateValue(nav1.date)).toBe("2024-03-14");
      expect(navDateValue(nav2.date)).toBe("2024-03-13");
    });

    it("件数制限付きで取得できる", async () => {
      // 実行
      const result = await getNavHistory(repos, { fundId, limit: 2 });

      // 検証
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.navs).toHaveLength(2);
      // 最新2件のみ
      const [nav0, nav1] = output.navs;
      expect(nav0).toBeDefined();
      expect(nav1).toBeDefined();
      expect(navDateValue(nav0.date)).toBe("2024-03-15");
      expect(navDateValue(nav1.date)).toBe("2024-03-14");
    });

    it("存在しない投資信託にはエラーを返す", async () => {
      // 実行
      const result = await getNavHistory(repos, { fundId: "nonexistent-id" });

      // 検証
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe("NOT_FOUND");
    });
  });
});
