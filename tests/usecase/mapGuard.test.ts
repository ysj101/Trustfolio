import { describe, expect, it } from 'vitest';
import { requireMapValue } from '../../src/usecase/mapGuard';

describe('requireMapValue', () => {
  it('キーが存在する場合は値を成功で返す', () => {
    // 前提: 取引履歴Mapに対象銘柄のキーと取引履歴が存在する。
    // 事前条件: Mapの値は空でない取引履歴である。
    // 検証: requireMapValueは値をsuccessとして返す。
    const result = requireMapValue(
      new Map([['国内株式ファンド', ['購入取引']]]),
      '国内株式ファンド',
      '取引履歴'
    );
    expect(result).toEqual({ success: true, value: ['購入取引'] });
  });

  it('値がnullの場合もnullを成功で返す', () => {
    // 前提: 基準価額Mapに対象銘柄のキーがあり、基準価額が未登録でnullである。
    // 事前条件: nullは正常な「基準価額なし」を表す。
    // 検証: nullをキー欠落と誤判定せずsuccessとして返す。
    const result = requireMapValue(
      new Map<string, null>([['基準価額未登録ファンド', null]]),
      '基準価額未登録ファンド',
      '基準価額'
    );
    expect(result).toEqual({ success: true, value: null });
  });

  it('キーが存在しない場合は銘柄情報を含むunexpected失敗を返す', () => {
    // 前提: 基準価額Mapに対象銘柄のキーが存在しない。
    // 事前条件: ラベルと銘柄IDを指定して契約違反を検知する。
    // 検証: unexpectedエラーにラベルと銘柄IDが含まれる。
    const result = requireMapValue(new Map<string, null>(), '存在しないファンド', '基準価額');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('基準価額');
      expect(result.error.message).toContain('存在しないファンド');
    }
  });

  it('undefinedを値に持つ既存キーは成功としてundefinedを返す', () => {
    // 前提: Mapに「対象ファンド」キーが存在し、その値がundefinedである。
    // 事前条件: キーの有無はgetの戻り値ではなくhasで判定する必要がある。
    // getだけで判定すると、存在するundefined値をキー欠落と誤判定するためである。
    // 検証: requireMapValueはキー欠落と誤判定せず、undefinedをsuccessとして返す。
    const result = requireMapValue(
      new Map<string, string | undefined>([['対象ファンド', undefined]]),
      '対象ファンド',
      '取引履歴'
    );
    expect(result).toEqual({ success: true, value: undefined });
  });
});
