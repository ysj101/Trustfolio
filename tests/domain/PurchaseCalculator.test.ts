import { describe, expect, it } from 'vite-plus/test';
import { calculateUnits, calculateValue } from '../../src/domain/PurchaseCalculator';

/**
 * 口数 u の代金（u × 基準価額 ÷ 10,000 の円未満を四捨五入した額）を、BigInt で厳密に計算する。
 *
 * calculateUnits の算出方式（issue #260）を、仕様の定義どおりに検算するためのテスト用関数である。
 * 浮動小数点を使わないため、検算の側に丸め誤差が入らない。
 *
 * @param units 口数
 * @param navValue 基準価額（1万口あたりの円）
 * @returns 代金（円）
 */
function costInYen(units: number, navValue: number): bigint {
  const tenThousandTimesCost = BigInt(units) * BigInt(navValue);
  // 円未満の四捨五入: (x + 5,000) を 10,000 で割った商（切り捨て）が、x ÷ 10,000 を四捨五入した値になる。
  return (tenThousandTimesCost + 5000n) / 10000n;
}

describe('PurchaseCalculator', () => {
  describe('calculateUnits の入力検証', () => {
    it('購入金額が0以下の場合は検証エラーを返す', () => {
      // 前提: 購入金額が無効である
      // 事前条件: 基準価額は妥当な数値とする
      // 検証: バリデーションエラーと対象フィールドが返る
      const result = calculateUnits(0, 12000);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('amount');
        expect(result.error.message).toContain('購入金額');
      }
    });

    it('基準価額が0以下の場合は検証エラーを返す', () => {
      // 前提: 基準価額が無効である
      // 事前条件: 購入金額は妥当な数値とする
      // 検証: バリデーションエラーと対象フィールドが返る
      const result = calculateUnits(10000, 0);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('navValue');
        expect(result.error.message).toContain('基準価額');
      }
    });

    it('購入金額が整数でない場合は検証エラーを返す', () => {
      // 前提: 代金の円未満の扱いは、購入金額が円単位の整数であることを前提にしている
      // 事前条件: 1円未満の端数を含む購入金額（5,000.5円）を渡す
      // 検証: 購入金額のバリデーションエラーが返る
      const result = calculateUnits(5000.5, 23562);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('amount');
        expect(result.error.message).toContain('整数');
      }
    });

    it('基準価額が整数でない場合は検証エラーを返す', () => {
      // 前提: 基準価額の取得元（楽天証券・WealthAdvisor）は円単位の整数を返す
      // 事前条件: 1円未満の端数を含む基準価額（23,562.5円）を渡す
      // 検証: 基準価額のバリデーションエラーが返る
      const result = calculateUnits(5000, 23562.5);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('navValue');
        expect(result.error.message).toContain('整数');
      }
    });

    it('計算できる購入金額の上限は受け付け、上限より 1 円多い購入金額は拒否する', () => {
      // 前提: 10,000 × 購入金額 + 4,999 が安全な整数（2^53 - 1 以下）であれば計算できる
      // 事前条件: 上限の購入金額は 900,719,925,473円、その次は 900,719,925,474円 である（基準価額 10,000円）
      // 検証: 上限では BigInt で厳密に計算した口数と一致し、上限 + 1 円では購入金額の検証エラーになる
      const maxAmount = 900_719_925_473;
      const atMax = calculateUnits(maxAmount, 10000);
      expect(atMax.success).toBe(true);
      if (atMax.success) {
        const exactUnits = (BigInt(maxAmount) * 10000n + 4999n) / 10000n;
        expect(BigInt(atMax.value)).toBe(exactUnits);
      }
      const overMax = calculateUnits(maxAmount + 1, 10000);
      expect(overMax.success).toBe(false);
      if (!overMax.success) {
        expect(overMax.error.field).toBe('amount');
      }
    });

    it('購入金額が大きすぎて安全に計算できない場合は検証エラーを返す', () => {
      // 前提: 10,000 × 購入金額 + 4,999 が安全な整数（2^53 未満）を超えると、計算結果を保証できない
      // 事前条件: Number.MAX_SAFE_INTEGER の購入金額を渡す
      // 検証: 購入金額のバリデーションエラーが返る
      const result = calculateUnits(Number.MAX_SAFE_INTEGER, 23562);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('amount');
        expect(result.error.message).toContain('大きすぎる');
      }
    });
  });

  describe('calculateUnits の算出方式（代金が購入金額を超えない最大の口数）', () => {
    it('SBI証券の実際の約定口数（2026-10-02 のゴールドファンドの積立）と一致する', () => {
      // 前提: ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）を 5,000円 積立購入し、
      //   基準価額 23,562円 で 2,122口 が約定した（issue #260 の実データ）
      // 事前条件: 理論口数は 2,122.06口。2,123口の代金は 5,002円で購入金額を超える
      // 検証: 約定口数と同じ 2,122口 が返る（以前の切り上げでは 2,123口だった）
      const result = calculateUnits(5000, 23562);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(2122);
      }
    });

    it('理論口数の小数部が大きく、切り上げた口数の代金が購入金額を超えない場合は切り上げ側を返す', () => {
      // 前提: 5,000円・基準価額 23,508円 の理論口数は 2,126.94口である
      // 事前条件: 2,127口の代金は 5,000.15円 → 四捨五入で 5,000円となり、購入金額を超えない
      // 検証: 単純な切り捨て（2,126口）ではなく 2,127口 が返る
      const result = calculateUnits(5000, 23508);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(2127);
      }
    });

    it('割り切れる組み合わせでは、浮動小数点誤差の影響を受けずに数学的に正しい口数を返す', () => {
      // 前提: (購入金額 ÷ 基準価額) × 10,000 の順に計算すると、割り切れる組み合わせでも整数からずれる
      //   （43,000 ÷ 15,625 × 10,000 = 27519.999999999996、7,000 ÷ 6,250 × 10,000 = 11200.000000000002）
      // 事前条件: 数学的に正しい口数は 27,520口、11,200口である
      // 検証: いずれも数学的に正しい口数が返る
      const cases = [
        { amount: 43000, navValue: 15625, expectedUnits: 27520 },
        { amount: 7000, navValue: 6250, expectedUnits: 11200 },
      ];
      for (const testCase of cases) {
        const result = calculateUnits(testCase.amount, testCase.navValue);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value, `${testCase.amount}円・${testCase.navValue}円`).toBe(
            testCase.expectedUnits
          );
        }
      }
    });

    it('多数の購入金額と基準価額の組み合わせで、代金が購入金額を超えない最大の口数を返す', () => {
      // 前提: 算出方式の定義は「口数 u の代金 ≦ 購入金額」かつ「口数 u + 1 の代金 > 購入金額」である
      // 事前条件: 購入金額 1,000〜100,000円（1,000円刻み）と、基準価額 5,000〜60,000円（97円刻み）の
      //   全組み合わせを用意し、代金は BigInt で厳密に計算する
      // 検証: すべての組み合わせで、返された口数が定義の 2 条件を満たす
      const violations: string[] = [];
      for (let amount = 1000; amount <= 100000; amount += 1000) {
        for (let navValue = 5000; navValue <= 60000; navValue += 97) {
          const result = calculateUnits(amount, navValue);
          if (!result.success) {
            violations.push(`${amount}円・${navValue}円: ${result.error.message}`);
            continue;
          }
          const units = result.value;
          const withinAmount = costInYen(units, navValue) <= BigInt(amount);
          const nextExceeds = costInYen(units + 1, navValue) > BigInt(amount);
          if (!withinAmount || !nextExceeds) {
            violations.push(`${amount}円・${navValue}円: ${units}口`);
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });

  it('評価額を四捨五入して計算する', () => {
    // 前提: 口数と基準価額が妥当である
    // 事前条件: 四捨五入が発生する数値を用意する
    // 検証: 評価額が整数で返る
    const value = calculateValue(15000, 12345);
    expect(value).toBe(18518);
  });
});
