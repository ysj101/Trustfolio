import { formatDateToIso } from '../utils/dateTime';
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
 * ヘッダー名から列インデックスを構築する。
 *
 * 内容:
 * - 空ヘッダーは利用者追加列として読み飛ばす。
 * - 同名の非空ヘッダーは対応先を一意に決められないため拒否する。
 * - 必須列が存在しない場合は、欠落した列名を含むunexpectedエラーを返す。
 *
 * 注意:
 * - 定義外の非空ヘッダーも対応表へ保持するが、呼び出し側が要求しなければ読み飛ばされる。
 * - 重複列を先勝ち・後勝ちで暗黙に解決しない。
 *
 * @param headers - シートのヘッダー行。
 * @param sheetLabel - エラーメッセージに用いるシートのラベル。
 * @param requiredColumns - 読み取りに必須の列名。
 * @returns ヘッダー名と0始まり列インデックスの対応表を持つ{@link Result}。
 */
export function createColumnIndex(
  headers: readonly string[],
  sheetLabel: string,
  requiredColumns: readonly string[]
): Result<Map<string, number>> {
  const columnIndex = new Map<string, number>();
  for (const [index, header] of headers.entries()) {
    if (header === '') {
      continue;
    }
    if (columnIndex.has(header)) {
      return fail('unexpected', `${sheetLabel}シートのヘッダーに${header}列が重複しています。`);
    }
    columnIndex.set(header, index);
  }
  for (const columnName of requiredColumns) {
    if (!columnIndex.has(columnName)) {
      return fail('unexpected', `${sheetLabel}シートのヘッダーに${columnName}列がありません。`);
    }
  }
  return { success: true, value: columnIndex };
}

/**
 * ヘッダー対応表を使って行を列名キーのオブジェクトへ変換する。
 *
 * 内容:
 * - 必須列と任意列を1回のループで処理する。
 * - 任意列がヘッダーに存在しない場合は、未設定を表すnullを格納する。
 * - ヘッダーに存在する列のセルが行に存在しない場合は、列名と行番号を含むエラーを返す。
 * - ヘッダーに対応しない超過セルは読み飛ばす。
 *
 * 注意:
 * - 必須列の存在は事前に{@link createColumnIndex}で検証する。
 * - 必須列が対応表にない誤用は、暗黙補完せず unexpected エラーで即座に失敗させる
 *   （リポジトリ規約により throw は使用しない）。
 *
 * @typeParam C - 変換対象の列名。
 * @param row - シートのデータ行。
 * @param columnIndex - ヘッダー名と列インデックスの対応表。
 * @param requiredColumns - 必須列名。
 * @param optionalColumns - 未存在時にnullとする任意列名。
 * @param sheetLabel - エラーメッセージに用いるシートのラベル。
 * @param index - 0始まりの行インデックス。
 * @returns 対象列名をキーとするセル値オブジェクトを持つ{@link Result}。
 */
export function mapRowByHeaders<C extends string>(
  row: unknown[],
  columnIndex: Map<string, number>,
  requiredColumns: readonly C[],
  optionalColumns: readonly C[],
  sheetLabel: string,
  index: number
): Result<Record<C, unknown>> {
  const cells = {} as Record<C, unknown>;
  const optionalColumnSet = new Set<C>(optionalColumns);
  for (const columnName of [...requiredColumns, ...optionalColumns]) {
    const cellIndex = columnIndex.get(columnName);
    if (cellIndex === undefined) {
      if (!optionalColumnSet.has(columnName)) {
        return fail('unexpected', `必須列の対応がありません: ${columnName}`);
      }
      cells[columnName] = null;
      continue;
    }
    if (cellIndex >= row.length) {
      return fail(
        'unexpected',
        `${sheetLabel}の${String(index + 2)}行目の${columnName}列のセルが存在しません。`
      );
    }
    cells[columnName] = row[cellIndex];
  }
  return { success: true, value: cells };
}

