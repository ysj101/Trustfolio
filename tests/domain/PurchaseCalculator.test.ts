import { describe, expect, it } from 'vite-plus/test';
import { calculateUnits, calculateValue } from '../../src/domain/PurchaseCalculator';

/**
 * 口数が「理論口数（10,000 × 購入金額 ÷ 基準価額）の小数第 1 位の四捨五入」になっているかを、
 * 四捨五入の定義から BigInt で厳密に判定する。
 *
 * calculateUnits の算出方式（issue #315）を、実装の式とは別の形で検算するためのテスト用関数である。
 * 四捨五入した口数 u は、理論口数 t に対して `t - 0.5 < u ≦ t + 0.5` を満たすただ 1 つの整数である
 * （小数部がちょうど 0.5 のときは大きい側）。両辺に 2 × 基準価額 を掛けて整数だけで表すと、
 * `-基準価額 < 2 × (u × 基準価額 - 10,000 × 購入金額) ≦ 基準価額` になる。
 * 浮動小数点を使わないため、検算の側に丸め誤差が入らない。
 *
 * @param units 判定する口数
 * @param amount 購入金額（円）
 * @param navValue 基準価額（1万口あたりの円）
 * @returns 四捨五入した口数であれば true
 */
function isRoundedUnits(units: number, amount: number, navValue: number): boolean {
  const nav = BigInt(navValue);
  const doubledDifference = 2n * (BigInt(units) * nav - BigInt(amount) * 10000n);
  return -nav < doubledDifference && doubledDifference <= nav;
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
      // 前提: 購入金額の入力欄は 1 円単位であり、calculateUnits は円単位の整数だけを受け付ける
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
      // 前提: 10,000 × 購入金額 が安全な整数（2^53 - 1 以下）であれば計算できる。上限は基準価額に依存しない
      // 事前条件: 上限の購入金額は 900,719,925,474円、その次は 900,719,925,475円 である。
      //   基準価額は、割り切れる 10,000円 と、割り切れない 42,313円 の 2 通りを用いる
      // 検証: 上限では BigInt で厳密に判定した四捨五入の口数であり、上限 + 1 円では購入金額の検証エラーになる
      const maxAmount = 900_719_925_474;
      for (const navValue of [10000, 42313]) {
        const atMax = calculateUnits(maxAmount, navValue);
        expect(atMax.success, `基準価額 ${navValue}円`).toBe(true);
        if (atMax.success) {
          expect(isRoundedUnits(atMax.value, maxAmount, navValue), `基準価額 ${navValue}円`).toBe(
            true
          );
        }
      }
      const overMax = calculateUnits(maxAmount + 1, 10000);
      expect(overMax.success).toBe(false);
      if (!overMax.success) {
        expect(overMax.error.field).toBe('amount');
      }
    });

    it('購入金額が大きすぎて安全に計算できない場合は検証エラーを返す', () => {
      // 前提: 10,000 × 購入金額 が安全な整数（2^53 未満）を超えると、計算結果を保証できない
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

  describe('calculateUnits の算出方式（理論口数の小数第 1 位の四捨五入）', () => {
    it('SBI証券の実際の約定口数（2026-10-02 のゴールドファンドの積立）と一致する', () => {
      // 前提: ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）を 5,000円 積立購入し、
      //   基準価額 23,562円 で 2,122口 が約定した（issue #260 の実データ）
      // 事前条件: 理論口数は 2,122.06口であり、小数部が 0.5 未満である
      // 検証: 約定口数と同じ 2,122口 が返る（切り上げでは 2,123口になる）
      const result = calculateUnits(5000, 23562);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(2122);
      }
    });

    it('SBI証券の実際の約定口数（2026-11-25 の S&P500 の購入）と一致する', () => {
      // 前提: eMAXIS Slim 米国株式（S&P500）を SBI証券の特定口座で 50,000円 購入し、
      //   基準価額 42,313円 で 11,817口 が約定した（issue #315 の実データ）
      // 事前条件: 理論口数は 11,816.70口であり、小数部が 0.5 以上である。
      //   11,817口の代金は 50,001.27円で購入金額を超える
      // 検証: 約定口数と同じ 11,817口 が返る（以前の「代金が購入金額を超えない最大の口数」では
      //   11,816口だった）
      const result = calculateUnits(50000, 42313);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(11817);
      }
    });

    it('理論口数の小数部がちょうど 0.5 の場合は切り上げる', () => {
      // 前提: 5,000円・基準価額 32,000円 の理論口数は 50,000,000 ÷ 32,000 = 1,562.5口である
      // 事前条件: 小数部がちょうど 0.5 の場合の販売会社の扱いは不明であり、一般的な四捨五入とする
      // 検証: 1,563口 が返る
      const result = calculateUnits(5000, 32000);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(1563);
      }
    });

    it('理論口数が 0.5 以上 1 未満の場合は 1口を返し、0.5 未満の場合は検証エラーを返す', () => {
      // 前提: 1円・基準価額 20,000円 の理論口数は 0.5口、1円・基準価額 20,001円 の理論口数は 0.49998口である
      // 事前条件: 四捨五入すると、前者は 1口、後者は 0口になる
      // 検証: 前者は 1口 が返り、後者は口数が 0 以下であるとして購入金額の検証エラーになる
      expect(calculateUnits(1, 20000)).toEqual({ success: true, value: 1 });
      const belowHalf = calculateUnits(1, 20001);
      expect(belowHalf.success).toBe(false);
      if (!belowHalf.success) {
        expect(belowHalf.error.field).toBe('amount');
        expect(belowHalf.error.message).toContain('0以下');
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

    it('多数の購入金額と基準価額の組み合わせで、理論口数を四捨五入した口数を返す', () => {
      // 前提: 算出方式の定義は「理論口数（10,000 × 購入金額 ÷ 基準価額）の小数第 1 位の四捨五入」である
      // 事前条件: 購入金額 1,000〜100,000円（1,000円刻み）と、基準価額 5,000〜60,000円（97円刻み）の
      //   全組み合わせを用意し、四捨五入の定義（理論口数との差が 0.5 以下で、ちょうど 0.5 のときは
      //   大きい側）を満たすかを BigInt で厳密に判定する
      // 検証: すべての組み合わせで、返された口数が四捨五入の定義を満たす
      const violations: string[] = [];
      for (let amount = 1000; amount <= 100000; amount += 1000) {
        for (let navValue = 5000; navValue <= 60000; navValue += 97) {
          const result = calculateUnits(amount, navValue);
          if (!result.success) {
            violations.push(`${amount}円・${navValue}円: ${result.error.message}`);
            continue;
          }
          if (!isRoundedUnits(result.value, amount, navValue)) {
            violations.push(`${amount}円・${navValue}円: ${result.value}口`);
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
