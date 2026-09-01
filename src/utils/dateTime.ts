/**
 * 日付・タイムゾーン処理の方針モジュール（H7 #153）。
 *
 * 背景・目的:
 * - リポジトリ内の日付・TZ 処理は歴史的に3方式が混在しており、どの箇所が
 *   どの方式を意図して使っているかがコードから読み取れなかった。本モジュールは
 *   その3方式を「方針」として文書化し、各方式のヘルパーと現在時刻の生成
 *   （クロック抽象）を1箇所に集約する。
 * - **各ヘルパーは既存実装と出力・評価順序が同一の移設・ラップであり、生成される
 *   日付文字列・判定結果は一切変えない**（外部挙動不変。issue #153 の完了条件）。
 *
 * 方針（どの層でどの方式を使うか）:
 *
 * 1. **JST 整形（{@link formatJstDate} / {@link formatJstTimestamp}）**
 *    - 用途: ユーザー向け出力（メール本文の生成日時・エラー発生日時）と、
 *      日本時間基準の営業日付（積立自動発注の約定日）。
 *    - 実装: GAS の `Utilities.formatDate(date, 'Asia/Tokyo', ...)`。
 *      GAS ランタイム外（vitest）ではテストセットアップのスタブが前提となる。
 *    - 使用層: entry（main.ts）・service・usecase。
 *
 * 2. **ローカル TZ の日付文字列化（{@link formatDateToIso}）**
 *    - 用途: シート由来の `Date` セル値を `YYYY-MM-DD` へ文字列化する永続化・照合系。
 *    - 実装: `getFullYear`/`getMonth`/`getDate`（ローカルタイム）。GAS ランタイムの
 *      タイムゾーン設定（appsscript.json の Asia/Tokyo）を前提に JST として機能する。
 *    - 使用層: repository・usecase（レコード照合）。
 *
 * 3. **UTC 固定パース（{@link parseUtcIsoDate}）**
 *    - 用途: `YYYY-MM-DD` 文字列の妥当性判定と大小比較。実行環境のローカル TZ に
 *      左右されない決定的な `Date` 化のために UTC 深夜 0 時へ固定する。
 *    - 使用層: domain（validators）・usecase（日付比較）。
 *
 * 補足（本モジュールに集約しない日付処理）:
 * - `src/domain/UsMarketCalendar.ts` の内部日付演算は対象外である。詳細は
 *   同ファイル冒頭の「タイムゾーンの取り扱い（H7 #153）」コメントを参照。
 *
 * クロック抽象（{@link clock}）:
 * - 現在時刻の生成を1箇所に集約し、テストでの時刻固定（`vi.setSystemTime`）の
 *   対象点を明確にする。`new Date()` を直接書く代わりに `clock.now()` /
 *   `clock.nowIso()` を使用する。
 */

/**
 * `Date` を JST（Asia/Tokyo）の `yyyy-MM-dd` 文字列へ整形する。
 *
 * 用途・方針は本モジュール冒頭の「方針 1」を参照。
 *
 * @param date - 整形対象の `Date`。
 * @returns JST 基準の `yyyy-MM-dd` 文字列。
 */
export function formatJstDate(date: Date): string {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/**
 * `Date` を JST（Asia/Tokyo）の `yyyy-MM-dd HH:mm:ss` 文字列へ整形する。
 *
 * 用途・方針は本モジュール冒頭の「方針 1」を参照。
 *
 * @param date - 整形対象の `Date`。
 * @returns JST 基準の `yyyy-MM-dd HH:mm:ss` 文字列。
 */
export function formatJstTimestamp(date: Date): string {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

/**
 * 年・月・日の数値から `YYYY-MM-DD` 形式の文字列を組み立てる。
 *
 * 注意:
 * - 月・日は 2 桁ゼロ埋めする。`Date` を経由しないため、暦上の妥当性
 *   （例: 存在しない日）の検証は行わない（呼び出し側の既存挙動を維持する）。
 *
 * @param year - 年。
 * @param month - 月（1 始まり）。
 * @param day - 日。
 * @returns `YYYY-MM-DD` 形式の文字列。
 */
export function formatIsoDateParts(year: number, month: number, day: number): string {
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * `Date` を `YYYY-MM-DD` 形式（ローカルタイム基準）の文字列へ変換する。
 *
 * 用途・方針は本モジュール冒頭の「方針 2」を参照。
 *
 * 注意:
 * - UTC ではなくローカルタイムで日付を取り出す。タイムゾーンが異なる環境では
 *   結果が変わる（旧 `src/domain/dateFormat.ts` から移設。出力は移設前と同一）。
 *
 * @param date - 変換対象の `Date`。
 * @returns `YYYY-MM-DD` 形式の文字列。
 */
export function formatDateToIso(date: Date): string {
  return formatIsoDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * `YYYY-MM-DD` 文字列を UTC 深夜 0 時固定で `Date` へパースする。
 *
 * 用途・方針は本モジュール冒頭の「方針 3」を参照。
 *
 * 注意（既知の制限）:
 * - `2026-02-30` のような暦上存在しない日付は `Invalid Date` にならず、翌月へ
 *   繰り上げてパースされる（V8 の実挙動。2026-02-30 → 2026-03-02）。このため
 *   `src/domain/validators.ts` の `isValidIsoDate` も暦上の存在までは検証できない
 *   （同テストで「既知の制限」として明文化済み）。
 *
 * @param value - `YYYY-MM-DD` 形式の文字列。
 * @returns UTC 深夜 0 時に固定された `Date`。
 */
export function parseUtcIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/**
 * `YYYY-MM-DD`形式の文字列が実在する暦日かをUTC基準で検証する。
 *
 * 内容:
 * - 形式から年月日を数値化し、UTCのDateへ設定した値を同じ年月日へround-tripできるか確認する。
 * - `2026-02-30`のようにDateが翌月へ繰り上げる日付は不正として返す。
 *
 * 注意:
 * - 本関数は暦日の厳密検証が必要な外部データ境界で使用する。
 * - 既存ユースケースが利用するdomain/validators.tsの互換動作は変更しない。
 *
 * @param value - 検証対象の文字列。
 * @returns 指定値が実在する暦日ならtrue。
 */
export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return false;
  }
  const [, yearText, monthText, dayText] = match;
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    return false;
  }
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * 現在時刻の生成を集約するクロック抽象。
 *
 * 目的:
 * - `new Date()` / `new Date().toISOString()` の散在を解消し、現在時刻に依存する
 *   処理の入口を1箇所にする。テストでは `vi.setSystemTime` による時刻固定が
 *   そのまま機能する（内部実装は `new Date()` のため）。
 */
export const clock = {
  /**
   * 現在時刻の `Date` を返す。
   *
   * @returns 現在時刻。
   */
  now(): Date {
    return new Date();
  },
  /**
   * 現在時刻の ISO 8601 文字列（UTC）を返す。
   *
   * @returns `new Date().toISOString()` と同一の文字列。
   */
  nowIso(): string {
    return clock.now().toISOString();
  },
} as const;
