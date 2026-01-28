import type { MarketIndex, Result } from '../domain/types';
import { getLastBusinessDay, isUsMarketBusinessDay } from '../domain/UsMarketCalendar';
import type { MarketIndexRepository } from '../repository/MarketIndexRepository';
import type { MarketIndexService } from '../service/MarketIndexService';

/**
 * 市場指数取得結果。
 */
export type MarketIndexFetchResult = {
  /** 処理ステータス */
  status: 'success' | 'already_exists' | 'skipped' | 'failed';
  /** 対象日付（YYYY-MM-DD形式、米国市場日付） */
  date: string;
  /** メッセージ */
  message: string;
  /** 取得したデータ（成功時のみ） */
  data?: MarketIndex;
};

/**
 * 市場指数取得ユースケース。
 * S&P500およびNASDAQ Compositeの終値を取得し、シートに記録する。
 */
export type MarketIndexFetchUseCase = {
  /**
   * 最新の市場指数を取得して記録する。
   * 米国市場の直近営業日のデータを取得する。
   *
   * @returns 取得結果
   */
  fetchAndRecordLatestIndices: () => Result<MarketIndexFetchResult>;
};

/**
 * 市場指数取得ユースケースを生成する。
 *
 * @param marketIndexRepository 市場指数リポジトリ
 * @param marketIndexService 市場指数サービス
 * @returns 市場指数取得ユースケース
 */
export function createMarketIndexFetchUseCase(
  marketIndexRepository: MarketIndexRepository,
  marketIndexService: MarketIndexService
): MarketIndexFetchUseCase {
  return {
    fetchAndRecordLatestIndices: (): Result<MarketIndexFetchResult> => {
      // 現在の米国東部時間の日付を取得
      // 日本時間から米国東部時間への変換（JST - 14時間 = EST、夏時間は-13時間）
      // 安全のため、日本時間6:00実行時は前日の米国日付を使用
      const now = new Date();
      const usDate = getUsEasternDate(now);

      // 直近の営業日を取得
      const lastBusinessDay = getLastBusinessDay(usDate);
      if (lastBusinessDay === null) {
        return {
          success: false,
          error: {
            type: 'unexpected',
            message: `直近の営業日を特定できませんでした。日付: ${usDate}`,
          },
        };
      }

      // 営業日チェック（デバッグ用にログ出力）
      const isBusinessDay = isUsMarketBusinessDay(usDate);
      console.log(
        `市場指数取得: 現在日付=${usDate}, 営業日=${String(isBusinessDay)}, 対象日付=${lastBusinessDay}`
      );

      // 既に同日のデータが存在するかチェック
      const existingResult = marketIndexRepository.findByDate(lastBusinessDay);
      if (!existingResult.success) {
        return existingResult;
      }

      if (existingResult.value !== null) {
        return {
          success: true,
          value: {
            status: 'already_exists',
            date: lastBusinessDay,
            message: `${lastBusinessDay}のデータは既に記録済みです。`,
            data: existingResult.value,
          },
        };
      }

      // ヘルパーシートの存在確認と初期化
      const ensureResult = marketIndexService.ensureHelperSheet();
      if (!ensureResult.success) {
        return ensureResult;
      }

      // 指数データを取得
      const fetchResult = marketIndexService.fetchLatestIndices();
      if (!fetchResult.success) {
        return {
          success: true,
          value: {
            status: 'failed',
            date: lastBusinessDay,
            message: `指数データの取得に失敗しました: ${fetchResult.error.message}`,
          },
        };
      }

      // レコードを作成
      const record: MarketIndex = {
        date: lastBusinessDay,
        sp500: fetchResult.value.sp500,
        nasdaq: fetchResult.value.nasdaq,
        createdAt: new Date().toISOString(),
      };

      // シートに記録
      const createResult = marketIndexRepository.create(record);
      if (!createResult.success) {
        return createResult;
      }

      return {
        success: true,
        value: {
          status: 'success',
          date: lastBusinessDay,
          message: `${lastBusinessDay}の市場指数を記録しました。S&P500: ${String(record.sp500)}, NASDAQ: ${String(record.nasdaq)}`,
          data: record,
        },
      };
    },
  };
}

/**
 * 日本時間のDateオブジェクトから米国東部時間の日付文字列を取得する。
 *
 * 米国東部時間は日本時間から-14時間（標準時）または-13時間（夏時間）。
 * 夏時間の判定は複雑なため、簡略化して-14時間で計算する。
 * これにより、日本時間の朝6時は米国東部時間の前日16時となり、
 * 前日の取引終了後のデータを取得できる。
 *
 * @param jstDate 日本時間のDateオブジェクト
 * @returns 米国東部時間の日付（YYYY-MM-DD形式）
 */
function getUsEasternDate(jstDate: Date): string {
  // 日本時間から14時間引いて米国東部標準時を概算
  const usTime = new Date(jstDate.getTime() - 14 * 60 * 60 * 1000);
  const year = usTime.getFullYear();
  const month = String(usTime.getMonth() + 1).padStart(2, '0');
  const day = String(usTime.getDate()).padStart(2, '0');
  return `${String(year)}-${month}-${day}`;
}
