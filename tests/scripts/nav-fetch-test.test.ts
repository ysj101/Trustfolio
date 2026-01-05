/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { describe, expect, it } from 'vitest';
import { parseNavFromRakutenHtml, fetchNav } from '../../scripts/nav-fetch-test.mjs';
import type { FetchNavResult } from '../../scripts/nav-fetch-test.mjs';

describe('scripts/nav-fetch-test', () => {
  it('HTMLから基準価額を抽出できる', () => {
    // 前提: HTMLに基準価額と更新日が含まれる
    // 事前条件: 金額はカンマ区切りで記載されている
    // 検証: 日付と価額が正しく抽出される
    const html = `
      <html>
        <body>
          2024年3月5日更新
          <th>基準価額</th>
          <span class="value-01">12,345</span>円（3/5）
        </body>
      </html>
    `;
    const result = parseNavFromRakutenHtml(html);
    expect(result).toEqual({ date: '2024-03-05', value: 12345 });
  });

  it('基準価額が見つからない場合はnullを返す', () => {
    // 前提: HTMLに基準価額の記述がない
    // 事前条件: 更新日だけが含まれる
    // 検証: nullが返る
    const html = `<html><body>2024年3月5日更新</body></html>`;
    const result = parseNavFromRakutenHtml(html);
    expect(result).toBeNull();
  });

  it('fetchNavは成功時にnavを返す', async () => {
    // 前提: fetchが200レスポンスとHTMLを返す
    // 事前条件: HTMLに基準価額が含まれる
    // 検証: successがtrueになる
    const html = `
      <html>
        <body>
          2024年3月5日更新
          <th>基準価額</th>
          <span class="value-01">10,000</span>円（3/5）
        </body>
      </html>
    `;
    const fetchFn = (): Promise<{ status: number; text: () => Promise<string> }> =>
      Promise.resolve({
        status: 200,
        text: () => Promise.resolve(html),
      });
    const result: FetchNavResult = await fetchNav('JP90C000H1T1', fetchFn);
    expect(result.success).toBe(true);
    if (result.nav) {
      expect(result.nav.value).toBe(10000);
    }
  });

  it('fetchNavは失敗時にerrorを返す', async () => {
    // 前提: fetchが例外を投げる
    // 事前条件: 例外メッセージが設定されている
    // 検証: successがfalseになる
    const fetchFn = (): Promise<{ status: number; text: () => Promise<string> }> =>
      Promise.reject(new Error('通信失敗'));
    const result: FetchNavResult = await fetchNav('JP90C000H1T1', fetchFn);
    expect(result.success).toBe(false);
    expect(result.error).toBe('通信失敗');
  });
});
