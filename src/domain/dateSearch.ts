/**
 * 「基準日＋日数オフセット列」から探索候補の日付文字列を順に生成し、
 * 最初に見つかったレコードを返すための共通ヘルパー群。
 *
 * 背景・目的:
 * - 「約7日前のデータを、オフセット列の優先順で探して最初のヒットを採用する」という
 *   前週レコード探索が、`WeeklyReportUseCase`（全体実績の前週データ）と
 *   `MarketIndexAlertUseCase`（市場指数の前週データ）に別実装で存在していた（H4 #150）。
 * - 両者は「候補日付の生成 → 順に照合して最初のヒットを採用」という骨格が同一で、
 *   差分は (a) オフセット列、(b) 日付の文字列化方式（JST の formatJstDate /
 *   ローカル TZ の formatDateToIso。TZ 方針は src/utils/dateTime.ts を参照）、
 *   (c) 照合先（リポジトリ I/O / メモリ上の配列）のみである。
 *   骨格を本モジュールへ集約し、差分は引数（オフセット列・フォーマッタ・lookup）で注入する。
 *
 * 注意:
 * - 探索順序は渡された `offsets` の並び順を厳密に維持する（呼び出し側の既存挙動を変えない）。
 * - 日付の文字列化方式は呼び出し側ごとに異なる既存方式を維持するため、`formatDate` として
 *   注入する（H7 #153 では両方式を1方式へ統一せず、意図的な使い分けとして
 *   src/utils/dateTime.ts の方針コメントに文書化した）。
 */

/**
 * 基準日に各オフセット（日数）を適用した候補日付文字列の配列を、オフセット列の順で生成する。
 *
 * @param baseDate - 探索の基準日。呼び出し元の Date は変更しない（防御的にコピーする）。
 * @param offsets - 基準日へ加算する日数オフセットの列。この並び順が探索の優先順になる。
 * @param formatDate - Date を `YYYY-MM-DD` 文字列へ変換する関数（呼び出し側の既存方式を注入）。
 * @returns オフセット順の候補日付文字列の配列。
 */
export function buildOffsetDateCandidates(
  baseDate: Date,
  offsets: readonly number[],
  formatDate: (date: Date) => string
): string[] {
  return offsets.map((offset) => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + offset);
    return formatDate(date);
  });
}

/**
 * 候補日付を先頭から順に照合し、最初に見つかったレコードをヒット日付付きで返す。
 *
 * @typeParam T - 探索対象のレコード型。
 * @param candidateDates - {@link buildOffsetDateCandidates} 等で生成した候補日付（優先順）。
 * @param lookup - 1つの日付に対するレコード取得関数。見つからない場合は null を返すこと
 *   （リポジトリ I/O・メモリ上の配列検索のどちらでも包んで注入できる）。
 * @returns 最初にヒットした `{ date, record }`。全候補で見つからなければ null。
 */
export function findFirstRecordByDateCandidates<T>(
  candidateDates: readonly string[],
  lookup: (dateStr: string) => T | null
): { date: string; record: T } | null {
  for (const dateStr of candidateDates) {
    const record = lookup(dateStr);
    if (record !== null) {
      return { date: dateStr, record };
    }
  }
  return null;
}
