import { describe, expect, it } from 'vitest';
import type { Result } from '../../src/domain/types';
import {
  createColumnIndex,
  findRowByPredicate,
  isEmptyRow,
  mapRowByHeaders,
  normalizeBoolean,
  normalizeOptionalString,
  parseAllRows,
  parseNumberCell,
  parseOptionalEnumCell,
  parseOptionalNonNegativeNumberCell,
  parseOptionalStringCell,
  parseRequiredStringCell,
  parseSheetDate,
} from '../../src/repository/SheetMapping';

describe('createColumnIndex / mapRowByHeaders', () => {
  it('定義外列を残した対応表から必須列と任意列を抽出する', () => {
    // 前提: ヘッダーには順序の異なる必須列、空ヘッダー、利用者追加列が存在する。
    // 事前条件: assetClassはヘッダーに存在しない任意列である。
    // 検証: ヘッダー名でセルを対応付け、存在しない任意列だけをnullにする。
    const indexResult = createColumnIndex(['name', '', 'createdAt', 'メモ', 'id'], 'funds', [
      'id',
      'name',
      'createdAt',
    ]);
    expect(indexResult.success).toBe(true);
    if (indexResult.success) {
      expect(
        mapRowByHeaders(
          ['国内株式ファンド', '補足', '2026-09-06T00:00:00.000Z', '確認済み', 'fund-1'],
          indexResult.value,
          ['id', 'name', 'createdAt'],
          ['assetClass'],
          'funds',
          0
        )
      ).toEqual({
        success: true,
        value: {
          id: 'fund-1',
          name: '国内株式ファンド',
          createdAt: '2026-09-06T00:00:00.000Z',
          assetClass: null,
        },
      });
    }
  });

  it('必須列の欠落を列名付きunexpectedエラーにする', () => {
    // 前提: fundsシートのヘッダーにcreatedAt列が存在しない。
    // 事前条件: createdAtを必須列として指定する。
    // 検証: 欠落列を暗黙補完せず、既存形式のunexpectedエラーを返す。
    expect(createColumnIndex(['id', 'name'], 'funds', ['id', 'name', 'createdAt'])).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message: 'fundsシートのヘッダーにcreatedAt列がありません。',
      },
    });
  });

  it('同名ヘッダーを列名付きunexpectedエラーにする', () => {
    // 前提: fundsシートのヘッダーにname列が重複している。
    // 事前条件: 重複列の採用順序は定義しない。
    // 検証: 先勝ちや後勝ちへフォールバックせず、重複エラーを返す。
    expect(createColumnIndex(['id', 'name', 'name', 'createdAt'], 'funds', ['id'])).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message: 'fundsシートのヘッダーにname列が重複しています。',
      },
    });
  });

  it('ヘッダーに存在する必須列のセルが行にない場合は拒否する', () => {
    // 前提: fundsシートのcreatedAtヘッダーは3列目に存在する。
    // 事前条件: 4行目のデータ行は2列目までしか存在しない。
    // 検証: 必須列の欠落セルを暗黙にundefinedとして扱わず、列名と行番号を返す。
    const columnIndex = new Map([
      ['id', 0],
      ['name', 1],
      ['createdAt', 2],
    ]);

    expect(
      mapRowByHeaders(
        ['fund-short-required', '国内株式ファンド'],
        columnIndex,
        ['id', 'name', 'createdAt'],
        [],
        'funds',
        2
      )
    ).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message: 'fundsの4行目のcreatedAt列のセルが存在しません。',
      },
    });
  });

  it('ヘッダーに存在する任意列のセルが行にない場合は拒否する', () => {
    // 前提: fundsシートのassetClassヘッダーは3列目に存在する。
    // 事前条件: 3行目のデータ行は2列目までしか存在しない。
    // 検証: 任意列でもヘッダーが存在する場合は欠落セルをnullへ暗黙補完しない。
    const columnIndex = new Map([
      ['id', 0],
      ['assetClass', 2],
    ]);

    expect(
      mapRowByHeaders(
        ['fund-short-optional', '確認済み'],
        columnIndex,
        ['id'],
        ['assetClass'],
        'funds',
        1
      )
    ).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message: 'fundsの3行目のassetClass列のセルが存在しません。',
      },
    });
  });
});

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

