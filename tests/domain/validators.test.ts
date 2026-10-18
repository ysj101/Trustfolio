import { describe, expect, it } from 'vite-plus/test';
import {
  isAssetClass,
  isValidIsoDate,
  isValidRecurringDay,
  validateAssetClass,
  validateNonEmptyString,
  validatePositiveNumber,
  validateRecurringDay,
} from '../../src/domain/validators';

describe('isAssetClass', () => {
  it.each(['equity', 'gold'])('許可された資産クラス%sを受理する', (assetClass) => {
    // 前提: AssetClassの許可集合に含まれる値を指定する。
    // 事前条件: 許可集合はtypes.tsのASSET_CLASSESを唯一の定義源とする。
    // 検証: 型ガードがtrueを返す。
    expect(isAssetClass(assetClass)).toBe(true);
  });

  it.each([null, undefined, 'bond', 1])('資産クラスではない値%sを拒否する', (value) => {
    // 前提: null、未指定相当、定義外文字列、または数値を指定する。
    // 事前条件: 暗黙の既定値は使用しない。
    // 検証: 型ガードがfalseを返す。
    expect(isAssetClass(value)).toBe(false);
  });
});

describe('validateAssetClass', () => {
  it.each(['equity', 'gold'])('許可された資産クラス%sを返す', (assetClass) => {
    // 前提: 資産クラスの許可集合には株式と金が定義されている。
    // 事前条件: 検証対象へ許可値を指定する。
    // 検証: 指定した資産クラスを成功値として返す。
    expect(validateAssetClass(assetClass)).toEqual({
      success: true,
      value: assetClass,
    });
  });

  it.each(['', null, undefined, 'bond', 1])('不正な資産クラス%sを拒否する', (value) => {
    // 前提: 資産クラスの許可集合はequityとgoldだけである。
    // 事前条件: 登録フォームの未選択値（空文字列）、null、未指定相当、定義外文字列、または数値を指定する。
    // 検証: 指定したメッセージとfieldを持つvalidationエラーを返す。
    expect(validateAssetClass(value)).toEqual({
      success: false,
      error: {
        type: 'validation',
        message: '資産クラスを選択してください。',
        field: 'assetClass',
      },
    });
  });
});

describe('isValidIsoDate', () => {
  it('妥当なYYYY-MM-DD文字列はtrueを返す', () => {
    // 前提: 形式・日付ともに妥当な文字列を与える
    // 検証: trueが返る
    expect(isValidIsoDate('2026-06-01')).toBe(true);
  });

  it('形式が不正な文字列はfalseを返す', () => {
    // 前提: 区切りや桁数が形式に合わない文字列を与える
    // 検証: falseが返る
    expect(isValidIsoDate('2026/06/01')).toBe(false);
    expect(isValidIsoDate('2026-6-1')).toBe(false);
  });

  it('月や日が範囲外（月13・日32など）の場合はfalseを返す', () => {
    // 前提: 形式は満たすが月・日が範囲外の文字列を与える
    // 事前条件: 正規表現は通過するがDate解釈がNaNになる
    // 検証: falseが返る
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-12-32')).toBe(false);
  });

  it('範囲内だが暦上存在しない日付（2月30日など）はtrueを返す（既知の制限）', () => {
    // 前提: 月1-12・日1-31の範囲内だが実在しない日付を与える
    // 事前条件: V8のDate解釈が翌月へ繰り上がるためNaNにならない
    // 検証: 本バリデータは繰り上がりを検知せずtrueを返す（元実装の挙動を維持）
    expect(isValidIsoDate('2026-02-30')).toBe(true);
  });
});

describe('validateNonEmptyString', () => {
  it('空文字や空白のみの場合はvalidationエラーを返す', () => {
    // 前提: 空白のみの文字列を与える
    // 事前条件: messageとfieldを指定する
    // 検証: validationエラーに指定のmessage/fieldが設定される
    const result = validateNonEmptyString('   ', '銘柄を選択してください。', 'fundId');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.message).toBe('銘柄を選択してください。');
      expect(result.error.field).toBe('fundId');
    }
  });

  it('文字列以外の場合もvalidationエラーを返す', () => {
    // 前提: 数値など文字列以外を与える
    // 検証: validationエラーが返る
    const result = validateNonEmptyString(123, '値を入力してください。', 'name');
    expect(result.success).toBe(false);
  });

  it('空でない文字列はトリムせず元の値を返す', () => {
    // 前提: 前後に空白を含む有効な文字列を与える
    // 事前条件: 既存挙動に合わせ、保存値はトリムしない
    // 検証: 入力した文字列がそのまま返る
    const result = validateNonEmptyString(' 日本株ファンド ', '銘柄を選択してください。', 'fundId');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(' 日本株ファンド ');
    }
  });
});

