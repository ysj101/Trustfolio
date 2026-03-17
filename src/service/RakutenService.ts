import type { Result } from '../domain/types';

/**
 * 楽天証券から取得した基準価額データ。
 */
export type RakutenNavData = {
  /** 日付（YYYY-MM-DD形式） */
  date: string;
  /** 基準価額（円/1万口） */
  value: number;
};

/**
 * 楽天証券からの基準価額取得結果。
 */
export type FetchNavResult = {
  /** 楽天ファンドID */
  rakutenFundId: string;
  /** 取得した基準価額データ（最新1件） */
  nav: RakutenNavData | null;
};

/**
 * 楽天証券から基準価額を取得するサービス。
 */
export type RakutenService = {
  /**
   * 指定された楽天ファンドIDの最新基準価額を取得する。
   * 楽天証券のファンド詳細ページをスクレイピングする。
   */
  fetchLatestNav: (rakutenFundId: string) => Result<FetchNavResult>;
};

export type RakutenQuoteResult = {
  url: string;
  statusCode: number;
  nav: RakutenNavData | null;
};

/**
 * 楽天証券サービスを作成する。
 */
export function createRakutenService(): RakutenService {
  return {
    fetchLatestNav: (rakutenFundId: string): Result<FetchNavResult> => {
      const trimmed = rakutenFundId.trim();
      if (!/^[A-Za-z0-9]{12}$/.test(trimmed)) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: `楽天ファンドIDが不正です: ${rakutenFundId}`,
            field: 'rakutenFundId',
          },
        };
      }

      const quoteResult = fetchRakutenQuote(trimmed);
      if (!quoteResult.success) {
        return { success: false, error: quoteResult.error };
      }

      const nav = quoteResult.value.nav;
      if (nav === null) {
        return {
          success: false,
          error: {
            type: 'unexpected',
            message: `基準価額データを取得できませんでした。statusCode=${String(
              quoteResult.value.statusCode
            )} url=${quoteResult.value.url}`,
          },
        };
      }

      return {
        success: true,
        value: {
          rakutenFundId: trimmed,
          nav,
        },
      };
    },
  };
}

/**
 * 楽天証券のファンド詳細ページから取得可否を確認する。
 */
export function fetchRakutenQuote(rakutenFundId: string): Result<RakutenQuoteResult> {
  const trimmed = rakutenFundId.trim();
  if (!/^[A-Za-z0-9]{12}$/.test(trimmed)) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: `楽天ファンドIDが不正です: ${rakutenFundId}`,
        field: 'rakutenFundId',
      },
    };
  }

  const url = `https://www.rakuten-sec.co.jp/web/fund/detail/?ID=${trimmed}`;
  const response = safeFetch(url, {
    method: 'get',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TrustfolioBot/1.0)',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    },
    muteHttpExceptions: true,
  });

  if (response === null) {
    return {
      success: false,
      error: {
        type: 'unexpected',
        message: '楽天証券へのアクセスに失敗しました。',
      },
    };
  }

  const statusCode = response.getResponseCode();
  const html = response.getContentText();
  const nav = parseNavFromRakutenHtml(html);

  if (statusCode !== 200) {
    return {
      success: false,
      error: {
        type: 'unexpected',
        message: `楽天証券から200以外のレスポンスが返りました: ${String(statusCode)}`,
      },
    };
  }

  return {
    success: true,
    value: {
      url,
      statusCode,
      nav,
    },
  };
}

/**
 * 外部APIへのHTTPリクエストを安全に実行する（腐敗防止層）。
 * ネットワークエラーなどの例外をキャッチしてnullを返す。
 */
function safeFetch(
  url: string,
  options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions
): GoogleAppsScript.URL_Fetch.HTTPResponse | null {
  try {
    return UrlFetchApp.fetch(url, options);
  } catch {
    return null;
  }
}

/**
 * 楽天証券のHTMLから最新の基準価額を抽出する。
 */
function parseNavFromRakutenHtml(html: string): RakutenNavData | null {
  const updateMatch = /(\d{4})年(\d{1,2})月(\d{1,2})日更新/.exec(html);
  const updateYear = updateMatch?.[1] ?? '';
  const updateMonth = updateMatch?.[2] ?? '';
  const updateDay = updateMatch?.[3] ?? '';
  const navMatch =
    /<th>\s*基準価額\s*<\/th>[\s\S]*?<span[^>]*class="value-01"[^>]*>\s*([0-9,]+)\s*<\/span>[\s\S]*?円\s*[(（]\s*(\d{1,2})\/(\d{1,2})\s*[)）]/.exec(
      html
    );
  const valueText = navMatch?.[1] ?? '';
  if (valueText === '') {
    return null;
  }
  const value = parseInt(valueText.replace(/,/g, ''), 10);
  if (Number.isNaN(value) || value <= 0) {
    return null;
  }

  const navMonth = navMatch?.[2] ?? '';
  const navDay = navMatch?.[3] ?? '';
  const year = updateYear;
  const month = navMonth || updateMonth;
  const day = navDay || updateDay;
  if (!year || !month || !day) {
    return null;
  }

  return {
    date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
    value,
  };
}
