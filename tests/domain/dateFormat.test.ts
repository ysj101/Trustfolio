import { describe, expect, it } from 'vitest';
import { formatDateToIso } from '../../src/domain/dateFormat';

describe('formatDateToIso', () => {
  it('ローカル日付をYYYY-MM-DD形式へ変換する', () => {
    // 前提: ローカルタイムの年月日を持つDateを与える
    // 事前条件: 月は0始まりのため内部で+1される
    // 検証: ゼロ埋めされたYYYY-MM-DD文字列が返る
    const date = new Date(2026, 0, 5); // 2026年1月5日（ローカルタイム）
    expect(formatDateToIso(date)).toBe('2026-01-05');
  });

  it('月と日が2桁の場合もそのまま整形する', () => {
    // 前提: 月・日がともに2桁のDateをローカルタイムで与える
    // 事前条件: ゼロ埋めは2桁では影響しない
    // 検証: 与えた年月日がそのまま整形される
    const date = new Date(2025, 11, 31); // 2025年12月31日（ローカルタイム）
    expect(formatDateToIso(date)).toBe('2025-12-31');
  });
});
