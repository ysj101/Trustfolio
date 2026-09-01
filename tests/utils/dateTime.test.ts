import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clock,
  formatDateToIso,
  formatIsoDateParts,
  formatJstDate,
  formatJstTimestamp,
  isValidIsoDate,
  parseUtcIsoDate,
} from '../../src/utils/dateTime';

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

describe('formatIsoDateParts', () => {
  it('年月日の数値をゼロ埋めしてYYYY-MM-DD形式に整形する', () => {
    // 前提: 月は1始まりの数値で与える（DateのgetMonthのような0始まりではない）
    // 事前条件: 月・日が1桁の場合は2桁にゼロ埋めされる
    // 検証: 2026年1月5日が 2026-01-05 になる
    expect(formatIsoDateParts(2026, 1, 5)).toBe('2026-01-05');
  });

  it('暦上存在しない日付も検証せずそのまま文字列化する', () => {
    // 前提: 6月31日という暦上存在しない年月日を与える
    // 事前条件: Date を経由しないため暦上の妥当性検証は行われない（TSDocに明記した契約）
    // 検証: 与えた数値がそのまま整形される（正規化・エラーは発生しない）
    expect(formatIsoDateParts(2026, 6, 31)).toBe('2026-06-31');
  });
});

describe('formatJstDate / formatJstTimestamp', () => {
  it('formatJstDateはUtilities.formatDateへJSTと日付フォーマットを渡す', () => {
    // 前提: tests/setup.ts で Utilities.formatDate は固定文字列を返すスタブである
    // 事前条件: GAS ランタイム外のため実際の JST 変換はスタブに委ねられる
    // 検証: Asia/Tokyo と yyyy-MM-dd を引数にスタブが呼ばれ、その戻り値が返る
    const date = new Date(2026, 6, 28);
    const result = formatJstDate(date);
    expect(globalThis.Utilities.formatDate).toHaveBeenCalledWith(date, 'Asia/Tokyo', 'yyyy-MM-dd');
    expect(result).toBe('2024-01-01 09:00:00');
  });

  it('formatJstTimestampはUtilities.formatDateへJSTと日時フォーマットを渡す', () => {
    // 前提: tests/setup.ts で Utilities.formatDate は固定文字列を返すスタブである
    // 事前条件: GAS ランタイム外のため実際の JST 変換はスタブに委ねられる
    // 検証: Asia/Tokyo と yyyy-MM-dd HH:mm:ss を引数にスタブが呼ばれ、その戻り値が返る
    const date = new Date(2026, 6, 28, 12, 34, 56);
    const result = formatJstTimestamp(date);
    expect(globalThis.Utilities.formatDate).toHaveBeenCalledWith(
      date,
      'Asia/Tokyo',
      'yyyy-MM-dd HH:mm:ss'
    );
    expect(result).toBe('2024-01-01 09:00:00');
  });
});

describe('parseUtcIsoDate', () => {
  it('YYYY-MM-DD文字列をUTC深夜0時のDateへパースする', () => {
    // 前提: 妥当な YYYY-MM-DD 文字列を与える
    // 事前条件: ローカルTZに依存せず UTC 深夜0時へ固定される
    // 検証: UTC エポックミリ秒が Date.UTC の値と一致する
    const date = parseUtcIsoDate('2026-07-28');
    expect(date.getTime()).toBe(Date.UTC(2026, 6, 28));
  });

  it('暦上存在しない日付は翌月へ繰り上げてパースされる（既知の制限）', () => {
    // 前提: 形式は満たすが暦上存在しない日付（2月30日）を与える
    // 事前条件: V8 は ISO 形式の範囲外日付を Invalid Date にせず繰り上げる
    //   （tests/domain/validators.test.ts の「既知の制限」テストと同一の実挙動）
    // 検証: 2026-02-30 は 2026-03-02（UTC）として解釈される
    const date = parseUtcIsoDate('2026-02-30');
    expect(date.toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });
});

describe('isValidIsoDate', () => {
  it('実在する暦日だけをtrueとして返す', () => {
    // 前提: 外部データ境界で暦日の厳密検証が必要である。
    // 事前条件: 実在する日、Dateが繰り上げる2月30日、月範囲外の99月99日を入力する。
    // 検証: UTC round-tripで年月日が一致する実在日だけがtrueになる。
    expect(isValidIsoDate('2026-09-01')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-99-99')).toBe(false);
  });
});

describe('clock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('now()は現在時刻のDateを返し、vi.setSystemTimeで固定できる', () => {
    // 前提: フェイクタイマーでシステム時刻を固定する
    // 事前条件: clock.now() の内部実装は new Date() である
    // 検証: 固定した時刻がそのまま返る
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-07-28T00:00:00.000Z');
  });

  it('nowIso()はnew Date().toISOString()と同一形式の文字列を返す', () => {
    // 前提: フェイクタイマーでシステム時刻を固定する
    // 事前条件: clock.nowIso() の内部実装は new Date().toISOString() である
    // 検証: 固定した時刻の ISO 8601 文字列（UTC）が返る
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:34:56.789Z'));
    expect(clock.nowIso()).toBe('2026-07-28T12:34:56.789Z');
  });
});
