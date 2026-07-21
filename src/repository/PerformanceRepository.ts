import {
  PERFORMANCE_HEADERS,
  PERFORMANCE_SHEET_NAME,
  getPerformanceSheetName,
  type SheetDefinition,
} from '../Config';
import { fail, propagateFailure } from '../domain/result';
import type { PerformanceRecord, Result } from '../domain/types';
import { logWarn } from '../utils/logger';
import {
  findRowByPredicate,
  isEmptyRow,
  parseNumberCell,
  parseRequiredStringCell,
  parseSheetDate,
} from './SheetMapping';
import type { SheetRepository } from './SheetRepository';

export type PerformanceRepository = {
  /**
   * 実績を記録する（ファンド別シート）
   * @param performance 実績データ
   * @returns 成功または失敗
   */
  createPerformance: (performance: PerformanceRecord) => Result<void>;

  /**
   * 実績を記録する（全体シート）
   * @param performance 実績データ
   * @returns 成功または失敗
   */
  createGlobalPerformance: (performance: PerformanceRecord) => Result<void>;

  /**
   * 特定日の実績が既に存在するか確認（ファンド別）
   * @param fundId ファンドID
   * @param date 日付（YYYY-MM-DD形式）
   * @returns 実績データまたはnull
   */
  findByFundAndDate: (fundId: string, date: string) => Result<PerformanceRecord | null>;

  /**
   * 特定日の実績が既に存在するか確認（全体）
   * @param date 日付（YYYY-MM-DD形式）
   * @returns 実績データまたはnull
   */
  findGlobalByDate: (date: string) => Result<PerformanceRecord | null>;

  /**
   * 最新の実績を取得（ファンド別）
   * @param fundId ファンドID
   * @returns 最新の実績データまたはnull
   */
  findLatestByFundId: (fundId: string) => Result<PerformanceRecord | null>;

  /**
   * 全体実績の履歴を取得
   * @returns 全体実績の配列（日付昇順）
   */
  listGlobalHistory: () => Result<PerformanceRecord[]>;

  /**
   * 指定期間の全体実績を取得
   * @param startDate 開始日（YYYY-MM-DD形式、この日を含む）
   * @param endDate 終了日（YYYY-MM-DD形式、この日を含む）
   * @returns 期間内の全体実績の配列（日付昇順）
   */
  findGlobalByDateRange: (startDate: string, endDate: string) => Result<PerformanceRecord[]>;

  /**
   * 指定期間の銘柄別実績を取得
   * @param fundId ファンドID
   * @param startDate 開始日（YYYY-MM-DD形式、この日を含む）
   * @param endDate 終了日（YYYY-MM-DD形式、この日を含む）
   * @returns 期間内の銘柄別実績の配列（日付昇順）
   */
  findByFundAndDateRange: (
    fundId: string,
    startDate: string,
    endDate: string
  ) => Result<PerformanceRecord[]>;
};

// -----------------------------------------------------------------------------
// モジュールレベルのヘルパー
//
// 配置方針: ヘルパー関数は「呼び出し元より前」に定義する。
//   依存関係が浅いものから順に並べ、最下段の唯一の値エクスポートである
//   createPerformanceRepository() が全ヘルパーを参照できる状態にしている。
//   （型 PerformanceRepository も別途 export しているが、こちらは値ではない。）
//   （TypeScript の function 宣言は巻き上げられるため配置順はランタイム挙動に
//    影響しないが、上から読み下すだけで依存が解決される並びにして可読性を優先する。）
// -----------------------------------------------------------------------------

/**
 * 実績シート1行分の生値を {@link PerformanceRecord} にパースする。
 *
 * @param row シートから読み込んだ1行分の生値（列順は {@link PERFORMANCE_HEADERS} に対応）。
 * @param index 0始まりの行インデックス（エラーメッセージでは見出し行を考慮し `index + 2` を表示）。
 * @returns パース済みレコードを持つ {@link Result}。列が不正な場合は失敗を返す。
 */
