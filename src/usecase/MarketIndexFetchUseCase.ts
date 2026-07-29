import type { MarketIndex, Result } from '../domain/types';
import { getLastBusinessDay } from '../domain/UsMarketCalendar';
import type { MarketIndexRepository } from '../repository/MarketIndexRepository';
import type { MarketIndexService } from '../service/MarketIndexService';
import { clock, formatDateToIso } from '../utils/dateTime';

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
 * {@link MarketIndexFetchResult} が取りうる処理ステータスの一覧。
 * 型ガード（{@link isMarketIndexFetchResult}）のランタイム検証で用いる。
 */
const MARKET_INDEX_FETCH_STATUSES: readonly MarketIndexFetchResult['status'][] = [
  'success',
  'already_exists',
  'skipped',
  'failed',
];

/**
 * {@link MarketIndexFetchResult} の型ガード関数。
 *
 * `main.ts` の `fetchMarketIndices` が API レスポンス（unknown）を取得結果として扱う前の
 * ランタイム検証に用いる。status は文字列一般ではなく、本結果型が定義する4値
 * （{@link MARKET_INDEX_FETCH_STATUSES}）のいずれかであることまで検証する
 * （未知のステータスを通すと後段の 'failed' 判定・通知が静かに素通りするため fail fast に弾く）。
 *
 * 配置について: 本型ガードは結果型を定義する本モジュールに同居させる（H2 #148）。
 * 型の構造が変わった際に、型定義と検証規則を同一ファイル内で同期させるためである。
 */
export function isMarketIndexFetchResult(value: unknown): value is MarketIndexFetchResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.status === 'string' &&
    (MARKET_INDEX_FETCH_STATUSES as readonly string[]).includes(obj.status) &&
    typeof obj.date === 'string' &&
    typeof obj.message === 'string'
  );
}

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
      const now = clock.now();
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
        createdAt: clock.nowIso(),
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
  // 日本時間から14時間引いて米国東部標準時を概算し、ローカルTZ基準で文字列化する
  // （文字列化ロジックは formatDateToIso と同一実装だったため共通ヘルパーへ委譲）
  const usTime = new Date(jstDate.getTime() - 14 * 60 * 60 * 1000);
  return formatDateToIso(usTime);
}
