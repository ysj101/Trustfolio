/**
 * Money Value Object 単体テスト
 *
 * 前提条件:
 * - 金額は日本円（整数）で表現する
 * - 負数は許容しない
 * - 計算結果の端数は四捨五入
 *
 * 検証項目:
 * - 生成: 正常値、境界値、異常値
 * - 加算・減算: 精度維持、オーバーフロー境界
 * - 乗算・除算: 端数処理
 * - フォーマット: 日本円形式
 */

import { describe, it, expect } from "vitest";
import {
  createMoney,
  moneyFromNumber,
  moneyValue,
  ZERO_MONEY,
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  compareMoney,
  equalsMoney,
  formatMoney,
} from "./money.js";

describe("createMoney", () => {
  describe("正常系", () => {
    it("正の整数から金額を生成できる", () => {
      // 準備・実行
      const result = createMoney(10000);

      // 検証
      expect(result.isOk()).toBe(true);
      expect(moneyValue(result._unsafeUnwrap())).toBe(10000);
    });

    it("0円を生成できる", () => {
      // 準備・実行
      const result = createMoney(0);

      // 検証
      expect(result.isOk()).toBe(true);
      expect(moneyValue(result._unsafeUnwrap())).toBe(0);
    });

    it("小数点以下は四捨五入される（0.4以下は切り捨て）", () => {
      // 準備・実行
      const result = createMoney(100.4);

      // 検証
      expect(result.isOk()).toBe(true);
      expect(moneyValue(result._unsafeUnwrap())).toBe(100);
    });

    it("小数点以下は四捨五入される（0.5以上は切り上げ）", () => {
      // 準備・実行
      const result = createMoney(100.5);

      // 検証
      expect(result.isOk()).toBe(true);
      expect(moneyValue(result._unsafeUnwrap())).toBe(101);
    });

    it("大きな金額も生成できる（1億円）", () => {
      // 準備・実行
      const result = createMoney(100_000_000);

      // 検証
      expect(result.isOk()).toBe(true);
      expect(moneyValue(result._unsafeUnwrap())).toBe(100_000_000);
    });
  });

  describe("異常系", () => {
    it("負数はエラーになる", () => {
      // 準備・実行
      const result = createMoney(-100);

      // 検証
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe("VALIDATION_ERROR");
      expect(result._unsafeUnwrapErr().message).toContain("0以上");
    });

    it("Infinityはエラーになる", () => {
      // 準備・実行
      const result = createMoney(Infinity);

      // 検証
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe("VALIDATION_ERROR");
    });

    it("NaNはエラーになる", () => {
      // 準備・実行
      const result = createMoney(NaN);

      // 検証
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe("VALIDATION_ERROR");
    });
  });
});

describe("moneyFromNumber", () => {
  it("有効な値からMoneyを生成する", () => {
    // 準備・実行
    const money = moneyFromNumber(5000);

    // 検証
    expect(moneyValue(money)).toBe(5000);
  });

  it("負数の場合は0を返す", () => {
    // 準備・実行
    const money = moneyFromNumber(-100);

    // 検証
    expect(moneyValue(money)).toBe(0);
  });
});

describe("ZERO_MONEY", () => {
  it("0円を表す定数", () => {
    // 検証
    expect(moneyValue(ZERO_MONEY)).toBe(0);
  });
});

describe("addMoney", () => {
  it("2つの金額を加算できる", () => {
    // 準備
    const a = createMoney(10000)._unsafeUnwrap();
    const b = createMoney(5000)._unsafeUnwrap();

    // 実行
    const result = addMoney(a, b);

    // 検証
    expect(moneyValue(result)).toBe(15000);
  });

  it("0円との加算は元の値を維持する", () => {
    // 準備
    const a = createMoney(10000)._unsafeUnwrap();

    // 実行
    const result = addMoney(a, ZERO_MONEY);

    // 検証
    expect(moneyValue(result)).toBe(10000);
  });
});

describe("subtractMoney", () => {
  it("大きい金額から小さい金額を減算できる", () => {
    // 準備
    const a = createMoney(10000)._unsafeUnwrap();
    const b = createMoney(3000)._unsafeUnwrap();

    // 実行
    const result = subtractMoney(a, b);

    // 検証
    expect(result.isOk()).toBe(true);
    expect(moneyValue(result._unsafeUnwrap())).toBe(7000);
  });

  it("同じ金額の減算は0円になる", () => {
    // 準備
    const a = createMoney(10000)._unsafeUnwrap();
    const b = createMoney(10000)._unsafeUnwrap();

    // 実行
    const result = subtractMoney(a, b);

    // 検証
    expect(result.isOk()).toBe(true);
    expect(moneyValue(result._unsafeUnwrap())).toBe(0);
  });

  it("結果が負になる減算はエラーになる", () => {
    // 準備
    const a = createMoney(3000)._unsafeUnwrap();
    const b = createMoney(10000)._unsafeUnwrap();

    // 実行
    const result = subtractMoney(a, b);

    // 検証
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().type).toBe("VALIDATION_ERROR");
    expect(result._unsafeUnwrapErr().message).toContain("負になります");
  });
});