function parseRow(row: unknown[], index: number): Result<PerformanceRecord> {
  const [
    fundId,
    date,
    totalUnits,
    remainingInvestment,
    currentValue,
    totalGain,
    unrealizedGainRate,
    createdAt,
  ] = row;

  if (typeof fundId !== 'string') {
    return fail('unexpected', `performanceの${String(index + 2)}行目のfundIdが不正です。`);
  }

  // dateはスプレッドシートからDateオブジェクトとして返される可能性があるため、文字列に変換
  const dateResult = parseSheetDate(date, {
    sheetLabel: 'performance',
    fieldName: 'date',
    index,
    trim: true,
    quoteInvalidValue: true,
  });
  if (!dateResult.success) {
    return dateResult;
  }
  const dateStr = dateResult.value;

  // totalUnitsは全体実績シートでは空文字列の場合がある（ファンド別実績では必須）
  let totalUnitsValue: number;
  if (totalUnits === '' || totalUnits === null || totalUnits === undefined) {
    totalUnitsValue = 0; // 空の場合は0として扱う
  } else if (typeof totalUnits === 'number' && !Number.isNaN(totalUnits)) {
    totalUnitsValue = totalUnits;
  } else {
    return fail('unexpected', `performanceの${String(index + 2)}行目のtotalUnitsが不正です。`);
  }
  const remainingInvestmentResult = parseNumberCell(
    remainingInvestment,
    'performance',
    'remainingInvestment',
    index
  );
  if (!remainingInvestmentResult.success) {
    return remainingInvestmentResult;
  }
  const currentValueResult = parseNumberCell(currentValue, 'performance', 'currentValue', index);
  if (!currentValueResult.success) {
    return currentValueResult;
  }
  const totalGainResult = parseNumberCell(totalGain, 'performance', 'totalGain', index);
  if (!totalGainResult.success) {
    return totalGainResult;
  }
  const unrealizedGainRateResult = parseNumberCell(
    unrealizedGainRate,
    'performance',
    'unrealizedGainRate',
    index
  );
  if (!unrealizedGainRateResult.success) {
    return unrealizedGainRateResult;
  }
  const createdAtResult = parseRequiredStringCell(createdAt, 'performance', 'createdAt', index);
  if (!createdAtResult.success) {
    return createdAtResult;
  }

  return {
    success: true,
    value: {
      fundId,
      date: dateStr,
      totalUnits: totalUnitsValue,
      remainingInvestment: remainingInvestmentResult.value,
      currentValue: currentValueResult.value,
      totalGain: totalGainResult.value,
      unrealizedGainRate: unrealizedGainRateResult.value,
      createdAt: createdAtResult.value,
    },
  };
}

/**
 * ファンドIDから実績シート名を取得し、シートを確保する
 * @param sheetRepository シートリポジトリ
 * @param fundId ファンドID
 * @returns シート名またはエラー
 */
function ensurePerformanceSheet(sheetRepository: SheetRepository, fundId: string): Result<string> {
  const sheetName = getPerformanceSheetName(fundId);
  const definition: SheetDefinition = {
    name: sheetName,
    headers: PERFORMANCE_HEADERS,
  };

  const ensureResult = sheetRepository.ensureSheet(definition);
  if (!ensureResult.success) {
    return ensureResult;
  }

  return { success: true, value: sheetName };
}

/**
 * 全体実績シートを確保する
 * @param sheetRepository シートリポジトリ
 * @returns シート名またはエラー
 */
function ensureGlobalPerformanceSheet(sheetRepository: SheetRepository): Result<string> {
  const definition: SheetDefinition = {
    name: PERFORMANCE_SHEET_NAME,
    headers: PERFORMANCE_HEADERS,
  };

  const ensureResult = sheetRepository.ensureSheet(definition);
  if (!ensureResult.success) {
    return ensureResult;
  }

  return { success: true, value: PERFORMANCE_SHEET_NAME };
}

