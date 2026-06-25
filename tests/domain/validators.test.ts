import { describe, expect, it } from 'vitest';
import {
  isValidIsoDate,
  validateNonEmptyString,
  validatePositiveNumber,
  validateRecurringDay,
} from '../../src/domain/validators';

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
  const メッセージ = '注文日は1〜28の範囲で入力してください。';

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

  it('NaN・数値以外はvalidationエラーを返す', () => {
    // 前提: NaN と文字列を与える
    // 検証: いずれも validation エラーが返る
    expect(validateRecurringDay(Number.NaN, メッセージ, 'executionDay').success).toBe(false);
    expect(validateRecurringDay('15', メッセージ, 'executionDay').success).toBe(false);
  });

  it('範囲内の非整数（例: 1.5）は元実装の挙動どおり許容する', () => {
    // 前提: 1.5 を与える（仕様文言は「整数」だが、元実装は整数判定をしていなかった）
    // 事前条件: 既存挙動の互換性維持のため Number.isInteger では弾かない
    // 検証: 成功し、入力値 1.5 がそのまま返る
    const result = validateRecurringDay(1.5, メッセージ, 'executionDay');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(1.5);
    }
  });
});
