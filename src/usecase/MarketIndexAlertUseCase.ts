import { formatDateToIso } from '../domain/dateFormat';
import type { MarketIndex, Result } from '../domain/types';
import { propagateFailure } from '../domain/result';
import type { MarketIndexRepository } from '../repository/MarketIndexRepository';
import type { EmailService } from '../service/EmailService';

/**
 * 市場指数の変化情報。
 * 個別指数（S&P500またはNASDAQ）の前週比情報を保持する。
 */
export type MarketIndexChange = {
  /** 今週の終値 */
  currentValue: number;
  /** 前週の終値 */
  previousValue: number;
  /** 変化率（%単位、例: -5.2は-5.2%を表す） */
  changeRate: number;
  /** -5%ルールがトリガーされたか（変化率 <= -5.0 の場合にtrue） */
  isTriggered: boolean;
};

/**
 * -5%ルールアラート判定結果。
 * S&P500とNASDAQの前週比を計算し、-5%以上の下落があるかを判定する。
 */
export type MarketIndexAlertResult = {
  /** アラートがトリガーされたか（S&P500またはNASDAQが-5%以上下落した場合にtrue） */
  isAlertTriggered: boolean;
  /** S&P500の変化情報（データ取得できなかった場合はnull） */
  sp500: MarketIndexChange | null;
  /** NASDAQの変化情報（データ取得できなかった場合はnull） */
  nasdaq: MarketIndexChange | null;
  /** 今週のデータ日付（YYYY-MM-DD形式） */
  alertDate: string;
  /** 比較対象の前週のデータ日付（YYYY-MM-DD形式） */
  comparisonDate: string;
};

/**
 * -5%ルールアラートユースケース。
 * S&P500およびNASDAQの前週比を計算し、-5%以上の下落を検出する。
 */
export type MarketIndexAlertUseCase = {
  /**
   * -5%ルールアラートを判定する。
   * 最新の市場指数データと約7日前のデータを比較し、-5%以上の下落があるかを判定する。
   *
   * @returns アラート判定結果
   */
  checkAlert: () => Result<MarketIndexAlertResult>;

  /**
   * -5%ルールアラートを判定し、条件を満たせばアラートメールの送信とセルのハイライトを行う。
   *
   * 処理内容（従来 main.ts の `checkAndSendMarketIndexAlert` に直書きされていた
   * 「判定 → メール送信 → シートのセル色付け」のオーケストレーションを usecase 層へ
   * 集約したもの。H2 #148）:
   * 1. {@link checkAlert} で -5%ルールを判定する（失敗時はエラーを返す）。
   * 2. アラート条件を満たさない場合はスキップして正常終了する。
   * 3. アラートメールを送信する（失敗時はエラーを返す）。
   * 4. -5%以上下落した指数（S&P500 / NASDAQ）のセルをハイライトする。
   *    ハイライトの失敗は移設前と同様にログ出力のみで、処理全体は失敗させない。
   *
   * 各ステップのログ文言は移設前の main.ts 実装と完全に一致させている（可観測性の維持）。
   *
   * @param recipientEmail - アラートメールの送信先アドレス
   * @returns 判定〜送信が完了すれば成功（スキップ時も成功）、判定・送信失敗時はそのエラー
   */
  checkAndNotify: (recipientEmail: string) => Result<void>;
};

/**
 * -5%ルールのしきい値（%単位）。
 * この値以下の変化率でアラートがトリガーされる。
 */
const ALERT_THRESHOLD_PERCENT = -5.0;

/**
 * 前週データを検索する際の許容日数。
 * 7日前を基準に±2日の範囲でデータを検索する。
 */
const PREVIOUS_WEEK_SEARCH_OFFSETS = [0, -1, 1, -2, 2];

/**
 * -5%ルールアラートユースケースを生成する。
 *
 * @param marketIndexRepository 市場指数リポジトリ
 * @param emailService メール送信サービス（{@link MarketIndexAlertUseCase.checkAndNotify} で使用）
 * @returns -5%ルールアラートユースケース
 */
