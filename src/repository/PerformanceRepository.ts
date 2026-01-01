import {
  PERFORMANCE_HEADERS,
  PERFORMANCE_SHEET_NAME,
  getPerformanceSheetName,
  type SheetDefinition,
} from '../Config';
import type { AppError, Performance, Result } from '../domain/types';
import type { SheetRepository } from './SheetRepository';

export type PerformanceRepository = {
  /**
   * 実績を記録する（ファンド別シート）
   * @param performance 実績データ
   * @returns 成功または失敗
   */
  createPerformance: (performance: Performance) => Result<void>;

  /**
   * 実績を記録する（全体シート）
   * @param performance 実績データ
   * @returns 成功または失敗
   */
  createGlobalPerformance: (performance: Performance) => Result<void>;

  /**
   * 特定日の実績が既に存在するか確認（ファンド別）
   * @param fundId ファンドID
   * @param date 日付（YYYY-MM-DD形式）
   * @returns 実績データまたはnull
   */
  findByFundAndDate: (fundId: string, date: string) => Result<Performance | null>;

  /**
   * 特定日の実績が既に存在するか確認（全体）
   * @param date 日付（YYYY-MM-DD形式）
   * @returns 実績データまたはnull
   */
  findGlobalByDate: (date: string) => Result<Performance | null>;
};

/**
 * 実績シートへのアクセスを担当する。
 */
export function createPerformanceRepository(
  sheetRepository: SheetRepository
): PerformanceRepository {
  const repository: PerformanceRepository = {
    createPerformance: (performance: Performance): Result<void> => {
      const sheetNameResult = ensurePerformanceSheet(sheetRepository, performance.fundId);
      if (!sheetNameResult.success) {
        return sheetNameResult;
      }

      return sheetRepository.appendRows(sheetNameResult.value as never, [
        [
          performance.id,
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
    createGlobalPerformance: (performance: Performance): Result<void> => {
      const sheetNameResult = ensureGlobalPerformanceSheet(sheetRepository);
      if (!sheetNameResult.success) {
        return sheetNameResult;
      }

      return sheetRepository.appendRows(sheetNameResult.value as never, [
        [
          performance.id,
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
    findByFundAndDate: (fundId: string, date: string): Result<Performance | null> => {
      const sheetName = getPerformanceSheetName(fundId);
      const rowsResult = sheetRepository.readAllRows(sheetName as never);

      // シートが存在しない場合はnullを返す（エラーにしない）
      if (!rowsResult.success) {
        return { success: true, value: null };
      }

      for (let index = 0; index < rowsResult.value.length; index += 1) {
        const row = rowsResult.value[index];
        // 空行はスキップ
        const isEmpty = row.every((cell) => cell === '' || cell === null || cell === undefined);
        if (isEmpty) {
          continue;
        }

        const parsed = parseRow(row, index);
        if (!parsed.success) {
          return parsed;
        }
        if (parsed.value.fundId === fundId && parsed.value.date === date) {
          return { success: true, value: parsed.value };
        }
      }

      return { success: true, value: null };
    },
    findGlobalByDate: (date: string): Result<Performance | null> => {
      const rowsResult = sheetRepository.readAllRows(PERFORMANCE_SHEET_NAME as never);

      // シートが存在しない場合はnullを返す（エラーにしない）
      if (!rowsResult.success) {
        return { success: true, value: null };
      }

      for (let index = 0; index < rowsResult.value.length; index += 1) {
        const row = rowsResult.value[index];
        // 空行はスキップ
        const isEmpty = row.every((cell) => cell === '' || cell === null || cell === undefined);
        if (isEmpty) {
          continue;
        }

        const parsed = parseRow(row, index);
        if (!parsed.success) {
          return parsed;
        }
        if (parsed.value.date === date) {
          return { success: true, value: parsed.value };
        }
      }

      return { success: true, value: null };
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
    name: sheetName as never,
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
    name: PERFORMANCE_SHEET_NAME as never,
    headers: PERFORMANCE_HEADERS,
  };

  const ensureResult = sheetRepository.ensureSheet(definition);
  if (!ensureResult.success) {
    return ensureResult;
  }

  return { success: true, value: PERFORMANCE_SHEET_NAME };
}

function parseRow(row: unknown[], index: number): Result<Performance> {
  const [
    id,
    fundId,
    date,
    totalUnits,
    remainingInvestment,
    currentValue,
    totalGain,
    unrealizedGainRate,
    createdAt,
  ] = row;

  if (typeof id !== 'string' || id === '') {
    return fail('unexpected', `performanceの${String(index + 2)}行目のidが不正です。`);
  }
  if (typeof fundId !== 'string') {
    return fail('unexpected', `performanceの${String(index + 2)}行目のfundIdが不正です。`);
  }

  // dateはスプレッドシートからDateオブジェクトとして返される可能性があるため、文字列に変換
  let dateStr: string;
  if (date instanceof Date) {
    // Dateオブジェクトが無効な日付でないかチェック
    if (Number.isNaN(date.getTime())) {
      return fail(
        'unexpected',
        `performanceの${String(index + 2)}行目のdateが無効な日付です。値: ${String(date)}`
      );
    }
    dateStr = formatDateToIso(date);
  } else if (typeof date === 'string' && date.trim() !== '') {
    dateStr = date.trim();
  } else {
    return fail(
      'unexpected',
      `performanceの${String(index + 2)}行目のdateが不正です。型: ${typeof date}, 値: "${String(date)}"`
    );
  }

  if (typeof totalUnits !== 'number' || Number.isNaN(totalUnits)) {
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
      id,
      fundId,
      date: dateStr,
      totalUnits,
      remainingInvestment,
      currentValue,
      totalGain,
      unrealizedGainRate,
      createdAt,
    },
  };
}

function fail<T>(type: AppError['type'], message: string): Result<T> {
  return { success: false, error: { type, message } };
}

/**
 * DateオブジェクトをYYYY-MM-DD形式の文字列に変換する。
 * タイムゾーンに依存せず、Dateオブジェクトのローカル日付を使用する。
 */
function formatDateToIso(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
