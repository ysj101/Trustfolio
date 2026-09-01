/**
 * HTML取得サービスが共通で送信するHTTPリクエストヘッダー。
 * 楽天証券とWealth Advisorの双方でブラウザ相当のHTMLレスポンスを要求する。
 */
export const HTML_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; TrustfolioBot/1.0)',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
} as const;

/**
 * 外部サイトへのHTTPリクエストを安全に実行する腐敗防止層。
 * UrlFetchApp固有の通信例外を捕捉し、呼び出し元がResult型へ変換できるようnullを返す。
 *
 * @param url 取得対象URL。
 * @param options GASのHTTPリクエスト設定。
 * @returns HTTPレスポンス。通信例外が発生した場合はnull。
 */
export function safeFetchHtml(
  url: string,
  options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions
): GoogleAppsScript.URL_Fetch.HTTPResponse | null {
  try {
    return UrlFetchApp.fetch(url, options);
  } catch {
    return null;
  }
}
