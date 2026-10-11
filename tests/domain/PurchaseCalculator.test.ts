import { describe, expect, it } from 'vite-plus/test';
import { calculateUnits, calculateValue } from '../../src/domain/PurchaseCalculator';

describe('PurchaseCalculator', () => {
  it('購入金額が0以下の場合は検証エラーを返す', () => {
    // 前提: 購入金額が無効である
    // 事前条件: 基準価額は妥当な数値とする
    // 検証: バリデーションエラーと対象フィールドが返る
    const result = calculateUnits(0, 12000);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('amount');
      expect(result.error.message).toContain('購入金額');
    }
  });

  it('基準価額が0以下の場合は検証エラーを返す', () => {
    // 前提: 基準価額が無効である
    // 事前条件: 購入金額は妥当な数値とする
    // 検証: バリデーションエラーと対象フィールドが返る
    const result = calculateUnits(10000, 0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('navValue');
      expect(result.error.message).toContain('基準価額');
    }
  });

  it('購入金額と基準価額から切り上げ口数を計算する', () => {
    // 前提: 購入金額と基準価額が妥当である
    // 事前条件: 口数が端数になるケースを用意する
    // 検証: 小数部分が切り上げられた口数が返る
    const result = calculateUnits(1000, 333);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(30031);
    }
  });

  it('評価額を四捨五入して計算する', () => {
    // 前提: 口数と基準価額が妥当である
    // 事前条件: 四捨五入が発生する数値を用意する
    // 検証: 評価額が整数で返る
    const value = calculateValue(15000, 12345);
    expect(value).toBe(18518);
  });
});
