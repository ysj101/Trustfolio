import { describe, expect, it, beforeEach } from 'vite-plus/test';
import { parseNavFromRakutenHtml, run } from '../../scripts/rakuten-integration-test.mjs';

describe('scripts/rakuten-integration-test', () => {
  beforeEach(() => {
    process.exitCode = undefined;
  });

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

  it('runは成功時にexitCodeを設定しない', async () => {
    // 前提: fetchが200レスポンスを返す
    // 事前条件: HTMLに基準価額が含まれる
    // 検証: exitCodeが未設定のままになる
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
    await run(fetchFn);
    expect(process.exitCode).toBeUndefined();
  });

  it('runは失敗時にexitCodeを1に設定する', async () => {
    // 前提: fetchが500レスポンスを返す
    // 事前条件: HTMLに基準価額が含まれない
    // 検証: exitCodeが1になる
    const fetchFn = (): Promise<{ status: number; text: () => Promise<string> }> =>
      Promise.resolve({
        status: 500,
        text: () => Promise.resolve('<html></html>'),
      });
    await run(fetchFn);
    expect(process.exitCode).toBe(1);
  });
});