describe('parseRequiredStringCell', () => {
  it('空でない文字列はそのまま返す', () => {
    // 前提: セルに正常な文字列が入っている
    // 検証: 値がそのまま成功で返る
    const result = parseRequiredStringCell('fund-001', 'funds', 'id', 0);
    expect(result).toEqual({ success: true, value: 'fund-001' });
  });

  it('空文字列・文字列以外は行番号付きの既存文言でエラーになる', () => {
    // 前提: セルが空文字列または数値（文字列でない）である
    // 検証: 各リポジトリの既存エラー文言（<シート>の<N>行目の<列>が不正です。）と
    //   完全一致するメッセージで失敗する（N は index+2）
    const emptyResult = parseRequiredStringCell('', 'funds', 'id', 0);
    expect(emptyResult.success).toBe(false);
    if (!emptyResult.success) {
      expect(emptyResult.error.message).toBe('fundsの2行目のidが不正です。');
    }

    const numberResult = parseRequiredStringCell(123, 'navs', 'fundId', 3);
    expect(numberResult.success).toBe(false);
    if (!numberResult.success) {
      expect(numberResult.error.message).toBe('navsの5行目のfundIdが不正です。');
    }
  });
});

describe('parseNumberCell', () => {
  it('数値はそのまま返す（0 も有効値として扱う）', () => {
    // 前提: セルに数値が入っている
    // 検証: 0 を含む数値がそのまま成功で返る（falsy な 0 を欠損と誤判定しない）
    expect(parseNumberCell(10000, 'navs', 'value', 0)).toEqual({ success: true, value: 10000 });
    expect(parseNumberCell(0, 'navs', 'value', 0)).toEqual({ success: true, value: 0 });
  });

  it('NaN・文字列は行番号付きの既存文言でエラーになる', () => {
    // 前提: セルが NaN または文字列（数値でない）である
    // 検証: 既存エラー文言と完全一致するメッセージで失敗する
    const nanResult = parseNumberCell(Number.NaN, 'transactions', 'amount', 1);
    expect(nanResult.success).toBe(false);
    if (!nanResult.success) {
      expect(nanResult.error.message).toBe('transactionsの3行目のamountが不正です。');
    }

    const stringResult = parseNumberCell('10000', 'transactions', 'amount', 1);
    expect(stringResult.success).toBe(false);
  });
});

describe('parseOptionalNonNegativeNumberCell', () => {
  it('空セルは税額未記録を表すnullとして返す', () => {
    // 前提: マイグレーション後の既存売却行では税額セルが空である
    // 事前条件: 空文字・null・undefinedをそれぞれ入力する
    // 検証: 0円へ変換せず、すべてnullとして返す
    expect(parseOptionalNonNegativeNumberCell('', 'transactions', 'incomeTax', 0)).toEqual({
      success: true,
      value: null,
    });
    expect(parseOptionalNonNegativeNumberCell(null, 'transactions', 'incomeTax', 0)).toEqual({
      success: true,
      value: null,
    });
    expect(parseOptionalNonNegativeNumberCell(undefined, 'transactions', 'incomeTax', 0)).toEqual({
      success: true,
      value: null,
    });
  });

  it('0を含む非負の有限数をそのまま返す', () => {
    // 前提: 税額セルに記録済みの数値がある
    // 事前条件: 0円と正の税額を入力する
    // 検証: いずれも数値のまま返す
    expect(parseOptionalNonNegativeNumberCell(0, 'transactions', 'incomeTax', 1)).toEqual({
      success: true,
      value: 0,
    });
    expect(parseOptionalNonNegativeNumberCell(2032, 'transactions', 'residentTax', 1)).toEqual({
      success: true,
      value: 2032,
    });
  });

  it('負値・非数・無限値はunexpectedエラーにする', () => {
    // 前提: 税額セルに不正な値が保存されている
    // 事前条件: 負値・文字列・NaN・Infinityを入力する
    // 検証: すべてunexpectedエラーとしてfail fastに返す
    const values = [-1, '100', Number.NaN, Number.POSITIVE_INFINITY];
    values.forEach((value) => {
      const result = parseOptionalNonNegativeNumberCell(value, 'transactions', 'residentTax', 2);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('unexpected');
      }
    });
  });
});

