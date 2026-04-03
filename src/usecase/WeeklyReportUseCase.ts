import { enrichPortfolioWithWeekOverWeek } from '../domain/WeekOverWeekCalculator';
import type { PerformanceRecord, PortfolioWithWeekOverWeek, Result } from '../domain/types';
import type { PerformanceRepository } from '../repository/PerformanceRepository';
import type { PortfolioUseCase } from './PortfolioUseCase';

/**
 * 週次レポート情報。
 * メール送信用のフォーマット済みデータを保持する。
 */
export type WeeklyReport = {
  /** ポートフォリオ全体のサマリー（前週比付き） */
  portfolio: PortfolioWithWeekOverWeek;
  /** レポート生成日時（YYYY-MM-DD HH:mm:ss形式） */
  generatedAt: string;
};

/**
 * 週次レポートのユースケース。
 */
export type WeeklyReportUseCase = {
  /**
   * 週次レポートを生成する。
   * ポートフォリオ全体と各保有銘柄の情報を取得し、レポート形式に整形する。
   */
  generateWeeklyReport: () => Result<WeeklyReport>;
};

/**
 * 週次レポートのユースケースを生成する。
 *
 * @param portfolioUseCase - ポートフォリオのユースケース
 * @param performanceRepository - パフォーマンスリポジトリ
 * @returns 週次レポートのユースケース
 */
export function createWeeklyReportUseCase(
  portfolioUseCase: PortfolioUseCase,
  performanceRepository: PerformanceRepository
): WeeklyReportUseCase {
  return {
    generateWeeklyReport: (): Result<WeeklyReport> => {
      // ポートフォリオサマリーを取得
      const portfolioResult = portfolioUseCase.getPortfolioSummary();
      if (!portfolioResult.success) {
        return portfolioResult as Result<WeeklyReport>;
      }

      // 現在日時を取得（JST）
      const now = new Date();
      const generatedAt = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

      // 7日前の日付を計算（前週のデータを取得するため）
      const previousWeekDate = new Date(now);
      previousWeekDate.setDate(previousWeekDate.getDate() - 7);

      // 前週のデータを取得（祝日・連休対応: 7日前から14日前まで過去方向に検索）
      const { previousGlobalRecord, previousFundRecordsMap } = getPreviousWeekData(
        performanceRepository,
        previousWeekDate,
        portfolioResult.value.holdings
      );

      // 前週比を計算してポートフォリオに追加
      const portfolioWithWoW = enrichPortfolioWithWeekOverWeek(
        portfolioResult.value,
        previousGlobalRecord,
        previousFundRecordsMap
      );

      return {
        success: true,
        value: {
          portfolio: portfolioWithWoW,
          generatedAt,
        },
      };
    },
  };
}

/**
 * 前週のパフォーマンスデータを取得する。
 * 7日前のデータが存在しない場合、過去方向に最大14日前まで検索する。
 * これにより、祝日や連休で7日前のデータが存在しない場合でも、
 * 比較期間を短縮せずに直近の有効データを前週データとして採用する。
 *
 * @param performanceRepository - パフォーマンスリポジトリ
 * @param targetDate - 基準日（7日前の日付）
 * @param holdings - 現在の保有銘柄一覧
 * @returns 前週の全体データと銘柄別データのマップ
 */
function getPreviousWeekData(
  performanceRepository: PerformanceRepository,
  targetDate: Date,
  holdings: { fundId: string }[]
): {
  previousGlobalRecord: PerformanceRecord | null;
  previousFundRecordsMap: Map<string, PerformanceRecord>;
} {
  // 7日前を基準に、より古い日付だけを順番に探索する。
  // 7日前より新しい日付を採用すると、前週比ではなく直近日次比較になるため許可しない。
  const searchOffsets = [0, -1, -2, -3, -4, -5, -6, -7];
  const searchDates = searchOffsets.map((offset) => {
    const date = new Date(targetDate);
    date.setDate(date.getDate() + offset);
    return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
  });

  // 全体実績の前週データを検索
  let previousGlobalRecord: PerformanceRecord | null = null;
  for (const dateStr of searchDates) {
    const result = performanceRepository.findGlobalByDate(dateStr);
    if (result.success && result.value !== null) {
      previousGlobalRecord = result.value;
      Logger.log(`[WeeklyReportUseCase] 前週データを取得: ${dateStr}`);
      break;
    }
  }

  // 前週データが見つからなかった場合
  if (!previousGlobalRecord) {
    Logger.log(
      '[WeeklyReportUseCase] 前週の全体実績データが見つかりませんでした（14日前まで検索）。'
    );
    return {
      previousGlobalRecord: null,
      previousFundRecordsMap: new Map(),
    };
  }

  // 銘柄別の前週データを取得
  const previousFundRecordsMap = new Map<string, PerformanceRecord>();
  const previousWeekDate = previousGlobalRecord.date;

  for (const holding of holdings) {
    const result = performanceRepository.findByFundAndDate(holding.fundId, previousWeekDate);
    if (result.success && result.value !== null) {
      previousFundRecordsMap.set(holding.fundId, result.value);
    } else {
      Logger.log(
        `[WeeklyReportUseCase] 銘柄${holding.fundId}の前週実績データが見つかりませんでした。`
      );
    }
  }

  return {
    previousGlobalRecord,
    previousFundRecordsMap,
  };
}