export function createMarketIndexAlertUseCase(
  marketIndexRepository: MarketIndexRepository,
  emailService: EmailService
): MarketIndexAlertUseCase {
  const checkAlert = (): Result<MarketIndexAlertResult> => {
    // 全ての市場指数データを取得（日付降順）
    const listResult = marketIndexRepository.listAll();
    if (!listResult.success) {
      return listResult;
    }

    const allRecords = listResult.value;
    if (allRecords.length === 0) {
      return {
        success: false,
        error: {
          type: 'not_found',
          message: '市場指数データが存在しません。',
        },
      };
    }

    // 最新のデータ（今週のデータ）を取得
    // allRecords.length > 0 は上で確認済みのため、allRecords[0]は必ず存在する
    const latestRecord = allRecords[0];

    // 7日前付近のデータを検索
    const previousRecord = findPreviousWeekRecord(allRecords, latestRecord.date);
    if (previousRecord === null) {
      return {
        success: false,
        error: {
          type: 'not_found',
          message: `前週（約7日前）の市場指数データが見つかりません。基準日: ${latestRecord.date}`,
        },
      };
    }

    // S&P500の変化率を計算
    const sp500Change = calculateIndexChange(latestRecord.sp500, previousRecord.sp500);

    // NASDAQの変化率を計算
    const nasdaqChange = calculateIndexChange(latestRecord.nasdaq, previousRecord.nasdaq);

    // アラートがトリガーされたかを判定
    const isAlertTriggered = sp500Change.isTriggered || nasdaqChange.isTriggered;

    return {
      success: true,
      value: {
        isAlertTriggered,
        sp500: sp500Change,
        nasdaq: nasdaqChange,
        alertDate: latestRecord.date,
        comparisonDate: previousRecord.date,
      },
    };
  };

  /**
   * 判定 → アラートメール送信 → セルハイライトのオーケストレーション。
   * ログ文言は移設前の main.ts `checkAndSendMarketIndexAlert` と完全に一致させる。
   */
  const checkAndNotify = (recipientEmail: string): Result<void> => {
    // -5%ルール判定を実行
    const alertResult = checkAlert();
    if (!alertResult.success) {
      Logger.log(`[checkAndSendMarketIndexAlert] アラート判定に失敗: ${alertResult.error.message}`);
      return propagateFailure(alertResult);
    }

    const result = alertResult.value;
    Logger.log(
      `[checkAndSendMarketIndexAlert] 判定完了: isAlertTriggered=${String(result.isAlertTriggered)}, ` +
        `S&P500=${result.sp500?.changeRate.toFixed(2) ?? 'N/A'}%, ` +
        `NASDAQ=${result.nasdaq?.changeRate.toFixed(2) ?? 'N/A'}%`
    );

    // アラートがトリガーされていない場合は終了
    if (!result.isAlertTriggered) {
      Logger.log('[checkAndSendMarketIndexAlert] アラート条件を満たしていないためスキップします。');
      return { success: true, value: undefined };
    }

    // アラートメールを送信
    const sendResult = emailService.sendMarketIndexAlert(result, recipientEmail);
    if (!sendResult.success) {
      Logger.log(
        `[checkAndSendMarketIndexAlert] アラートメール送信に失敗: ${sendResult.error.message}`
      );
      return propagateFailure(sendResult);
    }

    Logger.log('[checkAndSendMarketIndexAlert] アラートメールを送信しました。');

    // -5%以上下落した指数のセルを色付けする。
    // 対象2指数（S&P500 / NASDAQ）の処理は列キーとログ表記以外同一のため、定義配列で一括処理する。
    // ハイライト失敗はログ出力のみで処理全体を失敗させない（移設前の挙動を維持）。
    const highlightTargets = [
      { change: result.sp500, column: 'sp500' as const, label: 'S&P500' },
      { change: result.nasdaq, column: 'nasdaq' as const, label: 'NASDAQ' },
    ];
    for (const target of highlightTargets) {
      if (!target.change?.isTriggered) {
        continue;
      }
      const highlightResult = marketIndexRepository.highlightAlertCell(
        result.alertDate,
        target.column
      );
      if (highlightResult.success) {
        Logger.log(
          `[checkAndSendMarketIndexAlert] ${target.label}セルをハイライトしました: ${result.alertDate}`
        );
      } else {
        Logger.log(
          `[checkAndSendMarketIndexAlert] ${target.label}セルのハイライトに失敗: ${highlightResult.error.message}`
        );
      }
    }

    return { success: true, value: undefined };
  };

  return {
    checkAlert,
    checkAndNotify,
  };
}

/**
 * 指定された日付から約7日前のレコードを検索する。
 * 7日前のデータが存在しない場合、±2日の範囲で最も近いデータを返す。
 *
 * @param records 市場指数データの配列（日付降順）
 * @param latestDate 最新のデータ日付
 * @returns 前週のレコード、見つからない場合はnull
 */
function findPreviousWeekRecord(records: MarketIndex[], latestDate: string): MarketIndex | null {
  const targetDates = PREVIOUS_WEEK_SEARCH_OFFSETS.map((offset) => {
    const date = new Date(latestDate);
    // 7日前を基準にオフセットを適用
    date.setDate(date.getDate() - 7 + offset);
    return formatDateToIso(date);
  });

  for (const targetDate of targetDates) {
    const record = records.find((r) => r.date === targetDate);
    if (record !== undefined) {
      return record;
    }
  }

  return null;
}

/**
 * 指数の変化率を計算し、MarketIndexChange型を返す。
 *
 * @param currentValue 今週の終値
 * @param previousValue 前週の終値
 * @returns 指数変化情報
 */
function calculateIndexChange(currentValue: number, previousValue: number): MarketIndexChange {
  // 変化率を計算: (今週 - 前週) / 前週 * 100
  const changeRate = ((currentValue - previousValue) / previousValue) * 100;

  // 小数点第2位で四捨五入
  const roundedChangeRate = Math.round(changeRate * 100) / 100;

  return {
    currentValue,
    previousValue,
    changeRate: roundedChangeRate,
    isTriggered: roundedChangeRate <= ALERT_THRESHOLD_PERCENT,
  };
}
