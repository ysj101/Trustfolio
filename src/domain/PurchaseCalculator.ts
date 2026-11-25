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
 * 購入金額（円）と基準価額（1万口あたりの円）から、購入口数の推定値を計算する（issue #260、#315）。
 *
 * 目的:
 *   金額指定で購入した投資信託の約定口数を、約定時に記録する値として推定する。
 *
 * 内容（算出方式）:
 *   理論口数（10,000 × 購入金額 ÷ 基準価額）の小数第 1 位を四捨五入した口数を返す。
 *   購入金額を A、基準価額を N とすると、`floor(10,000 × A ÷ N + 0.5)` である。整数だけで求めるため、
 *   `10,000 × A` を N で割った商 q と余り r を求め、`r ≧ N - r`（余りが基準価額の半分以上、
 *   すなわち理論口数の小数部が 0.5 以上）の場合は q + 1 を、そうでない場合は q を返す。
 *   理論口数の小数部がちょうど 0.5 の場合は切り上げる。
 *
 * 算出方式の根拠:
 *   - 実データ 1（issue #260）: SBI証券で 2026-10-02 に約定した積立購入（ＳＢＩ・iシェアーズ・
 *     ゴールドファンド（為替ヘッジなし）、購入金額 5,000円、基準価額 23,562円）の約定口数は
 *     2,122口である。理論口数は 2,122.06口であり、四捨五入の結果と一致する（切り上げは 2,123口）。
 *   - 実データ 2（issue #315）: SBI証券の特定口座で 2026-11-25 に約定した購入（eMAXIS Slim
 *     米国株式（S&P500）、購入金額 50,000円、基準価額 42,313円）の約定口数は 11,817口である。
 *     理論口数は 11,816.70口であり、四捨五入の結果と一致する（切り捨ては 11,816口）。
 *   - 切り上げは実データ 1 と、切り捨ては実データ 2 と一致しない。検討した 4 方式（切り上げ・
 *     切り捨て・以前の方式・四捨五入）のうち、2 件の両方と一致するのは四捨五入だけである。
 *     ただし、実データ 2 件の理論口数の小数部は 0.06 と 0.70 であり、切り上げる境目が
 *     0.07〜0.70 のどこにあっても 2 件と一致する。境目が 0.5 であることは確定していない。
 *   - 以前の方式（issue #260 で採用）は「代金（口数 × 基準価額 ÷ 10,000 の円未満を四捨五入した額）が
 *     購入金額を超えない最大の口数」であり、「SBI証券に問い合わせて得た回答」としてこの手順を
 *     掲載した記事（shintaro-money.com、teiiyone.com）を根拠にしていた。しかし実データ 2 の
 *     約定口数 11,817口の代金は 50,001.27円で購入金額を超えており、この手順と矛盾する
 *     （以前の方式は 11,816口を返した）。このため以前の方式へ戻してはならない。
 *   - SBI証券の公式資料（約款・FAQ・目論見書）には約定口数の端数処理の記述がなく、公式には
 *     確認できない。
 *   - 販売会社によって端数処理が異なりうるため、本関数の結果は推定値である。実際の約定口数と
 *     異なる場合は、利用者が取引履歴の「口数を訂正」で訂正する。
 *
 * 注意:
 *   - 購入金額と基準価額は、いずれも正の整数（円）でなければならない。四捨五入を誤差なく行うために、
 *     分子と分母を整数で求める必要があるためである（基準価額の取得元である楽天証券・WealthAdvisor は
 *     整数を返し、購入金額の入力欄も 1 円単位である）。
 *   - `(購入金額 ÷ 基準価額) × 10,000` の順に浮動小数点で計算すると、割り切れる組み合わせでも
 *     整数からずれる（例: 43,000 ÷ 15,625 × 10,000 = 27519.999999999996）。このため、
 *     `10,000 × A` を整数で求め、余り（% 演算子）を引いてから割ることで、割り切れる除算だけを行う。
 *   - `10,000 × A` が安全な整数（2^53 未満）であれば、余り・引き算・割り切れる除算は
 *     いずれも誤差なく計算できる。計算できる購入金額の上限は 900,719,925,474円であり、
 *     基準価額には依存しない。
 *   - 理論口数が 0.5 以上 1 未満の場合（基準価額が購入金額の 10,000 倍を超え 20,000 倍以下）は
 *     1口を返す。理論口数が 0.5 未満の場合は 0口となるため、検証エラーとする。
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

  const amountTimesUnitsBase = amount * UNITS_BASE;
  if (!Number.isSafeInteger(amountTimesUnitsBase)) {
    return fail('validation', '購入金額が大きすぎるため、口数を計算できません。', 'amount');
  }

  // 理論口数（10,000 × A ÷ N）の整数部（商）と、小数部を表す余りを、整数演算で求める。
  const remainder = amountTimesUnitsBase % navValue;
  const flooredUnits = (amountTimesUnitsBase - remainder) / navValue;
  // 余りが基準価額の半分以上（理論口数の小数部が 0.5 以上）なら切り上げる。
  const units = remainder >= navValue - remainder ? flooredUnits + 1 : flooredUnits;
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