/**
 * 指定した実績シートを読み込み、述語に合致するレコードのみを日付昇順で返す共通処理。
 *
 * 目的:
 * - `listGlobalHistory()`（全体・全件取得）・`findGlobalByDateRange()`（全体・期間フィルタ）・
 *   `findByFundAndDateRange()`（ファンド別・期間フィルタ）に重複していた
 *   「全行読み込み → 空行スキップ → パース（失敗行は警告ログのうえスキップ）
 *   → ソート」の処理を一本化する（H3 #149）。各呼び出しの差分は「対象シート」と
 *   「採用するレコードの条件」だけであるため、シート名と述語 `shouldInclude` を
 *   外部から注入する。
 *
 * 既存挙動の踏襲（重要）:
 * - 空行は {@link isEmptyRow} でスキップする。
 * - パース失敗行はエラーで中断せず、{@link logWarn}（`[WARN]` プレフィックス付きの
 *   `Logger.log`）に記録して当該行のみスキップする（シート全体の取得は継続する元挙動を保つ）。
 * - 最終結果は date の昇順（文字列の辞書順＝時系列順）でソートして返す。
 * - シート読み取り失敗（シート不存在等）は失敗 {@link Result} をそのまま返す。
 *   「不存在を空配列扱いにする」かどうかは呼び出し側の責務とする
 *   （`findByFundAndDateRange` はファンド別シート未作成を正常系として空配列に変換する）。
 *
 * @param sheetRepository シート入出力を担うリポジトリ。
 * @param sheetName 読み込む実績シート名（全体実績またはファンド別実績）。
 * @param shouldInclude 各レコードを結果に含めるか判定する述語。true を返したレコードのみ採用する。
 * @returns 述語に合致したレコードの配列（日付昇順）を持つ {@link Result}。
 */
function readRecords(
  sheetRepository: SheetRepository,
  sheetName: string,
  shouldInclude: (record: PerformanceRecord) => boolean
): Result<PerformanceRecord[]> {
  const rowsResult = sheetRepository.readAllRows(sheetName);
  if (!rowsResult.success) {
    return propagateFailure(rowsResult);
  }

  const records: PerformanceRecord[] = [];
  for (const [index, row] of rowsResult.value.entries()) {
    // 空行をスキップ
    if (isEmptyRow(row)) {
      continue;
    }

    const parsed = parseRow(row, index);
    if (!parsed.success) {
      // パースエラーの場合、その行をスキップして続行
      // logWarn()でエラーを記録するが、処理は継続
      logWarn(
        `[PerformanceRepository] Skipping invalid row at index ${String(index)}: ${parsed.error.message}`
      );
      continue;
    }

    if (shouldInclude(parsed.value)) {
      records.push(parsed.value);
    }
  }

  // 日付昇順でソート
  records.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { success: true, value: records };
}

/**
 * 実績シートへのアクセスを担当する。
 */
