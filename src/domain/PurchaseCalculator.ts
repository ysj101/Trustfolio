import { fail } from './result';
import type { Result } from './types';
import { validatePositiveInteger } from './validators';

/** 基準価額の単位となる口数。投資信託の基準価額は「1万口あたりの価額（円）」で公表される。 */
const UNITS_BASE = 10000;

/**
 * 購入金額が1円以上の整数でないときのメッセージ。
 * スポット購入の入力検証（usecase/TransactionUseCase.ts）と共有し、同じ誤りに同じ文言を示す。
 */
export const AMOUNT_NOT_POSITIVE_INTEGER_MESSAGE = '購入金額は1円以上の整数で入力してください。';

/**
 * 基準価額が1円以上の整数でないときのメッセージ。
 * スポット購入の入力検証（usecase/TransactionUseCase.ts）と共有し、同じ誤りに同じ文言を示す。
 */
export const NAV_VALUE_NOT_POSITIVE_INTEGER_MESSAGE =
  '基準価額は1円以上の整数である必要があります。';

/**
 * 購入金額（円）と基準価額（1万口あたりの円）から、購入口数の推定値を計算する（issue #260）。
 *
 * 目的:
 *   金額指定で購入した投資信託の約定口数を、約定時に記録する値として推定する。
 *
 * 内容（算出方式）:
 *   「代金（口数 × 基準価額 ÷ 10,000 の円未満を四捨五入した額）が購入金額を超えない、最大の口数」
 *   を返す。購入金額を A、基準価額を N、口数を u とすると、代金が A 以下になる条件は
 *   `u × N ÷ 10,000 < A + 0.5`、すなわち整数の範囲で `u × N ≦ 10,000 × A + 4,999` である。
 *   この条件を満たす最大の u は `floor((10,000 × A + 4,999) ÷ N)` である。
 *
 * 算出方式の根拠:
 *   - 実データ: SBI証券で 2026-10-02 に約定した積立購入（ＳＢＩ・iシェアーズ・ゴールドファンド
 *     （為替ヘッジなし）、購入金額 5,000円、基準価額 23,562円）の約定口数は 2,122口であり、
 *     本方式の結果と一致する（切り上げの 2,123口は代金 5,002円となり購入金額を超える）。
 *   - SBI証券の手順: 「SBI証券に問い合わせて得た回答」として、本方式と同じ手順を掲載した
 *     独立した 2 つの記事がある（shintaro-money.com、teiiyone.com）。SBI証券の公式資料
 *     （約款・FAQ・目論見書）には約定口数の端数処理の記述がなく、公式には確認できない。
 *   - 本方式は、理論口数の小数部が大きい場合に切り上げと同じ結果になる（例: 5,000円・
 *     23,508円 → 2,127口）。以前の実装（切り上げ）が一部の取引で約定口数と一致していたことも
 *     説明できる。
 *   - 販売会社によって端数処理が異なりうるため、本関数の結果は推定値である。実際の約定口数と
 *     異なる場合は、利用者が取引履歴の「口数を訂正」で訂正する。
 *
 * 注意:
 *   - 購入金額と基準価額は、いずれも正の整数（円）でなければならない。整数でない値は
 *     代金の円未満の扱いが定義できないため、検証エラーとする（基準価額の取得元である
 *     楽天証券・WealthAdvisor は整数を返し、購入金額の入力欄も 1 円単位である）。
 *   - `10,000 × A + 4,999` が安全な整数（2^53 未満）であれば、浮動小数点の除算の結果を
 *     切り捨てても厳密な整数除算と一致する。理論口数が整数でない場合、次の整数までの距離は
 *     1/N 以上であり、除算の丸め誤差（商 × 2^-53 以下）はそれより小さいためである。
 *   - 画面の購入口数プレビュー（src/ui/scripts.html）は本関数と同じ式を用いる。本関数の
 *     算出方式を変更する場合は、必ず同時に変更すること（tests/ui/scripts-purchase-preview.test.ts
 *     が一致を検証する）。
 *
 * @param amount 購入金額（円。正の整数）
 * @param navValue 基準価額（1万口あたりの円。正の整数）
 * @returns 購入口数の推定値（1以上の整数）、または検証エラー
 */
export function calculateUnits(amount: number, navValue: number): Result<number> {
  const amountResult = validatePositiveInteger(
    amount,
    AMOUNT_NOT_POSITIVE_INTEGER_MESSAGE,
    'amount'
  );
  if (!amountResult.success) {
    return amountResult;
  }
  const navValueResult = validatePositiveInteger(
    navValue,
    NAV_VALUE_NOT_POSITIVE_INTEGER_MESSAGE,
    'navValue'
  );
  if (!navValueResult.success) {
    return navValueResult;
  }

  // 代金の円未満を四捨五入したときに購入金額を超えない上限（10,000 × A + 4,999）。
  const maxCostTimesUnitsBase = amount * UNITS_BASE + UNITS_BASE / 2 - 1;
  if (!Number.isSafeInteger(maxCostTimesUnitsBase)) {
    return fail('validation', '購入金額が大きすぎるため、口数を計算できません。', 'amount');
  }

  const units = Math.floor(maxCostTimesUnitsBase / navValue);
  if (units <= 0) {
    return fail('validation', '計算された口数が0以下です。購入金額を見直してください。', 'amount');
  }

  return { success: true, value: units };
}

/**
 * 評価額を計算する。
 */
export function calculateValue(units: number, navValue: number): number {
  return Math.round((units / UNITS_BASE) * navValue);
}
