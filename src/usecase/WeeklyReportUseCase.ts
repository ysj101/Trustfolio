import type { Portfolio, Result } from '../domain/types';
import type { PortfolioUseCase } from './PortfolioUseCase';

/**
 * 週次レポート情報。
 * メール送信用のフォーマット済みデータを保持する。
 */
export type WeeklyReport = {
  /** ポートフォリオ全体のサマリー */
  portfolio: Portfolio;
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
 * @returns 週次レポートのユースケース
 */
export function createWeeklyReportUseCase(portfolioUseCase: PortfolioUseCase): WeeklyReportUseCase {
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

      return {
        success: true,
        value: {
          portfolio: portfolioResult.value,
          generatedAt,
        },
      };
    },
  };
}