describe("multiplyMoney", () => {
  it("金額を整数倍できる", () => {
    // 準備
    const money = createMoney(10000)._unsafeUnwrap();

    // 実行
    const result = multiplyMoney(money, 3);

    // 検証
    expect(moneyValue(result)).toBe(30000);
  });

  it("小数倍の結果は四捨五入される", () => {
    // 準備: 1000 * 0.333 = 333.0
    const money = createMoney(1000)._unsafeUnwrap();

    // 実行
    const result = multiplyMoney(money, 0.333);

    // 検証
    expect(moneyValue(result)).toBe(333);
  });

  it("端数が0.5以上なら切り上げ", () => {
    // 準備: 1000 * 0.3335 = 333.5
    const money = createMoney(1000)._unsafeUnwrap();

    // 実行
    const result = multiplyMoney(money, 0.3335);

    // 検証
    expect(moneyValue(result)).toBe(334);
  });

  it("0倍すると0円になる", () => {
    // 準備
    const money = createMoney(10000)._unsafeUnwrap();

    // 実行
    const result = multiplyMoney(money, 0);

    // 検証
    expect(moneyValue(result)).toBe(0);
  });

  it("負の乗数の場合は0を返す", () => {
    // 準備
    const money = createMoney(10000)._unsafeUnwrap();

    // 実行
    const result = multiplyMoney(money, -1);

    // 検証
    expect(moneyValue(result)).toBe(0);
  });
});

describe("divideMoney", () => {
  it("金額を整数で割れる", () => {
    // 準備
    const money = createMoney(10000)._unsafeUnwrap();

    // 実行
    const result = divideMoney(money, 2);

    // 検証
    expect(result.isOk()).toBe(true);
    expect(moneyValue(result._unsafeUnwrap())).toBe(5000);
  });

  it("割り切れない場合は四捨五入される", () => {
    // 準備: 10000 / 3 = 3333.33...
    const money = createMoney(10000)._unsafeUnwrap();

    // 実行
    const result = divideMoney(money, 3);

    // 検証
    expect(result.isOk()).toBe(true);
    expect(moneyValue(result._unsafeUnwrap())).toBe(3333);
  });

  it("0で除算するとエラーになる", () => {
    // 準備
    const money = createMoney(10000)._unsafeUnwrap();

    // 実行
    const result = divideMoney(money, 0);

    // 検証
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).toContain("0で除算");
  });
});

describe("compareMoney", () => {
  it("大きい金額との比較は負を返す", () => {
    // 準備
    const a = createMoney(5000)._unsafeUnwrap();
    const b = createMoney(10000)._unsafeUnwrap();

    // 実行・検証
    expect(compareMoney(a, b)).toBeLessThan(0);
  });

  it("小さい金額との比較は正を返す", () => {
    // 準備
    const a = createMoney(10000)._unsafeUnwrap();
    const b = createMoney(5000)._unsafeUnwrap();

    // 実行・検証
    expect(compareMoney(a, b)).toBeGreaterThan(0);
  });

  it("同じ金額との比較は0を返す", () => {
    // 準備
    const a = createMoney(10000)._unsafeUnwrap();
    const b = createMoney(10000)._unsafeUnwrap();

    // 実行・検証
    expect(compareMoney(a, b)).toBe(0);
  });
});

describe("equalsMoney", () => {
  it("同じ金額はtrueを返す", () => {
    // 準備
    const a = createMoney(10000)._unsafeUnwrap();
    const b = createMoney(10000)._unsafeUnwrap();

    // 実行・検証
    expect(equalsMoney(a, b)).toBe(true);
  });

  it("異なる金額はfalseを返す", () => {
    // 準備
    const a = createMoney(10000)._unsafeUnwrap();
    const b = createMoney(5000)._unsafeUnwrap();

    // 実行・検証
    expect(equalsMoney(a, b)).toBe(false);
  });
});

describe("formatMoney", () => {
  it("金額を日本円形式でフォーマットする", () => {
    // 準備
    const money = createMoney(10000)._unsafeUnwrap();

    // 実行
    const formatted = formatMoney(money);

    // 検証
    expect(formatted).toBe("¥10,000");
  });

  it("0円をフォーマットする", () => {
    // 実行
    const formatted = formatMoney(ZERO_MONEY);

    // 検証
    expect(formatted).toBe("¥0");
  });

  it("大きな金額を3桁区切りでフォーマットする", () => {
    // 準備
    const money = createMoney(1_234_567_890)._unsafeUnwrap();

    // 実行
    const formatted = formatMoney(money);

    // 検証
    expect(formatted).toBe("¥1,234,567,890");
  });
});
