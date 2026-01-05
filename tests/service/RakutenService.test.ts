import { describe, expect, it, vi } from 'vitest';
import { createRakutenService, fetchRakutenQuote } from '../../src/service/RakutenService';

describe('RakutenService', () => {
  it('楽天ファンドIDが不正な場合はバリデーションエラーになる', () => {
    // 前提: 楽天ファンドIDが12桁の英数字ではない
    // 事前条件: 外部通信は行わない
    // 検証: rakutenFundIdフィールドのエラーが返る
    const result = fetchRakutenQuote('invalid');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('rakutenFundId');
    }
  });

  it('基準価額HTMLを解析して取得する', () => {
    // 前提: HTMLに基準価額と更新日が含まれる
    // 事前条件: UrlFetchApp.fetchが200レスポンスを返す
    // 検証: 基準価額データが返る
    const html = `
      <html>
        <body>
          2024年3月5日更新
          <th>基準価額</th>
          <span class="value-01">12,345</span>円（3/5）
        </body>
      </html>
    `;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });

    const result = fetchRakutenQuote('ABCD1234EFGH');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav?.date).toBe('2024-03-05');
      expect(result.value.nav?.value).toBe(12345);
    }

    fetchMock.mockRestore();
  });

  it('基準価額が取得できない場合はエラーになる', () => {
    // 前提: HTMLに基準価額が存在しない
    // 事前条件: UrlFetchApp.fetchが200レスポンスを返す
    // 検証: 想定外エラーが返る
    const html = `<html><body>2024年3月5日更新</body></html>`;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });

    const service = createRakutenService();
    const result = service.fetchLatestNav('ABCD1234EFGH');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
    }

    fetchMock.mockRestore();
  });

  it('ステータスコードが200以外の場合はエラーになる', () => {
    // 前提: 200以外のレスポンスが返る
    // 事前条件: HTMLに基準価額が含まれる
    // 検証: unexpectedエラーが返る
    const html = `
      <html>
        <body>
          2024年3月5日更新
          <th>基準価額</th>
          <span class="value-01">12,345</span>円（3/5）
        </body>
      </html>
    `;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 500,
      getContentText: () => html,
    });

    const result = fetchRakutenQuote('ABCD1234EFGH');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
    }

    fetchMock.mockRestore();
  });

  it('通信失敗時は予期しないエラーを返す', () => {
    // 前提: 通信例外が発生する
    // 事前条件: UrlFetchApp.fetchが例外を投げる
    // 検証: unexpectedエラーが返る
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue(null);

    const result = fetchRakutenQuote('ABCD1234EFGH');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
    }

    fetchMock.mockRestore();
  });
});
