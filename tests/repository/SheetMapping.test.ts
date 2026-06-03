import { describe, expect, it } from 'vitest';
import type { Result } from '../../src/domain/types';
import {
  findRowByPredicate,
  isEmptyRow,
  parseAllRows,
  parseSheetDate,
} from '../../src/repository/SheetMapping';

/**
 * テスト用の単純なドメインオブジェクト。
 * 1列目をid、2列目をvalueとして扱う。
 */
type SampleEntity = { id: string; value: number };

/**
 * テスト用のparseRow。
 * - 1列目が空文字列の場合は失敗（unexpected）を返す。
 * - それ以外はidとvalueを持つオブジェクトを返す。
 */
function parseSampleRow(row: unknown[], index: number): Result<SampleEntity> {
  const [id, value] = row;
  if (typeof id !== 'string' || id === '') {
    return {
      success: false,
      error: { type: 'unexpected', message: `${String(index + 2)}行目のidが不正です。` },
    };
  }
  return { success: true, value: { id, value: typeof value === 'number' ? value : 0 } };
}

describe('isEmptyRow', () => {
  it('全セルが空文字列・null・undefinedの場合はtrueを返す', () => {
    // 前提: 空セルのみで構成された行を与える
    // 検証: trueが返る
    expect(isEmptyRow(['', null, undefined])).toBe(true);
  });

  it('1つでも値があるセルがあればfalseを返す', () => {
    // 前提: 値を含むセルが1つ存在する行を与える
    // 検証: falseが返る
    expect(isEmptyRow(['', 'fund-1', ''])).toBe(false);
  });
});

describe('parseAllRows', () => {
  it('空行をスキップして全行をパースする', () => {
    // 前提: 有効行と空行が混在する
    // 検証: 空行は除外され、有効行のみが返る
    const rows: unknown[][] = [
      ['銘柄-001', 100],
      ['', '', ''],
      ['銘柄-002', 200],
    ];
    const result = parseAllRows(rows, parseSampleRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual([
        { id: '銘柄-001', value: 100 },
        { id: '銘柄-002', value: 200 },
      ]);
    }
  });

  it('パース失敗時はその時点で失敗を返す（fail-fast）', () => {
    // 前提: 2行目（index=1）のidが空でパースに失敗する
    // 検証: unexpectedエラーが返る
    const rows: unknown[][] = [
      ['銘柄-001', 100],
      [123, 200],
    ];
    const result = parseAllRows(rows, parseSampleRow);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
    }
  });
});

describe('findRowByPredicate', () => {
  it('最初に一致した行を行インデックス付きで返す', () => {
    // 前提: 一致する行が存在する
    // 検証: rowIndex（0始まり）とentityが返る
    const rows: unknown[][] = [
      ['銘柄-001', 100],
      ['', '', ''],
      ['銘柄-002', 200],
    ];
    const result = findRowByPredicate(rows, parseSampleRow, (entity) => entity.id === '銘柄-002');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual({ rowIndex: 2, entity: { id: '銘柄-002', value: 200 } });
    }
  });

  it('一致する行がない場合はnullを返す', () => {
    // 前提: 述語に一致する行が存在しない
    // 検証: nullが返る
    const rows: unknown[][] = [['銘柄-001', 100]];
    const result = findRowByPredicate(rows, parseSampleRow, (entity) => entity.id === '存在しない');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBeNull();
    }
  });
});

describe('parseSheetDate', () => {
  const baseOptions = {
    sheetLabel: 'navs',
    fieldName: 'date',
    index: 0,
    trim: true,
    quoteInvalidValue: true,
  };

  it('DateオブジェクトはYYYY-MM-DD形式に変換する', () => {
    // 前提: 有効なDateを与える
    // 検証: ローカル日付のISO文字列が返る
    const result = parseSheetDate(new Date(2026, 5, 1), baseOptions);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('2026-06-01');
    }
  });

  it('無効なDateはunexpectedエラーを返す', () => {
    // 前提: 無効なDate（NaN）を与える
    // 検証: 「無効な日付」エラーが返る
    const result = parseSheetDate(new Date('invalid'), baseOptions);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toContain('無効な日付');
    }
  });

  it('trim=trueの場合は前後の空白を除去して返す', () => {
    // 前提: 前後に空白を含む日付文字列を与える
    // 検証: trimされた文字列が返る
    const result = parseSheetDate('  2026-06-01  ', baseOptions);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('2026-06-01');
    }
  });

  it('trim=falseの場合は文字列をそのまま返す', () => {
    // 前提: trim無効で空白を含まない日付文字列を与える
    // 検証: 入力文字列がそのまま返る
    const result = parseSheetDate('2026-06-01', { ...baseOptions, trim: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('2026-06-01');
    }
  });

  it('quoteInvalidValue=trueの場合は不正値を二重引用符で囲む', () => {
    // 前提: 日付として不正な数値を与える
    // 検証: メッセージに引用符付きの値が含まれる
    const result = parseSheetDate(123, baseOptions);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('値: "123"');
    }
  });

  it('quoteInvalidValue=falseの場合は不正値を引用符で囲まない', () => {
    // 前提: 日付として不正な数値を引用符なし設定で与える
    // 検証: メッセージに引用符なしの値が含まれる
    const result = parseSheetDate(123, { ...baseOptions, quoteInvalidValue: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('値: 123');
      expect(result.error.message).not.toContain('"123"');
    }
  });
});