/**
 * シートのセル値が「空でない文字列」であることを検証して返す共通パーサ。
 *
 * 目的:
 * - 各 Repository の parseRow に反復していた
 *   「`typeof x !== 'string' || x === ''` → 行番号付きエラー」の定型を一本化する（H3 #149）。
 *
 * 内容:
 * - 失敗時のエラーメッセージは各 Repository の既存文言
 *   「`<シートラベル>の<N>行目の<フィールド名>が不正です。`」と完全に一致させる
 *   （N は 0 始まりの行インデックス + 2。見出し行を考慮したシート上の行番号）。
 *
 * 注意:
 * - 空文字列を許容するフィールド（例: 全体実績の fundId）には使用しない。
 * - 独自のメッセージ形式（型・値の詳細付き等）を持つフィールドにも使用しない
 *   （文言互換を壊さないため、該当箇所は呼び出し側の既存実装を維持する）。
 *
 * @param value - 検証対象のセル値。
 * @param sheetLabel - エラーメッセージに用いるシートのラベル（例: 'funds'）。
 * @param fieldName - エラーメッセージに用いるフィールド名（例: 'id'）。
 * @param index - 0始まりの行インデックス。
 * @returns 検証に成功すれば文字列を持つ {@link Result}。
 */
export function parseRequiredStringCell(
  value: unknown,
  sheetLabel: string,
  fieldName: string,
  index: number
): Result<string> {
  if (typeof value !== 'string' || value === '') {
    return fail('unexpected', `${sheetLabel}の${String(index + 2)}行目の${fieldName}が不正です。`);
  }
  return { success: true, value };
}

/**
 * シートのセル値が「数値（NaN でない）」であることを検証して返す共通パーサ。
 *
 * 目的:
 * - 各 Repository の parseRow に反復していた
 *   「`typeof x !== 'number' || Number.isNaN(x)` → 行番号付きエラー」の定型を一本化する（H3 #149）。
 *
 * 内容:
 * - 失敗時のエラーメッセージは {@link parseRequiredStringCell} と同じ既存文言形式に完全一致させる。
 *
 * @param value - 検証対象のセル値。
 * @param sheetLabel - エラーメッセージに用いるシートのラベル（例: 'navs'）。
 * @param fieldName - エラーメッセージに用いるフィールド名（例: 'value'）。
 * @param index - 0始まりの行インデックス。
 * @returns 検証に成功すれば数値を持つ {@link Result}。
 */
export function parseNumberCell(
  value: unknown,
  sheetLabel: string,
  fieldName: string,
  index: number
): Result<number> {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fail('unexpected', `${sheetLabel}の${String(index + 2)}行目の${fieldName}が不正です。`);
  }
  return { success: true, value };
}

/**
 * 任意の税額セルを「0以上の有限数またはnull」として読み込む。
 *
 * 目的:
 * - マイグレーションで追加された既存行の空セルを「税額未記録」のnullとして保持する。
 * - 値が存在する場合は負値・NaN・±Infinity・数値以外をunexpectedエラーとして
 *   fail fastに検出する。
 *
 * 内容:
 * - 空文字・null・undefined のセルは「税額未記録」として null を返す。
 * - number型の0以上の有限数はそのまま成功として返す。
 * - それ以外（負値・NaN・±Infinity・数値以外）はシート行番号つきの
 *   unexpected エラーを返す。
 *
 * 注意:
 * - 空セルから得たnullは、明示的に記録された0円とは区別する。
 *
 * @param value - 検証対象のセル値。
 * @param sheetLabel - エラーメッセージに用いるシートのラベル。
 * @param fieldName - エラーメッセージに用いるフィールド名。
 * @param index - 0始まりの行インデックス。
 * @returns 空セルならnull、妥当な値なら0以上の有限数を持つ {@link Result}。
 */
export function parseOptionalNonNegativeNumberCell(
  value: unknown,
  sheetLabel: string,
  fieldName: string,
  index: number
): Result<number | null> {
  if (value === '' || value === null || value === undefined) {
    return { success: true, value: null };
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fail('unexpected', `${sheetLabel}の${String(index + 2)}行目の${fieldName}が不正です。`);
  }
  return { success: true, value };
}

