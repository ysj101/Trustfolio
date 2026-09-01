/**
 * Wealth Advisor NAV取得機能の実サイト疎通スクリプト。
 *
 * 使用方法:
 *   WEALTHADVISOR_CODES=sbi_am/sa_202306080A pnpm test:wealthadvisor
 */

import { fileURLToPath } from 'url';

const codesEnv = process.env.WEALTHADVISOR_CODES || 'sbi_am/sa_202306080A';

/** カンマ区切りの取得元コードから空要素を除外して配列化する。 */
export function parseCodes(value) {
  return value
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code !== '');
}

const codes = parseCodes(codesEnv);

// WealthAdvisorService.tsのWEALTH_ADVISOR_CODE_PATTERNと同期する。
// ハイフンのエスケープは取得元コードの決定済み検証仕様を正確に表すため維持する。
// eslint-disable-next-line no-useless-escape
const WEALTH_ADVISOR_CODE_PATTERN = /^([a-z0-9_]+)\/([A-Za-z0-9_.\-]+)$/;

// GASサービス版と同様に、外部HTMLの桁あふれや構造誤認を防ぐ業務上限を1億円/1万口とする。
const MAX_WEALTH_ADVISOR_NAV_VALUE = 100_000_000;

/** YYYY-MM-DD形式の値が実在する暦日かをUTC基準のround-tripで検証する。 */
function isValidIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return false;
  }
  const [, yearText, monthText, dayText] = match;
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
 * Wealth AdvisorのHTMLから最新の基準価額を抽出する。
 * 本処理を変更する場合はsrc/service/WealthAdvisorService.tsの同名関数も同期して修正する。
 */
export function parseNavFromWealthAdvisorHtml(html) {
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
  const match = parseWindow.match(
    /^<th[^>]*>\s*基準価額\s*<\/th>[\s\S]*?<span[^>]*class="fprice"[^>]*>\s*([0-9,]+)\s*<\/span>\s*円[\s\S]*?<span[^>]*class="ptdate"[^>]*>\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*<\/span>/
  );
  if (match === null) {
    return null;
  }
  const [, valueText, year, month, day] = match;
  const value = Number.parseInt(valueText.replace(/,/g, ''), 10);
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_WEALTH_ADVISOR_NAV_VALUE) {
    return null;
  }
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  if (!isValidIsoDate(date)) {
    return null;
  }
  return { date, value };
}

/** 指定された取得元コードの実ページからNAVを取得する。 */
export async function fetchNav(navSourceCode, fetchFn = fetch) {
  const codeMatch = WEALTH_ADVISOR_CODE_PATTERN.exec(navSourceCode);
  if (codeMatch === null) {
    return {
      navSourceCode,
      url: null,
      statusCode: null,
      nav: null,
      success: false,
      error: '取得元コードの形式が不正です。',
    };
  }
  const company = codeMatch[1];
  const pageId = codeMatch[2];
  const url = `https://apl.wealthadvisor.jp/webasp/${company}/pc/basic/${pageId}.html`;
  try {
    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrustfolioLocalTest/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
    });
    const statusCode = response.status;
    if (statusCode !== 200) {
      return {
        navSourceCode,
        url,
        statusCode,
        nav: null,
        success: false,
        error: null,
      };
    }
    const html = await response.text();
    const nav = parseNavFromWealthAdvisorHtml(html);
    return {
      navSourceCode,
      url,
      statusCode,
      nav,
      success: nav !== null,
      error: nav === null ? 'HTML解析失敗(サイト構造変更の可能性)' : null,
    };
  } catch (error) {
    return {
      navSourceCode,
      url,
      statusCode: null,
      nav: null,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 環境変数で指定された全取得元コードの疎通結果を表示する。 */
export async function run() {
  console.log('Wealth Advisor NAV取得機能の疎通テスト開始');
  console.log(`対象銘柄数: ${codes.length}`);
  console.log('');
  const results = [];
  let successCount = 0;
  let failedCount = 0;
  for (const code of codes) {
    console.log(`[${code}] NAV取得中...`);
    const result = await fetchNav(code);
    results.push(result);
    if (result.success) {
      console.log(`[${code}] 成功: ${result.nav.date} - ¥${result.nav.value.toLocaleString()}`);
      successCount += 1;
    } else {
      const failureMessage =
        result.error !== null ? result.error : `HTTP ${String(result.statusCode)}`;
      console.error(`[${code}] 失敗: ${failureMessage}`);
      failedCount += 1;
    }
    console.log('');
  }
  console.log('=== テスト結果サマリー ===');
  console.log(`総数: ${codes.length}`);
  console.log(`成功: ${successCount}`);
  console.log(`失敗: ${failedCount}`);
  console.log('');
  console.log('=== 詳細結果（JSON） ===');
  console.log(
    JSON.stringify(
      { results, summary: { total: codes.length, success: successCount, failed: failedCount } },
      null,
      2
    )
  );
  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  run().catch((error) => {
    console.error('テスト実行エラー:', error);
    process.exitCode = 1;
  });
}