describe('parseOptionalStringCell', () => {
  it('空セルをnullへ変換し、文字列の前後空白を除去する', () => {
    // 前提: 任意文字列列には未設定セルまたは前後空白付きの値が保存される。
    // 事前条件: 空文字・空白のみ・null・undefined・前後空白付き文字列を入力する。
    // 検証: 空相当はnull、値がある文字列はtrim済みの文字列として返す。
    expect(parseOptionalStringCell('', 'funds', 'navSourceCode', 0)).toEqual({
      success: true,
      value: null,
    });
    expect(parseOptionalStringCell('   ', 'funds', 'navSourceCode', 0)).toEqual({
      success: true,
      value: null,
    });
    expect(parseOptionalStringCell(null, 'funds', 'navSourceCode', 0)).toEqual({
      success: true,
      value: null,
    });
    expect(parseOptionalStringCell(undefined, 'funds', 'navSourceCode', 0)).toEqual({
      success: true,
      value: null,
    });
    expect(parseOptionalStringCell(' sbi_am/sa_202306080A ', 'funds', 'navSourceCode', 0)).toEqual({
      success: true,
      value: 'sbi_am/sa_202306080A',
    });
  });

  it('文字列以外の値は行番号付きunexpectedエラーにする', () => {
    // 前提: 任意文字列列へ数値が誤って保存されている。
    // 事前条件: fundsシートの3行目に相当する行インデックス1を指定する。
    // 検証: 暗黙の文字列変換を行わず、シート名・行番号・列名を含むエラーを返す。
    const result = parseOptionalStringCell(20230608, 'funds', 'navSourceCode', 1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toBe('fundsの3行目のnavSourceCodeが不正です。');
    }
  });
});

describe('parseOptionalEnumCell', () => {
  const assetClasses = ['equity', 'gold'] as const;

  it.each([
    { value: '', expected: null },
    { value: '   ', expected: null },
    { value: null, expected: null },
    { value: ' equity ', expected: 'equity' },
    { value: 'gold', expected: 'gold' },
  ])('任意列挙値セル $value を解析する', ({ value, expected }) => {
    // 前提: assetClass列は未設定、株式、または金を保存できる。
    // 事前条件: 空相当の値または前後空白を含む許可値を入力する。
    // 検証: 空相当はnull、許可値はtrim済みの文字列として返す。
    expect(parseOptionalEnumCell(value, assetClasses, 'funds', 'assetClass', 0)).toEqual({
      success: true,
      value: expected,
    });
  });

  it('undefinedを行番号付きunexpectedエラーとして拒否する', () => {
    // 前提: GASのgetValuesは空セルを空文字で返す。
    // 事前条件: fundsシートの3行目に相当する列挙値へundefinedを入力する。
    // 検証: undefinedを未設定のnullへ暗黙変換せず、対応付け不備として拒否する。
    expect(parseOptionalEnumCell(undefined, assetClasses, 'funds', 'assetClass', 1)).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message: 'fundsの3行目のassetClassが不正です。',
      },
    });
  });

  it.each(['bond', 1])('許可集合外の任意列挙値 %s を拒否する', (value) => {
    // 前提: assetClass列の許可集合はequityとgoldだけである。
    // 事前条件: 定義外文字列または数値を3行目のセル値として入力する。
    // 検証: 値を暗黙変換せず、行番号と列名を含むunexpectedエラーを返す。
    expect(parseOptionalEnumCell(value, assetClasses, 'funds', 'assetClass', 1)).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message: 'fundsの3行目のassetClassが不正です。',
      },
    });
  });
});

describe('normalizeOptionalString', () => {
  it('文字列は trim して返し、空相当は null に正規化する', () => {
    // 前提: 任意項目のセルに文字列・空白のみ・非文字列が入るケースがある
    // 検証: trim 済み文字列 / null（空白のみ・非文字列）へ正規化される
    expect(normalizeOptionalString(' recurring-001 ')).toBe('recurring-001');
    expect(normalizeOptionalString('')).toBeNull();
    expect(normalizeOptionalString('   ')).toBeNull();
    expect(normalizeOptionalString(null)).toBeNull();
    expect(normalizeOptionalString(123)).toBeNull();
  });
});

describe('normalizeBoolean', () => {
  it("boolean はそのまま、文字列は 'true'（大文字小文字問わず）のみ true になる", () => {
    // 前提: 真偽値セルに boolean・文字列・その他の型が入るケースがある
    // 検証: 既存挙動（boolean 素通し / 'true' 文字列のみ true / それ以外 false）を固定する
    expect(normalizeBoolean(true)).toBe(true);
    expect(normalizeBoolean(false)).toBe(false);
    expect(normalizeBoolean('true')).toBe(true);
    expect(normalizeBoolean('TRUE')).toBe(true);
    expect(normalizeBoolean('false')).toBe(false);
    expect(normalizeBoolean('yes')).toBe(false);
    expect(normalizeBoolean(1)).toBe(false);
    expect(normalizeBoolean(null)).toBe(false);
  });
});
