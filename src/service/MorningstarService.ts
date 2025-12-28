import type { Result } from '../domain/types';

/**
 * モーニングスターから取得した基準価額データ。
 */
export type MorningstarNavData = {
  /** 日付（YYYY-MM-DD形式） */
  date: string;
  /** 基準価額（円/1万口） */
  value: number;
};

/**
 * モーニングスターからの基準価額取得結果。
 */
export type FetchNavResult = {
  /** モーニングスターコード */
  morningstarCode: string;
  /** 取得した基準価額データ（最新1件） */
  nav: MorningstarNavData | null;
};

/**
 * モーニングスターから基準価額を取得するサービス。
 */
export type MorningstarService = {
  /**
   * 指定されたモーニングスターコードの最新基準価額を取得する。
   * モーニングスターのCSVダウンロードAPIを使用する。
   */
  fetchLatestNav: (morningstarCode: string) => Result<FetchNavResult>;
};

/**
 * モーニングスターサービスを作成する。
 */
export function createMorningstarService(): MorningstarService {
  return {
    fetchLatestNav: (morningstarCode: string): Result<FetchNavResult> => {
      if (!/^\d{10}$/.test(morningstarCode)) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: `モーニングスターコードが不正です: ${morningstarCode}`,
            field: 'morningstarCode',
          },
        };
      }

      const nav = fetchNavFromMorningstar(morningstarCode);
      return {
        success: true,
        value: {
          morningstarCode,
          nav,
        },
      };
    },
  };
}

/**
 * モーニングスターのCSVダウンロードAPIから基準価額を取得する。
 * 取得できない場合はnullを返す。
 * 注意: この関数は外部APIを呼び出すため、腐敗防止層として例外をキャッチしてnullを返す。
 */
function fetchNavFromMorningstar(morningstarCode: string): MorningstarNavData | null {
  // 取得期間：直近7日間（休日を考慮して余裕を持たせる）
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 7);

  const toDateStr = formatDateForApi(today);
  const fromDateStr = formatDateForApi(fromDate);

  const url = 'https://www.morningstar.co.jp/FundData/DownloadStdYmd.do';

  // モーニングスターAPIのフォームパラメータ（外部APIの仕様に従う）
  /* eslint-disable @typescript-eslint/naming-convention */
  const payload = {
    fundcode: morningstarCode,
    selectbase: '0', // 0: 日次
    selectdatefrom_Y: fromDateStr.substring(0, 4),
    selectdatefrom_M: fromDateStr.substring(5, 7),
    selectdatefrom_D: fromDateStr.substring(8, 10),
    selectdateto_Y: toDateStr.substring(0, 4),
    selectdateto_M: toDateStr.substring(5, 7),
    selectdateto_D: toDateStr.substring(8, 10),
  };
  /* eslint-enable @typescript-eslint/naming-convention */

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    payload,
    muteHttpExceptions: true,
  };

  // 外部APIへのリクエスト（腐敗防止層としてエラーをnullに変換）
  const response = safeFetch(url, options);
  if (response === null) {
    return null;
  }

  const responseCode = response.getResponseCode();
  if (responseCode !== 200) {
    return null;
  }

  // レスポンスはShift_JISでエンコードされているため、UTF-8に変換
  const blob = response.getBlob();
  const csvText = blob.getDataAsString('Shift_JIS');

  return parseLatestNavFromCsv(csvText);
}

/**
 * 外部APIへのHTTPリクエストを安全に実行する（腐敗防止層）。
 * ネットワークエラーなどの例外をキャッチしてnullを返す。
 */
function safeFetch(
  url: string,
  options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions
): GoogleAppsScript.URL_Fetch.HTTPResponse | null {
  /* eslint-disable no-restricted-syntax */
  try {
    return UrlFetchApp.fetch(url, options);
  } catch {
    return null;
  }
  /* eslint-enable no-restricted-syntax */
}

/**
 * CSVから最新の基準価額を抽出する。
 * CSVフォーマット：日付,基準価額,純資産,... （ヘッダー行あり）
 */
function parseLatestNavFromCsv(csvText: string): MorningstarNavData | null {
  const lines = csvText.split('\n').filter((line) => line.trim() !== '');

  // ヘッダー行をスキップし、最新のデータ行を取得（CSVは古い日付順なので最後の行が最新）
  if (lines.length < 2) {
    return null;
  }

  // 最新のデータ行を取得（最後の行）
  const latestLine = lines[lines.length - 1];
  if (!latestLine) {
    return null;
  }

  const columns = latestLine.split(',');
  if (columns.length < 2) {
    return null;
  }

  // 日付の解析（YYYY/MM/DD形式）
  const dateStr = columns[0]?.trim();
  if (!dateStr) {
    return null;
  }
  const dateParts = dateStr.split('/');
  if (dateParts.length !== 3) {
    return null;
  }
  const year = dateParts[0];
  const month = dateParts[1];
  const day = dateParts[2];
  if (!year || !month || !day) {
    return null;
  }
  const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

  // 基準価額の解析
  const valueStr = columns[1]?.trim().replace(/,/g, '');
  if (!valueStr) {
    return null;
  }
  const value = parseInt(valueStr, 10);
  if (Number.isNaN(value) || value <= 0) {
    return null;
  }

  return {
    date: isoDate,
    value,
  };
}

/**
 * DateオブジェクトをYYYY-MM-DD形式の文字列に変換する。
 */
function formatDateForApi(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(year)}-${month}-${day}`;
}
