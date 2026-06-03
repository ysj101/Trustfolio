import { formatDateToIso } from '../domain/dateFormat';
import { fail } from '../domain/result';
import type { Result } from '../domain/types';

/**
 * 行（row）データがすべて空セルかどうかを判定する。
 *
 * 目的:
 * - 各 Repository に重複していた空行スキップ判定を一本化する。
 *
 * 内容:
 * - すべてのセルが空文字列・null・undefined のいずれかであれば空行とみなす。
 *
 * @param row - 判定対象の行データ。
 * @returns 空行であれば true。
 */
export function isEmptyRow(row: unknown[]): boolean {
  return row.every((cell) => cell === '' || cell === null || cell === undefined);
}

/**
 * 全行を走査し、空行をスキップしながら各行をドメインオブジェクトへ変換する。
 *
 * 目的:
 * - 「全行ループ→空行skip→parseRow→失敗時return→push」という
 *   各 Repository の listXxx 系で繰り返される定型処理を一本化する。
 *
 * 内容:
 * - parseRow が失敗を返した時点で即座にその失敗を返す（fail-fast）。
 *   パースエラーを握りつぶしてスキップする方針の呼び出し側には使用しない。
 *
 * @typeParam T - 変換後のドメインオブジェクト型。
 * @param rows - readAllRows で取得した全行。
 * @param parseRow - 1行をドメインオブジェクトへ変換する関数（index は0始まり）。
 * @returns 変換済みオブジェクトの配列。途中で失敗した場合はその失敗。
 */
export function parseAllRows<T>(
  rows: unknown[][],
  parseRow: (row: unknown[], index: number) => Result<T>
): Result<T[]> {
  const results: T[] = [];
  for (const [index, row] of rows.entries()) {
    if (isEmptyRow(row)) {
      continue;
    }
    const parsed = parseRow(row, index);
    if (!parsed.success) {
      return parsed;
    }
    results.push(parsed.value);
  }
  return { success: true, value: results };
}

/**
 * 全行を走査し、述語に最初に一致した行を行インデックス付きで返す。
 *
 * 目的:
 * - 「IDで該当行を探す」find 系（findTransactionRow / findRecurringRow など）の
 *   定型処理を一本化する。
 *
 * 内容:
 * - 空行はスキップする。
 * - parseRow が失敗を返した時点で即座にその失敗を返す（fail-fast）。
 * - 一致行が見つかった時点でそれ以降の行はパースしない（既存挙動を踏襲）。
 *
 * @typeParam T - 変換後のドメインオブジェクト型。
 * @param rows - readAllRows で取得した全行。
 * @param parseRow - 1行をドメインオブジェクトへ変換する関数（index は0始まり）。
 * @param matches - 一致判定を行う述語。
 * @returns 一致した行の `{ rowIndex, entity }`。見つからなければ null。
 */
export function findRowByPredicate<T>(
  rows: unknown[][],
  parseRow: (row: unknown[], index: number) => Result<T>,
  matches: (entity: T) => boolean
): Result<{ rowIndex: number; entity: T } | null> {
  for (const [index, row] of rows.entries()) {
    if (isEmptyRow(row)) {
      continue;
    }
    const parsed = parseRow(row, index);
    if (!parsed.success) {
      return parsed;
    }
    if (matches(parsed.value)) {
      return { success: true, value: { rowIndex: index, entity: parsed.value } };
    }
  }
  return { success: true, value: null };
}

/**
 * {@link parseSheetDate} の挙動を呼び出し側ごとに厳密へ合わせるためのオプション。
 */
export type SheetDateParseOptions = {
  /** エラーメッセージに用いるシートのラベル（例: 'navs', 'transactions'）。 */
  sheetLabel: string;
  /** エラーメッセージに用いるフィールド名（例: 'date', 'startDate'）。 */
  fieldName: string;
  /** 0始まりの行インデックス（メッセージ上は +2 してシート行番号にする）。 */
  index: number;
  /** 文字列セルを trim してから空判定・返却するか。 */
  trim: boolean;
  /** 「不正です」メッセージで値を二重引用符で囲むか。 */
  quoteInvalidValue: boolean;
};

/**
 * シートのセル値（Date または文字列）を `YYYY-MM-DD` 形式の文字列へ正規化する。
 *
 * 目的:
 * - 各 Repository の parseRow に分散していた
 *   「Date型/文字列の判定→ISO変換→不正値エラー」を一本化する。
 *
 * 内容:
 * - セルが Date の場合は無効日付（NaN）を検査し、有効なら ISO 文字列へ変換する。
 * - セルが空でない文字列の場合はそのまま（option.trim に応じて trim して）返す。
 * - 上記以外は `unexpected` のエラーを返す。
 * - エラーメッセージの文言（trim の有無・値の引用符の有無）は呼び出し側の
 *   既存実装に合わせるため {@link SheetDateParseOptions} で切り替える。
 *
 * @param value - シートから取得した生のセル値。
 * @param options - 呼び出し側ごとの差異を吸収するオプション。
 * @returns 正規化済みの `YYYY-MM-DD` 文字列、または失敗。
 */
export function parseSheetDate(value: unknown, options: SheetDateParseOptions): Result<string> {
  const { sheetLabel, fieldName, index, trim, quoteInvalidValue } = options;
  const rowLabel = `${sheetLabel}の${String(index + 2)}行目の${fieldName}`;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return fail('unexpected', `${rowLabel}が無効な日付です。値: ${String(value)}`);
    }
    return { success: true, value: formatDateToIso(value) };
  }

  if (typeof value === 'string') {
    const candidate = trim ? value.trim() : value;
    if (candidate !== '') {
      return { success: true, value: candidate };
    }
  }

  const shown = quoteInvalidValue ? `"${String(value)}"` : String(value);
  return fail('unexpected', `${rowLabel}が不正です。型: ${typeof value}, 値: ${shown}`);
}
