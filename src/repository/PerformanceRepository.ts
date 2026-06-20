import {
  PERFORMANCE_HEADERS,
  PERFORMANCE_SHEET_NAME,
  getPerformanceSheetName,
  type SheetDefinition,
} from '../Config';
import { fail, propagateFailure } from '../domain/result';
import type { PerformanceRecord, Result } from '../domain/types';
import { findRowByPredicate, isEmptyRow, parseSheetDate } from './SheetMapping';
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
      const rowsResult = sheetRepository.readAllRows(PERFORMANCE_SHEET_NAME);
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
          // Logger.log()でエラーを記録するが、処理は継続
          Logger.log(
            `[PerformanceRepository] Skipping invalid row at index ${String(index)}: ${parsed.error.message}`
          );
          continue;
        }
        records.push(parsed.value);
      }

      // 日付昇順でソート
      records.sort((a, b) => (a.date < b.date ? -1 : 1));
      return { success: true, value: records };
    },

    findGlobalByDateRange: (startDate: string, endDate: string): Result<PerformanceRecord[]> => {
      const rowsResult = sheetRepository.readAllRows(PERFORMANCE_SHEET_NAME);
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
          Logger.log(
            `[PerformanceRepository] Skipping invalid row at index ${String(index)}: ${parsed.error.message}`
          );
          continue;
        }

        // 日付範囲でフィルタリング（startDate以上、endDate以下）
        if (parsed.value.date >= startDate && parsed.value.date <= endDate) {
          records.push(parsed.value);
        }
      }

      // 日付昇順でソート
      records.sort((a, b) => (a.date < b.date ? -1 : 1));
      return { success: true, value: records };
    },

    findByFundAndDateRange: (
      fundId: string,
      startDate: string,
      endDate: string
    ): Result<PerformanceRecord[]> => {
      const sheetName = getPerformanceSheetName(fundId);
      const rowsResult = sheetRepository.readAllRows(sheetName);

      // シートが存在しない場合は空配列を返す（エラーにしない）
      if (!rowsResult.success) {
        return { success: true, value: [] };
      }

      const records: PerformanceRecord[] = [];
      for (const [index, row] of rowsResult.value.entries()) {
        // 空行をスキップ
        if (isEmptyRow(row)) {
          continue;
        }

        const parsed = parseRow(row, index);
        if (!parsed.success) {
          Logger.log(
            `[PerformanceRepository] Skipping invalid row at index ${String(index)}: ${parsed.error.message}`
          );
          continue;
        }

        // fundIdと日付範囲でフィルタリング
        if (
          parsed.value.fundId === fundId &&
          parsed.value.date >= startDate &&
          parsed.value.date <= endDate
        ) {
          records.push(parsed.value);
        }
      }

      // 日付昇順でソート
      records.sort((a, b) => (a.date < b.date ? -1 : 1));
      return { success: true, value: records };
    },
  };

  return repository;
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
  if (typeof remainingInvestment !== 'number' || Number.isNaN(remainingInvestment)) {
    return fail(
      'unexpected',
      `performanceの${String(index + 2)}行目のremainingInvestmentが不正です。`
    );
  }
  if (typeof currentValue !== 'number' || Number.isNaN(currentValue)) {
    return fail('unexpected', `performanceの${String(index + 2)}行目のcurrentValueが不正です。`);
  }
  if (typeof totalGain !== 'number' || Number.isNaN(totalGain)) {
    return fail('unexpected', `performanceの${String(index + 2)}行目のtotalGainが不正です。`);
  }
  if (typeof unrealizedGainRate !== 'number' || Number.isNaN(unrealizedGainRate)) {
    return fail(
      'unexpected',
      `performanceの${String(index + 2)}行目のunrealizedGainRateが不正です。`
    );
  }
  if (typeof createdAt !== 'string' || createdAt === '') {
    return fail('unexpected', `performanceの${String(index + 2)}行目のcreatedAtが不正です。`);
  }

  return {
    success: true,
    value: {
      fundId,
      date: dateStr,
      totalUnits: totalUnitsValue,
      remainingInvestment,
      currentValue,
      totalGain,
      unrealizedGainRate,
      createdAt,
    },
  };
}
