/**
 * 基準価額エンティティ単体テスト
 *
 * 前提条件:
 * - 日付はYYYY-MM-DD形式
 * - 基準価額は正の整数
 * - 同一銘柄・同一日付は1件のみ（Repository層で保証）
 *
 * 検証項目:
 * - 正常系: 有効なパラメータでNavを生成できる
 * - 異常系: 無効な日付、負の基準価額はエラー
 */

import { describe, it, expect } from "vitest";
import { createNav } from "./entities/nav.js";
import {
  createNavDate,
  navDateValue,
  navDateFromDate,
  compareNavDate,
} from "./value-objects/nav-date.js";
import {
  createNavValue,
  navValueNumber,
  formatNavValue,
} from "./value-objects/nav-value.js";
import { generateFundId } from "../_shared/entity-id.js";

describe("createNavDate", () => {
  describe("正常系", () => {
    it("有効な日付文字列を生成できる", () => {
      // 準備・実行
      const result = createNavDate("2024-03-15");

      // 検証
      expect(result.isOk()).toBe(true);
      expect(navDateValue(result._unsafeUnwrap())).toBe("2024-03-15");
    });

    it("年始の日付を生成できる", () => {
      // 準備・実行
      const result = createNavDate("2024-01-01");

      // 検証
      expect(result.isOk()).toBe(true);
    });

    it("年末の日付を生成できる", () => {
      // 準備・実行
      const result = createNavDate("2024-12-31");

      // 検証
      expect(result.isOk()).toBe(true);
    });

    it("うるう年の2月29日を生成できる", () => {
      // 準備・実行
      const result = createNavDate("2024-02-29");

      // 検証
      expect(result.isOk()).toBe(true);
    });
  });

  describe("異常系", () => {
    it("不正なフォーマットはエラーになる", () => {
      // 準備・実行
      const result = createNavDate("2024/03/15");

      // 検証
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("YYYY-MM-DD");
    });

    it("存在しない日付はエラーになる（2月30日）", () => {
      // 準備・実行
      const result = createNavDate("2024-02-30");

      // 検証
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("無効");
    });

    it("うるう年でない年の2月29日はエラーになる", () => {
      // 準備・実行
      const result = createNavDate("2023-02-29");

      // 検証
      expect(result.isErr()).toBe(true);
    });

    it("13月はエラーになる", () => {
      // 準備・実行
      const result = createNavDate("2024-13-01");

      // 検証
      expect(result.isErr()).toBe(true);
    });
  });
});

describe("navDateFromDate", () => {
  it("Dateオブジェクトから日付を生成できる", () => {
    // 準備
    const date = new Date(2024, 2, 15); // 2024年3月15日

    // 実行
    const navDate = navDateFromDate(date);

    // 検証
    expect(navDateValue(navDate)).toBe("2024-03-15");
  });
});

describe("compareNavDate", () => {
  it("後の日付との比較は負を返す", () => {
    // 準備
    const a = createNavDate("2024-03-01")._unsafeUnwrap();
    const b = createNavDate("2024-03-15")._unsafeUnwrap();

    // 実行・検証
    expect(compareNavDate(a, b)).toBeLessThan(0);
  });

  it("前の日付との比較は正を返す", () => {
    // 準備
    const a = createNavDate("2024-03-15")._unsafeUnwrap();
    const b = createNavDate("2024-03-01")._unsafeUnwrap();

    // 実行・検証
    expect(compareNavDate(a, b)).toBeGreaterThan(0);
  });

  it("同じ日付との比較は0を返す", () => {
    // 準備
    const a = createNavDate("2024-03-15")._unsafeUnwrap();
    const b = createNavDate("2024-03-15")._unsafeUnwrap();

    // 実行・検証
    expect(compareNavDate(a, b)).toBe(0);
  });
});

describe("createNavValue", () => {
  describe("正常系", () => {
    it("正の整数から基準価額を生成できる", () => {
      // 準備・実行
      const result = createNavValue(12345);

      // 検証
      expect(result.isOk()).toBe(true);
      expect(navValueNumber(result._unsafeUnwrap())).toBe(12345);
    });

    it("大きな基準価額を生成できる（10万円）", () => {
      // 準備・実行
      const result = createNavValue(100000);

      // 検証
      expect(result.isOk()).toBe(true);
    });
  });

  describe("異常系", () => {
    it("0はエラーになる", () => {
      // 準備・実行
      const result = createNavValue(0);

      // 検証
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("正の数");
    });

    it("負数はエラーになる", () => {
      // 準備・実行
      const result = createNavValue(-100);

      // 検証
      expect(result.isErr()).toBe(true);
    });

    it("小数はエラーになる", () => {
      // 準備・実行
      const result = createNavValue(12345.67);

      // 検証
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain("整数");
    });

    it("Infinityはエラーになる", () => {
      // 準備・実行
      const result = createNavValue(Infinity);

      // 検証
      expect(result.isErr()).toBe(true);
    });
  });
});

describe("formatNavValue", () => {
  it("基準価額を日本円形式でフォーマットする", () => {
    // 準備
    const navValue = createNavValue(12345)._unsafeUnwrap();

    // 実行
    const formatted = formatNavValue(navValue);

    // 検証
    expect(formatted).toBe("¥12,345");
  });
});

describe("createNav", () => {
  describe("正常系", () => {
    it("有効なパラメータでNavを生成できる", () => {
      // 準備
      const fundId = generateFundId();

      // 実行
      const result = createNav({
        fundId,
        date: "2024-03-15",
        value: 12345,
      });

      // 検証
      expect(result.isOk()).toBe(true);

      const nav = result._unsafeUnwrap();
      expect(nav.id).toBeDefined();
      expect(nav.fundId).toBe(fundId);
      expect(navDateValue(nav.date)).toBe("2024-03-15");
      expect(navValueNumber(nav.value)).toBe(12345);
      expect(nav.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("異常系", () => {
    it("無効な日付はエラーになる", () => {
      // 準備・実行
      const result = createNav({
        fundId: generateFundId(),
        date: "invalid",
        value: 12345,
      });

      // 検証
      expect(result.isErr()).toBe(true);
    });

    it("無効な基準価額はエラーになる", () => {
      // 準備・実行
      const result = createNav({
        fundId: generateFundId(),
        date: "2024-03-15",
        value: -100,
      });

      // 検証
      expect(result.isErr()).toBe(true);
    });
  });
});