/**
 * 任意の文字列セルを「trim済み文字列またはnull」として読み込む。
 *
 * 目的:
 * - Repositoryごとに重複する、任意文字列セルの型検証と前後空白除去を一本化する。
 *
 * 内容:
 * - 空文字・空白のみの文字列・null・undefinedは未設定を表すnullへ変換する。
 * - 文字列は前後空白を除去して返す。
 * - 文字列以外の値はシート行番号付きのunexpectedエラーとしてfail fastに検出する。
 *
 * 注意:
 * - 数値などを文字列へ暗黙変換しない。
 * - 失敗時は「`<シートラベル>の<N>行目の<フィールド名>が不正です。`」形式を使用する。
 *
 * @param value - 検証対象のセル値。
 * @param sheetLabel - エラーメッセージに用いるシートのラベル。
 * @param fieldName - エラーメッセージに用いるフィールド名。
 * @param index - 0始まりの行インデックス。
 * @returns 空セルならnull、文字列ならtrim済みの値を持つ {@link Result}。
 */
export function parseOptionalStringCell(
  value: unknown,
  sheetLabel: string,
  fieldName: string,
  index: number
): Result<string | null> {
  if (value === '' || value === null || value === undefined) {
    return { success: true, value: null };
  }
  if (typeof value !== 'string') {
    return fail('unexpected', `${sheetLabel}の${String(index + 2)}行目の${fieldName}が不正です。`);
  }
  const trimmed = value.trim();
  return { success: true, value: trimmed === '' ? null : trimmed };
}

/**
 * 任意の列挙値セルを「許可された文字列またはnull」として読み込む。
 *
 * 目的:
 * - 空セルと文字列セルの正規化規則を{@link parseOptionalStringCell}へ統一し、
 *   Repositoryごとに重複する任意列挙値の解析を一本化する。
 *
 * 内容:
 * - 空文字・空白のみ・nullのセルは未設定を表すnullへ変換する。
 * - 文字列はtrim後にallowedへ含まれる場合だけ受理する。
 * - undefined・数値・許可集合外の文字列は行番号付きunexpectedエラーとしてfail fastに検出する。
 *
 * 注意:
 * - GASのgetValuesは空セルを空文字で返すため、undefinedは行長不一致や対応付け不備を意味する。
 * - 許可集合外の値を既定値やnullへ暗黙変換しない。
 * - 失敗時は「`<シートラベル>の<N>行目の<フィールド名>が不正です。`」形式を維持する。
 *
 * @typeParam T - 許可する文字列リテラル型。
 * @param value - 検証対象のセル値。
 * @param allowed - 受理する文字列の許可集合。
 * @param sheetLabel - エラーメッセージに用いるシートのラベル。
 * @param fieldName - エラーメッセージに用いるフィールド名。
 * @param index - 0始まりの行インデックス。
 * @returns 空セルならnull、許可値なら対応する文字列リテラルを持つ{@link Result}。
 */
export function parseOptionalEnumCell<T extends string>(
  value: unknown,
  allowed: readonly T[],
  sheetLabel: string,
  fieldName: string,
  index: number
): Result<T | null> {
  if (value === undefined) {
    return fail('unexpected', `${sheetLabel}の${String(index + 2)}行目の${fieldName}が不正です。`);
  }
  const parsed = parseOptionalStringCell(value, sheetLabel, fieldName, index);
  if (!parsed.success) {
    return parsed;
  }
  if (parsed.value === null) {
    return { success: true, value: null };
  }
  if (allowed.some((candidate) => candidate === parsed.value)) {
    return { success: true, value: parsed.value as T };
  }
  return fail('unexpected', `${sheetLabel}の${String(index + 2)}行目の${fieldName}が不正です。`);
}

/**
 * 任意項目のセル値を「trim 済みの文字列 or null」へ正規化する。
 *
 * 目的:
 * - TransactionRepository と RecurringPurchaseRepository に完全同一で重複していた
 *   実装を一本化する（H3 #149）。
 *
 * 内容:
 * - 文字列でない値・空白のみの文字列は null に正規化する（既存挙動を厳密に維持）。
 *
 * @param value - 正規化対象のセル値。
 * @returns trim 済みの文字列。空相当なら null。
 */
export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * 真偽値セルの値を boolean へ正規化する。
 *
 * 目的:
 * - RecurringPurchaseRepository 固有だった実装を、他リポジトリの真偽値列でも
 *   利用できるよう共通化する（H3 #149）。
 *
 * 内容:
 * - boolean はそのまま返す。文字列は小文字化して 'true' のみ true とする。
 *   それ以外の型は false とする（既存挙動を厳密に維持）。
 *
 * @param value - 正規化対象のセル値。
 * @returns 正規化済みの真偽値。
 */
export function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return false;
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
