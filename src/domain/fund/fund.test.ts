/**
 * 投資信託エンティティ単体テスト
 *
 * 前提条件:
 * - 銘柄名は必須
 * - 銘柄名は200文字以内
 * - 登録後の銘柄名は変更不可（型レベルで保証）
 *
 * 検証項目:
 * - 正常系: 有効な銘柄名でFundを生成できる
 * - 異常系: 空文字、長すぎる名前はエラー
 */

import { describe, it, expect } from "vitest";
import { createFund } from "./entities/fund.js";
import { createFundName, fundNameValue } from "./value-objects/fund-name.js";

describe("createFundName", () => {
  describe("正常系", () => {
    it("有効な銘柄名を生成できる", () => {
      // 準備・実行
      const result = createFundName("eMAXIS Slim 全世界株式（オール・カントリー）");

      // 検証
      expect(result.isOk()).toBe(true);
      expect(fundNameValue(result._unsafeUnwrap())).toBe("eMAXIS Slim 全世界株式（オール・カントリー）");
    });

    it("前後の空白はトリムされる", () => {
      // 準備・実行
      const result = createFundName("  ニッセイ日経225インデックスファンド  ");

      // 検証
      expect(result.isOk()).toBe(true);
      expect(fundNameValue(result._unsafeUnwrap())).toBe("ニッセイ日経225インデックスファンド");
    });

    it("200文字の銘柄名を生成できる", () => {
      // 準備
      const longName = "あ".repeat(200);

      // 実行
      const result = createFundName(longName);

      // 検証
      expect(result.isOk()).toBe(true);
    });
  });

  describe("異常系", () => {
    it("空文字はエラーになる", () => {
      // 準備・実行
      const result = createFundName("");

      // 検証
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe("VALIDATION_ERROR");
      expect(result._unsafeUnwrapErr().message).toContain("必須");
    });

    it("空白のみはエラーになる", () => {
      // 準備・実行
      const result = createFundName("   ");

      // 検証
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe("VALIDATION_ERROR");
    });

    it("201文字以上はエラーになる", () => {
      // 準備
      const tooLongName = "あ".repeat(201);

      // 実行
      const result = createFundName(tooLongName);

      // 検証
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe("VALIDATION_ERROR");
      expect(result._unsafeUnwrapErr().message).toContain("200文字以内");
    });
  });
});

describe("createFund", () => {
  describe("正常系", () => {
    it("有効なパラメータでFundを生成できる", () => {
      // 準備・実行
      const result = createFund({
        name: "楽天・全米株式インデックス・ファンド",
      });

      // 検証
      expect(result.isOk()).toBe(true);

      const fund = result._unsafeUnwrap();
      expect(fund.id).toBeDefined();
      expect(fund.id.length).toBeGreaterThan(0);
      expect(fundNameValue(fund.name)).toBe("楽天・全米株式インデックス・ファンド");
      expect(fund.createdAt).toBeInstanceOf(Date);
    });

    it("生成されるIDはユニークである", () => {
      // 準備・実行
      const result1 = createFund({ name: "ファンドA" });
      const result2 = createFund({ name: "ファンドB" });

      // 検証
      expect(result1.isOk()).toBe(true);
      expect(result2.isOk()).toBe(true);
      expect(result1._unsafeUnwrap().id).not.toBe(result2._unsafeUnwrap().id);
    });
  });

  describe("異常系", () => {
    it("空の銘柄名はエラーになる", () => {
      // 準備・実行
      const result = createFund({ name: "" });

      // 検証
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe("VALIDATION_ERROR");
    });
  });
});