describe('validatePositiveNumber', () => {
  it('0以下の数値はvalidationエラーを返す', () => {
    // 前提: 0以下の数値を与える
    // 検証: validationエラーに指定のmessage/fieldが設定される
    const result = validatePositiveNumber(
      0,
      '購入金額は0より大きい数値で入力してください。',
      'amount'
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.field).toBe('amount');
    }
  });

  it('NaNや数値以外はvalidationエラーを返す', () => {
    // 前提: NaNと文字列を与える
    // 検証: いずれもvalidationエラーが返る
    expect(validatePositiveNumber(Number.NaN, '金額が不正です。', 'amount').success).toBe(false);
    expect(validatePositiveNumber('1000', '金額が不正です。', 'amount').success).toBe(false);
  });

  it('正の数値はそのまま返す', () => {
    // 前提: 0より大きい数値を与える
    // 検証: 成功し、入力値がそのまま返る
    const result = validatePositiveNumber(10000, '金額が不正です。', 'amount');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(10000);
    }
  });
});

describe('validateRecurringDay', () => {
  const メッセージ = '注文日は1〜28の整数で入力してください。';

  it('範囲内（1〜28）の数値はそのまま返す', () => {
    // 前提: 下限1・上限28・中間値15を与える
    // 検証: いずれも成功し、入力値がそのまま返る
    for (const 注文日 of [1, 15, 28]) {
      const result = validateRecurringDay(注文日, メッセージ, 'executionDay');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(注文日);
      }
    }
  });

  it('範囲外（0以下・29以上）はvalidationエラーを返す', () => {
    // 前提: 下限未満の0と上限超過の29を与える
    // 検証: いずれも validation エラーに指定の message/field が設定される
    for (const 注文日 of [0, 29]) {
      const result = validateRecurringDay(注文日, メッセージ, 'executionDay');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        expect(result.error.message).toBe(メッセージ);
        expect(result.error.field).toBe('executionDay');
      }
    }
  });

  it('NaN・数値以外・無限大はvalidationエラーを返す', () => {
    // 前提: NaN・文字列・無限大（整数ではない特殊な数値）を与える
    // 事前条件: Number.isInteger は NaN・Infinity をいずれも false と判定する
    // 検証: いずれも整数判定で弾かれ validation エラーが返る
    expect(validateRecurringDay(Number.NaN, メッセージ, 'executionDay').success).toBe(false);
    expect(validateRecurringDay('15', メッセージ, 'executionDay').success).toBe(false);
    expect(validateRecurringDay(Number.POSITIVE_INFINITY, メッセージ, 'executionDay').success).toBe(
      false
    );
    expect(validateRecurringDay(Number.NEGATIVE_INFINITY, メッセージ, 'executionDay').success).toBe(
      false
    );
  });

  it('範囲内でも非整数（例: 1.5）は validation エラーを返す', () => {
    // 前提: 範囲(1〜28)内だが非整数の 1.5 を与える
    // 事前条件: 仕様文言「1〜28の整数」・UI(step="1")に合わせ、#133 で整数必須へ統一した。
    //   非整数が約定日計算 formatIsoDate へ到達すると不正な日付文字列を生むため入力境界で弾く。
    // 検証: validation エラーに指定の message/field が設定される
    const result = validateRecurringDay(1.5, メッセージ, 'executionDay');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.message).toBe(メッセージ);
      expect(result.error.field).toBe('executionDay');
    }
  });

  it('境界値の整数（1・28）は許容し、その近傍の非整数（0.5・28.5）は弾く', () => {
    // 前提: 境界の整数と、範囲端付近の非整数を与える
    // 検証: 1・28 は成功、0.5・28.5 は失敗（整数かつ範囲内の両条件を満たす必要がある）
    expect(validateRecurringDay(1, メッセージ, 'executionDay').success).toBe(true);
    expect(validateRecurringDay(28, メッセージ, 'executionDay').success).toBe(true);
    expect(validateRecurringDay(0.5, メッセージ, 'executionDay').success).toBe(false);
    expect(validateRecurringDay(28.5, メッセージ, 'executionDay').success).toBe(false);
  });
});

describe('isValidRecurringDay', () => {
  // isValidRecurringDay は注文日ルール（1〜28の整数）を判定する共有述語であり、
  // 入力境界（validateRecurringDay）と読込境界（parseRow）の双方から利用される。
  it('1〜28の整数のみ true を返し、非整数・範囲外・非数値は false を返す', () => {
    // 前提: 整数の境界値・範囲内、非整数、範囲外整数、非数値・特殊値を与える
    // 検証: 整数かつ1〜28のときのみ true（型ガードとして number へ絞り込まれる）
    expect(isValidRecurringDay(1)).toBe(true);
    expect(isValidRecurringDay(15)).toBe(true);
    expect(isValidRecurringDay(28)).toBe(true);
    expect(isValidRecurringDay(1.5)).toBe(false);
    expect(isValidRecurringDay(0)).toBe(false);
    expect(isValidRecurringDay(29)).toBe(false);
    expect(isValidRecurringDay(99)).toBe(false);
    expect(isValidRecurringDay(Number.NaN)).toBe(false);
    expect(isValidRecurringDay(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidRecurringDay('15')).toBe(false);
  });
});
