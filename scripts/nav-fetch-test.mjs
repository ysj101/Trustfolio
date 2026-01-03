/**
 * NAV自動取得機能の統合テスト
 *
 * 楽天証券から複数銘柄のNAVを取得し、正常に動作することを確認する。
 *
 * 使用方法:
 *   RAKUTEN_FUND_IDS=JP90C000H1T1,JP90C000FXB7 pnpm test:nav-fetch
 */

import { fileURLToPath } from 'url';

const fundIdsEnv = process.env.RAKUTEN_FUND_IDS || 'JP90C000H1T1';
const fundIds = fundIdsEnv.split(',').map((id) => id.trim());

export function parseNavFromRakutenHtml(html) {
  const updateMatch = html.match(/(\d{4})年(\d{1,2})月(\d{1,2})日更新/);
  const updateYear = updateMatch?.[1] ?? '';
  const updateMonth = updateMatch?.[2] ?? '';
  const updateDay = updateMatch?.[3] ?? '';
  const navMatch = html.match(
    /<th>\s*基準価額\s*<\/th>[\s\S]*?<span[^>]*class="value-01"[^>]*>\s*([0-9,]+)\s*<\/span>[\s\S]*?円\s*[(（]\s*(\d{1,2})\/(\d{1,2})\s*[)）]/
  );
  const valueText = navMatch?.[1] ?? '';
  if (valueText === '') {
    return null;
  }
  const value = Number.parseInt(valueText.replace(/,/g, ''), 10);
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
    value
  };
}

export async function fetchNav(fundId, fetchFn = fetch) {
  const url = `https://www.rakuten-sec.co.jp/web/fund/detail/?ID=${fundId}`;

  try {
    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TrustfolioLocalTest/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    });

    const statusCode = response.status;
    const html = await response.text();
    const nav = parseNavFromRakutenHtml(html);

    return {
      fundId,
      url,
      statusCode,
      nav,
      success: statusCode === 200 && nav !== null,
      error: null
    };
  } catch (error) {
    return {
      fundId,
      url,
      statusCode: null,
      nav: null,
      success: false,
      error: error.message
    };
  }
}

export async function run() {
  console.log('NAV自動取得機能の統合テスト開始');
  console.log(`対象銘柄数: ${fundIds.length}`);
  console.log('');

  const results = [];
  let successCount = 0;
  let failedCount = 0;

  for (const fundId of fundIds) {
    console.log(`[${fundId}] NAV取得中...`);
    const result = await fetchNav(fundId);
    results.push(result);

    if (result.success) {
      console.log(`[${fundId}] 成功: ${result.nav.date} - ¥${result.nav.value.toLocaleString()}`);
      successCount++;
    } else {
      console.error(`[${fundId}] 失敗: ${result.error || `HTTP ${result.statusCode}`}`);
      failedCount++;
    }
    console.log('');
  }

  // サマリー
  console.log('=== テスト結果サマリー ===');
  console.log(`総数: ${fundIds.length}`);
  console.log(`成功: ${successCount}`);
  console.log(`失敗: ${failedCount}`);
  console.log('');

  // 詳細結果（JSON形式）
  console.log('=== 詳細結果（JSON） ===');
  console.log(JSON.stringify({ results, summary: { total: fundIds.length, success: successCount, failed: failedCount } }, null, 2));

  // テスト失敗時は終了コード1を返す
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
