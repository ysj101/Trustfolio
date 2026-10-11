import { describe, expect, it, vi } from 'vite-plus/test';
import { generateUlid } from '../../src/utils/ulid';

describe('ulid', () => {
  it('ULIDが26文字のCrockford Base32で生成される', () => {
    // 前提: 時刻と乱数を固定する
    // 事前条件: Math.randomは常に0を返す
    // 検証: 生成結果が26文字かつ許容文字のみで構成される
    vi.spyOn(Date, 'now').mockReturnValue(0);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const value = generateUlid();
    expect(value).toHaveLength(26);
    expect(value).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]+$/);
  });
});