export function createPerformanceRepository(
  sheetRepository: SheetRepository
): PerformanceRepository {
  const repository: PerformanceRepository = {
    createPerformance: (performance: PerformanceRecord): Result<void> => {
      const sheetNameResult = ensurePerformanceSheet(sheetRepository, performance.fundId);
      if (!sheetNameResult.success) {
        return sheetNameResult;
      }

      return sheetRepository.appendRows(sheetNameResult.value, [
        [
          performance.fundId,
          performance.date,
          performance.totalUnits,
          performance.remainingInvestment,
          performance.currentValue,
          performance.totalGain,
          performance.unrealizedGainRate,
          performance.createdAt,
        ],
      ]);
    },
    createGlobalPerformance: (performance: PerformanceRecord): Result<void> => {
      const sheetNameResult = ensureGlobalPerformanceSheet(sheetRepository);
      if (!sheetNameResult.success) {
        return sheetNameResult;
      }

      // 全体実績ではtotalUnitsは記録しない（ファンドごとに単位が異なるため合計値に意味がない）
      return sheetRepository.appendRows(sheetNameResult.value, [
        [
          performance.fundId,
          performance.date,
          '', // totalUnits: 全体実績では空（ファンドごとに単位が異なるため）
          performance.remainingInvestment,
          performance.currentValue,
          performance.totalGain,
          performance.unrealizedGainRate,
          performance.createdAt,
        ],
      ]);
    },
    findByFundAndDate: (fundId: string, date: string): Result<PerformanceRecord | null> => {
      const sheetName = getPerformanceSheetName(fundId);
      const rowsResult = sheetRepository.readAllRows(sheetName);

      // シートが存在しない場合はnullを返す（エラーにしない）
      if (!rowsResult.success) {
        return { success: true, value: null };
      }

      const found = findRowByPredicate(
        rowsResult.value,
        parseRow,
        (record) => record.fundId === fundId && record.date === date
      );
      if (!found.success) {
        return found;
      }

      return { success: true, value: found.value?.entity ?? null };
    },
    findGlobalByDate: (date: string): Result<PerformanceRecord | null> => {
      const rowsResult = sheetRepository.readAllRows(PERFORMANCE_SHEET_NAME);

      // シートが存在しない場合はnullを返す（エラーにしない）
      if (!rowsResult.success) {
        return { success: true, value: null };
      }

      const found = findRowByPredicate(
        rowsResult.value,
        parseRow,
        (record) => record.date === date
      );
      if (!found.success) {
        return found;
      }

      return { success: true, value: found.value?.entity ?? null };
    },
    findLatestByFundId: (fundId: string): Result<PerformanceRecord | null> => {
      const sheetNameResult = ensurePerformanceSheet(sheetRepository, fundId);
      if (!sheetNameResult.success) {
        return propagateFailure(sheetNameResult);
      }

      const rowsResult = sheetRepository.readAllRows(sheetNameResult.value);
      if (!rowsResult.success) {
        return propagateFailure(rowsResult);
      }

      const rows = rowsResult.value;
      if (rows.length === 0) {
        return { success: true, value: null };
      }

      // 最新のデータは最後の行
      const latestRow = rows[rows.length - 1];
      const parseResult = parseRow(latestRow, rows.length - 1);
      if (!parseResult.success) {
        return parseResult;
      }

      return { success: true, value: parseResult.value };
    },

    listGlobalHistory: (): Result<PerformanceRecord[]> => {
      // 全レコードを対象とするため、述語は常に true を返す。
      return readRecords(sheetRepository, PERFORMANCE_SHEET_NAME, () => true);
    },

    findGlobalByDateRange: (startDate: string, endDate: string): Result<PerformanceRecord[]> => {
      // 日付範囲（startDate以上、endDate以下）に合致するレコードのみを対象とする。
      return readRecords(
        sheetRepository,
        PERFORMANCE_SHEET_NAME,
        (record) => record.date >= startDate && record.date <= endDate
      );
    },

    findByFundAndDateRange: (
      fundId: string,
      startDate: string,
      endDate: string
    ): Result<PerformanceRecord[]> => {
      // fundId と日付範囲（startDate以上、endDate以下）に合致するレコードのみを対象とする。
      const result = readRecords(
        sheetRepository,
        getPerformanceSheetName(fundId),
        (record) => record.fundId === fundId && record.date >= startDate && record.date <= endDate
      );

      // ファンド別シートが存在しない場合は空配列を返す（エラーにしない既存挙動を維持）。
      // readRecords の失敗要因はシート読み取り（readAllRows）のみであるため、
      // 失敗を一律に空配列へ変換しても読み取り失敗以外を握り潰すことはない。
      if (!result.success) {
        return { success: true, value: [] };
      }
      return result;
    },
  };

  return repository;
}
