import type { Result } from './types';

const UNITS_BASE = 10000;

/**
 * 購入口数を計算する。
 * 計算結果が0以下の場合は失敗として扱う。
 */
export function calculateUnits(amount: number, fee: number, navValue: number): Result<number> {
  if (amount <= 0) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '購入金額は0より大きい必要があります。',
        field: 'amount',
      },
    };
  }
  if (fee < 0) {
    return {
      success: false,
      error: { type: 'validation', message: '手数料は0以上で入力してください。', field: 'fee' },
    };
  }
  if (fee >= amount) {
    return {
      success: false,
      error: { type: 'validation', message: '手数料が購入金額を超えています。', field: 'fee' },
    };
  }
  if (navValue <= 0) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '基準価額は0より大きい必要があります。',
        field: 'navValue',
      },
    };
  }

  const units = Math.floor(((amount - fee) / navValue) * UNITS_BASE);
  if (units <= 0) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '計算された口数が0以下です。購入金額を見直してください。',
        field: 'amount',
      },
    };
  }

  return { success: true, value: units };
}

/**
 * 評価額を計算する。
 */
export function calculateValue(units: number, navValue: number): number {
  return Math.round((units / UNITS_BASE) * navValue);
}
