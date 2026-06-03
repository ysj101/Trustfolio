import { describe, expect, it } from 'vitest';
import { fail } from '../../src/domain/result';

describe('fail', () => {
  it('fieldを省略した場合はerrorにfieldキーを含めない', () => {
    // 前提: 入力起因ではないエラーを生成する
    // 事前条件: 第3引数fieldは渡さない
    // 検証: success=false かつ error が { type, message } のみで構成される
    const result = fail('unexpected', '想定外のエラーが発生しました。');
    expect(result.success).toBe(false);
    if (!result.success) {
      // fieldキー自体が存在しないこと（旧Repository層の挙動を維持）
      expect(result.error).toEqual({
        type: 'unexpected',
        message: '想定外のエラーが発生しました。',
      });
      expect('field' in result.error).toBe(false);
    }
  });

  it('fieldを指定した場合はerrorにfieldを含める', () => {
    // 前提: 入力フィールド起因のバリデーションエラーを生成する
    // 事前条件: 第3引数fieldに対象フィールド名を渡す
    // 検証: error に type / message / field が設定される
    const result = fail('validation', '銘柄を選択してください。', 'fundId');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toEqual({
        type: 'validation',
        message: '銘柄を選択してください。',
        field: 'fundId',
      });
    }
  });
});
