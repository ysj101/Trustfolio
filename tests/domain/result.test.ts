import { describe, expect, it } from 'vite-plus/test';
import { fail, propagateFailure } from '../../src/domain/result';
import type { Result } from '../../src/domain/types';

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

describe('propagateFailure', () => {
  it('失敗Resultを渡すと同一のerrorを保持したResultが返る（passthrough）', () => {
    // 前提: 下位処理が返した失敗 Result（ここでは Result<number> 型）を、
    //       上位の戻り値型（ここでは Result<string>）へ付け替えて伝播する状況を模す。
    // 事前条件: 失敗 Result を生成し、success が false であることを確認してから渡す。
    // 検証: 戻り値の error が、入力の error と「同一オブジェクト参照」かつ
    //       type / message / field の内容が一切変化しないこと。
    const original = fail<number>('not_found', '指定された銘柄が見つかりません。', 'fundId');
    // fail-fast: 前提（失敗 Result）が崩れたらアサーションをスキップせず即座に失敗させる
    if (original.success) {
      throw new Error('前提条件違反: original は失敗 Result のはずです。');
    }

    // 上位の戻り値型 Result<string> へ代入できること（変性: Result<never> は任意の Result<T> に代入可能）
    const propagated: Result<string> = propagateFailure(original);
    if (propagated.success) {
      throw new Error('伝播後も失敗 Result のはずです。');
    }

    // error の中身が変化しないこと（外部挙動の不変性の保証）
    expect(propagated.error).toEqual({
      type: 'not_found',
      message: '指定された銘柄が見つかりません。',
      field: 'fundId',
    });
    // 新規オブジェクトを生成せず、入力の error をそのまま返すこと
    expect(propagated.error).toBe(original.error);
  });

  it('field無しの失敗Resultでもerrorのキー構成を維持したまま伝播する', () => {
    // 前提: field キーを持たない失敗 Result を伝播する。
    // 事前条件: fail を field 無しで生成する。
    // 検証: 伝播後も field キーが追加されず、type / message のみで構成されること。
    const original = fail<number[]>('unexpected', '想定外のエラーが発生しました。');
    // fail-fast: 前提（失敗 Result）が崩れたらアサーションをスキップせず即座に失敗させる
    if (original.success) {
      throw new Error('前提条件違反: original は失敗 Result のはずです。');
    }

    const propagated: Result<string> = propagateFailure(original);
    if (propagated.success) {
      throw new Error('伝播後も失敗 Result のはずです。');
    }

    expect(propagated.error).toEqual({
      type: 'unexpected',
      message: '想定外のエラーが発生しました。',
    });
    expect('field' in propagated.error).toBe(false);
  });
});
