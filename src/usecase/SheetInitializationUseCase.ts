import {
  PERFORMANCE_HEADERS,
  PERFORMANCE_SHEET_NAME,
  SHEET_DEFINITIONS,
  SHEET_HEADERS,
  SHEET_NAMES,
  getFundIdSuffix,
  getPerformanceSheetName,
  getTransactionSheetName,
  type SheetDefinition,
} from '../Config';
import { fail } from '../domain/result';
import type { Result } from '../domain/types';
import type { FundRepository } from '../repository/FundRepository';
import type { SheetRepository } from '../repository/SheetRepository';

/**
 * シート初期化・存在保証に関するユースケース。
 *
 * これまで api/router.ts に直接記述されていた「シート定義 → ensure → エラーハンドル」の
 * ビジネスロジック（基本シート/全体実績/ファンド別シートの生成、ファンドID末尾3文字の
 * 重複検証、各種バッチ実行前のシート存在保証）を usecase 層へ集約したもの。
 */
export type SheetInitializationUseCase = {
  /**
   * アプリの動作に必要な全シートを作成し、整合性を保証する。
   *
   * 処理内容:
   * - 基本シート（{@link SHEET_DEFINITIONS}）を作成する。
   * - 全体実績シート（{@link PERFORMANCE_SHEET_NAME}）を作成する。
   * - 登録済み全ファンドについて、取引シートと実績シートを作成する。
   *   この際、ファンドID末尾3文字（シート名サフィックス）の重複が無いことを検証する。
   *
   * @returns 成功時は完了メッセージ、失敗時はエラー
   */
  initializeAllSheets: () => Result<{ message: string }>;

  /**
   * NAV（基準価額）自動取得に必要なシートが存在することを保証する。
   * 対象は funds シートと nav_records シート。
   *
   * @returns 成功時は void、失敗時はエラー
   */
  ensureNavFetchSheets: () => Result<void>;

  /**
   * 市場指数取得に必要な市場指数シートが存在することを保証する。
   *
   * @returns 成功時は void、失敗時はエラー
   */
  ensureMarketIndexSheet: () => Result<void>;
};

/**
 * シート初期化ユースケースを生成する。
 *
 * @param sheetRepository シート操作リポジトリ
 * @param fundRepository ファンドリポジトリ（ファンド別シート生成に使用）
 * @returns シート初期化ユースケース
 */
export function createSheetInitializationUseCase(
  sheetRepository: SheetRepository,
  fundRepository: FundRepository
): SheetInitializationUseCase {
  /**
   * 単一のシート定義を ensure し、失敗時はそのエラーを返す。
   * 「シート定義 → ensure → エラーハンドル」の定型を一箇所に集約する。
   */
  const ensureSheet = (definition: SheetDefinition): Result<void> => {
    const result = sheetRepository.ensureSheet(definition);
    if (!result.success) {
      return result;
    }
    return { success: true, value: undefined };
  };

  /**
   * 複数のシート定義を順番に ensure し、最初の失敗で打ち切る。
   */
  const ensureSheets = (definitions: readonly SheetDefinition[]): Result<void> => {
    for (const definition of definitions) {
      const result = ensureSheet(definition);
      if (!result.success) {
        return result;
      }
    }
    return { success: true, value: undefined };
  };

  return {
    initializeAllSheets: (): Result<{ message: string }> => {
      // 基本シートの初期化
      const baseResult = ensureSheets(SHEET_DEFINITIONS);
      if (!baseResult.success) {
        return baseResult;
      }

      // 全体実績シートを作成
      const globalPerfResult = ensureSheet({
        name: PERFORMANCE_SHEET_NAME,
        headers: PERFORMANCE_HEADERS,
      });
      if (!globalPerfResult.success) {
        return globalPerfResult;
      }

      // 全ファンドの取引シートと実績シートを作成
      const fundsResult = fundRepository.listFunds();
      if (fundsResult.success) {
        // ファンドID末尾3文字（シート名サフィックス）の重複を検証
        const suffixMap = new Map<string, string>();
        for (const fund of fundsResult.value) {
          const suffix = getFundIdSuffix(fund.id);
          const existingId = suffixMap.get(suffix);
          if (existingId !== undefined) {
            return fail('conflict', `ファンドID末尾3文字が重複しています。対象末尾: ${suffix}`);
          }
          suffixMap.set(suffix, fund.id);
        }

        for (const fund of fundsResult.value) {
          // 取引シートを作成
          const transactionResult = ensureSheet({
            name: getTransactionSheetName(fund.id),
            headers: SHEET_HEADERS[SHEET_NAMES.TRANSACTIONS],
          });
          if (!transactionResult.success) {
            return transactionResult;
          }

          // 実績シートを作成
          const performanceResult = ensureSheet({
            name: getPerformanceSheetName(fund.id),
            headers: PERFORMANCE_HEADERS,
          });
          if (!performanceResult.success) {
            return performanceResult;
          }
        }
      }

      return { success: true, value: { message: 'シート初期化が完了しました。' } };
    },

    ensureNavFetchSheets: (): Result<void> => {
      const requiredDefinitions = SHEET_DEFINITIONS.filter(
        (definition) =>
          definition.name === SHEET_NAMES.FUNDS || definition.name === SHEET_NAMES.NAV_RECORDS
      );
      return ensureSheets(requiredDefinitions);
    },

    ensureMarketIndexSheet: (): Result<void> => {
      return ensureSheet({
        name: SHEET_NAMES.MARKET_INDICES,
        headers: SHEET_HEADERS[SHEET_NAMES.MARKET_INDICES],
      });
    },
  };
}
