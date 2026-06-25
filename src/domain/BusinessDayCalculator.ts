/**
 * 営業日カレンダー上の前後N営業日を算術するドメインモジュール。
 *
 * 本モジュールは「与えられた営業日リスト（昇順ソート済みの YYYY-MM-DD 文字列配列）」を
 * 唯一の真実とみなし、その配列上で「指定日からN営業日前／後の日付」「指定日より後の
 * 最初の営業日」を求める純粋関数のみを提供する。曜日・祝日からカレンダーを生成する
 * 責務は持たない。
 *
 * {@link ./UsMarketCalendar.ts} との責務境界（重要）:
 * - {@link ./UsMarketCalendar.ts} は「米国市場（NYSE/NASDAQ）の祝日・土日ルール」から
 *   ある日付が営業日かを *判定・生成* する。すなわち営業日カレンダーの供給側である。
 * - 本モジュール（BusinessDayCalculator）は、供給された営業日リスト上での *算術* のみを担う。
 *   このリストは国内ファンドの基準価額（NAV）の存在日から構築される（＝国内ファンドの
 *   約定日計算で用いる営業日）であり、米国市場営業日とは別物である。
 *   したがって本モジュールは祝日・市場の知識を一切持たず、営業日の定義を呼び出し側に委ねる。
 *
 * 設計上の注意:
 * - 引数の `businessDates` は昇順ソート済みであることを前提とする（呼び出し側の責務）。
 * - 営業日が不足して算術が成立しない場合は null を返す（fail fast。暗黙のフォールバックはしない）。
 * - 日付比較は YYYY-MM-DD 文字列の辞書順比較で行う。この形式では辞書順＝時系列順が成立する。
 */

/**
 * 指定した日付より後の最初の営業日を返す。
 *
 * 「より後」は厳密な大小比較（`businessDate > date`）であり、`date` 自身が営業日であっても
 * `date` は返さない（翌営業日以降を返す）。該当する営業日が存在しない場合は null を返す。
 *
 * @param date 基準日（YYYY-MM-DD）。営業日でなくてもよい。
 * @param businessDates 昇順ソート済みの営業日リスト（YYYY-MM-DD）。
 * @returns `date` より後の最初の営業日。存在しなければ null。
 */
export function findNextBusinessDay(date: string, businessDates: string[]): string | null {
  for (const businessDate of businessDates) {
    if (businessDate > date) {
      return businessDate;
    }
  }
  return null;
}

/**
 * 指定した日付より前のN営業日前の日付を返す。
 *
 * 仕様:
 * - `businessDays === 0` の場合は、`date` が営業日リストに存在すれば `date` を、なければ null を返す。
 * - `businessDays >= 1` の場合は、`date` より厳密に前（`< date`）の営業日を新しい順に数え、
 *   N番目に到達した営業日を返す。`date` 自身はカウント対象に含めない。
 * - 営業日が不足してN番目に到達できない場合は null を返す。
 *
 * @param date 基準日（YYYY-MM-DD）。
 * @param businessDays 遡る営業日数（0以上）。
 * @param businessDates 昇順ソート済みの営業日リスト（YYYY-MM-DD）。
 * @returns N営業日前の日付。算術が成立しなければ null。
 */
export function subtractBusinessDays(
  date: string,
  businessDays: number,
  businessDates: string[]
): string | null {
  if (businessDays === 0) {
    return businessDates.includes(date) ? date : null;
  }
  let count = 0;
  for (let i = businessDates.length - 1; i >= 0; i -= 1) {
    if (businessDates[i] >= date) {
      continue;
    }
    count += 1;
    if (count === businessDays) {
      return businessDates[i];
    }
  }
  return null;
}

/**
 * 指定した日付より後のN営業日後の日付を返す。
 *
 * 仕様:
 * - `businessDays === 0` の場合は、`orderDate` が営業日リストに存在すれば `orderDate` を、なければ null を返す。
 * - `businessDays >= 1` の場合は、`orderDate` より厳密に後（`> orderDate`）の営業日を古い順に数え、
 *   N番目に到達した営業日を返す。`orderDate` の翌営業日を1日目としてカウントする。
 * - 営業日が不足してN番目に到達できない場合は null を返す。
 *
 * @param orderDate 基準日（YYYY-MM-DD）。注文日を想定。
 * @param businessDays 進める営業日数（0以上）。
 * @param businessDates 昇順ソート済みの営業日リスト（YYYY-MM-DD）。
 * @returns N営業日後の日付。算術が成立しなければ null。
 */
export function addBusinessDays(
  orderDate: string,
  businessDays: number,
  businessDates: string[]
): string | null {
  if (businessDays === 0) {
    return businessDates.includes(orderDate) ? orderDate : null;
  }
  let count = 0;
  for (const date of businessDates) {
    if (date <= orderDate) {
      continue;
    }
    count += 1;
    if (count === businessDays) {
      return date;
    }
  }
  return null;
}
