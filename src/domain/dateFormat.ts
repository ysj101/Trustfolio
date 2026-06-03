/**
 * `Date` を `YYYY-MM-DD` 形式（ローカルタイム基準）の文字列へ変換する共通ヘルパー。
 *
 * 目的:
 * - 各 Repository に重複していた同一実装の `formatDateToIso` を一本化する。
 *
 * 内容:
 * - `getFullYear` / `getMonth` / `getDate`（いずれもローカルタイム）を用いる。
 *   GAS ランタイムのタイムゾーン設定（Asia/Tokyo）を前提とした既存挙動を踏襲する。
 * - 月・日は 2 桁ゼロ埋めする。
 *
 * 注意:
 * - UTC ではなくローカルタイムで日付を取り出す。タイムゾーンが異なる環境では
 *   結果が変わるため、移設にあたり実装は一切変更していない。
 *
 * @param date - 変換対象の `Date`。
 * @returns `YYYY-MM-DD` 形式の文字列。
 */
export function formatDateToIso(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
