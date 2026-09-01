import { fail } from '../domain/result';
import type { FetchedNavData, Result } from '../domain/types';
import { formatIsoDateParts, isValidCalendarIsoDate } from '../utils/dateTime';
import { HTML_FETCH_HEADERS, safeFetchHtml } from './htmlFetcher';

/**
 * Wealth Advisor取得元コードの検証と分解に使用する正規表現。
 * 第1キャプチャはcompany、第2キャプチャはpageIdを表す。
 */
// ハイフンのエスケープは取得元コードの決定済み検証仕様を正確に表すため維持する。
// eslint-disable-next-line no-useless-escape
export const WEALTH_ADVISOR_CODE_PATTERN = /^([a-z0-9_]+)\/([A-Za-z0-9_.\-]+)$/;

/** Wealth Advisorから取得した基準価額データ。 */
export type WealthAdvisorNavData = FetchedNavData;

// 基準価額は円/1万口として扱い、外部HTMLの桁あふれや構造誤認を防ぐ業務上限を1億円とする。
const MAX_WEALTH_ADVISOR_NAV_VALUE = 100_000_000;

/** Wealth Advisorからの基準価額取得結果。 */
export type FetchWealthAdvisorNavResult = {
  /** 取得元コード（`<company>/<pageId>`形式）。 */
  navSourceCode: string;
  /** 取得した基準価額データ（最新1件）。 */
  nav: WealthAdvisorNavData;
};

/** Wealth Advisorから基準価額を取得するサービス。 */
export type WealthAdvisorService = {
  /** 指定された取得元コードの最新基準価額を取得する。 */
  fetchLatestNav: (navSourceCode: string) => Result<FetchWealthAdvisorNavResult>;
};

/** Wealth Advisorのファンドページ取得結果。 */
export type WealthAdvisorQuoteResult = {
  /** 取得先URL。 */
  url: string;
  /** HTTPステータスコード。 */
  statusCode: number;
  /** HTMLから抽出した基準価額。 */
  nav: WealthAdvisorNavData | null;
};

/**
 * Wealth Advisorから基準価額を取得するサービスを作成する。
 * 公開メソッドは取得元コードの検証、HTTP取得、HTML解析を順に実行し、途中失敗をResult型で返す。
 */
export function createWealthAdvisorService(): WealthAdvisorService {
  return {
    fetchLatestNav: (navSourceCode: string): Result<FetchWealthAdvisorNavResult> => {
      const trimmed = navSourceCode.trim();
      const quoteResult = fetchWealthAdvisorQuote(trimmed);
      if (!quoteResult.success) {
        return quoteResult;
      }
      if (quoteResult.value.nav === null) {
        return fail(
          'unexpected',
          `基準価額データを取得できませんでした。statusCode=${String(quoteResult.value.statusCode)} url=${quoteResult.value.url}`
        );
      }
      return {
        success: true,
        value: { navSourceCode: trimmed, nav: quoteResult.value.nav },
      };
    },
  };
}

/**
 * Wealth Advisorのファンドページから取得可否を確認する。
 * 取得元コードを検証してURLを組み立て、HTTP 200の場合だけHTML解析結果を返す。
 */
export function fetchWealthAdvisorQuote(navSourceCode: string): Result<WealthAdvisorQuoteResult> {
  const trimmed = navSourceCode.trim();
  const codeMatch = WEALTH_ADVISOR_CODE_PATTERN.exec(trimmed);
  if (codeMatch === null) {
    return fail(
      'validation',
      `Wealth Advisor取得元コードが不正です: ${navSourceCode}`,
      'navSourceCode'
    );
  }
  const company = codeMatch[1];
  const pageId = codeMatch[2];
  const url = `https://apl.wealthadvisor.jp/webasp/${company}/pc/basic/${pageId}.html`;
  const response = safeFetchHtml(url, {
    method: 'get',
    headers: HTML_FETCH_HEADERS,
    muteHttpExceptions: true,
  });
  if (response === null) {
    return fail('unexpected', 'Wealth Advisorへのアクセスに失敗しました。');
  }
  const statusCode = response.getResponseCode();
  if (statusCode !== 200) {
    return fail(
      'unexpected',
      `Wealth Advisorから200以外のレスポンスが返りました: ${String(statusCode)}`
    );
  }
  const html = response.getContentText();
  const nav = parseNavFromWealthAdvisorHtml(html);
  return { success: true, value: { url, statusCode, nav } };
}

/**
 * Wealth AdvisorのHTMLから最新の基準価額を抽出する。
 * 基準価額見出し以降で最初に現れるptdateだけを対象とし、後続の評価基準日を取得しない。
 * 本処理を変更する場合はscripts/wealthadvisor-fetch-test.mjsの同名関数も同期して修正する。
 */
function parseNavFromWealthAdvisorHtml(html: string): WealthAdvisorNavData | null {
  const heading = /<th[^>]*>\s*基準価額\s*<\/th>/.exec(html);
  if (heading === null) {
    return null;
  }
  let parseWindow = html.slice(heading.index, heading.index + 2000);
  const evaluationDateIndex = parseWindow.indexOf('評価基準日');
  if (evaluationDateIndex !== -1) {
    // 評価基準日領域をNAV日付候補から明示的に除外する。別の日付へ切り替える暗黙フォールバックではない。
    parseWindow = parseWindow.slice(0, evaluationDateIndex);
  }
  const match =
    /^<th[^>]*>\s*基準価額\s*<\/th>[\s\S]*?<span[^>]*class="fprice"[^>]*>\s*([0-9,]+)\s*<\/span>\s*円[\s\S]*?<span[^>]*class="ptdate"[^>]*>\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*<\/span>/.exec(
      parseWindow
    );
  if (match === null) {
    return null;
  }
  const [, valueText, year, month, day] = match;
  if (valueText === undefined || year === undefined || month === undefined || day === undefined) {
    return null;
  }
  const value = parseInt(valueText.replace(/,/g, ''), 10);
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_WEALTH_ADVISOR_NAV_VALUE) {
    return null;
  }
  const date = formatIsoDateParts(Number(year), Number(month), Number(day));
  if (!isValidCalendarIsoDate(date)) {
    return null;
  }
  return {
    date,
    value,
  };
}
