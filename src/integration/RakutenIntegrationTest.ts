import type { Result } from '../domain/types';
import type { RakutenNavData } from '../service/RakutenService';
import { fetchRakutenQuote } from '../service/RakutenService';

export type RakutenIntegrationTestResult = {
  url: string;
  statusCode: number;
  nav: RakutenNavData | null;
};

/**
 * 楽天証券のデータ取得可否を確認する結合テスト。
 * 対象URL: https://www.rakuten-sec.co.jp/web/fund/detail/?ID=JP90C000H1T1
 */
export function runRakutenIntegrationTest(): Result<RakutenIntegrationTestResult> {
  const rakutenFundId = 'JP90C000H1T1';
  return fetchRakutenQuote(rakutenFundId);
}
