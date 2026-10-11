import { describe, expect, it, vi } from 'vite-plus/test';
import { runRakutenIntegrationTest } from '../../src/integration/RakutenIntegrationTest';
import * as RakutenService from '../../src/service/RakutenService';
import { ok } from '../fakes';

describe('RakutenIntegrationTest', () => {
  it('楽天ファンドIDの固定値で取得処理を呼び出す', () => {
    // 前提: 楽天ファンドIDは固定である
    // 事前条件: fetchRakutenQuoteをスタブする
    // 検証: 指定IDで呼ばれる
    const spy = vi.spyOn(RakutenService, 'fetchRakutenQuote').mockReturnValue(
      ok({
        url: 'https://example.com',
        statusCode: 200,
        nav: { date: '2024-03-05', value: 12345 },
      })
    );

    const result = runRakutenIntegrationTest();
    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledWith('JP90C000H1T1');
  });
});
