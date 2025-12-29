const fundId = process.env.RAKUTEN_FUND_ID || 'JP90C000H1T1';
const quoteUrl = `https://www.rakuten-sec.co.jp/web/fund/detail/?ID=${fundId}`;

function parseNavFromRakutenHtml(html) {
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

async function run() {
  const response = await fetch(quoteUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TrustfolioLocalTest/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
    }
  });

  const statusCode = response.status;
  const html = await response.text();
  const navCandidate = parseNavFromRakutenHtml(html);
  const bodySample = html.slice(0, 500);

  const result = {
    url: quoteUrl,
    fundId,
    statusCode,
    navCandidate,
    bodySample
  };

  console.log(JSON.stringify(result, null, 2));

  if (statusCode !== 200 || navCandidate === null) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('楽天証券へのアクセスに失敗しました:', error);
  process.exitCode = 1;
});
