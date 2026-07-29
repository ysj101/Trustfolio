import type { Result } from '../domain/types';
import type { MarketIndexAlertResult } from '../usecase/MarketIndexAlertUseCase';
import type { WeeklyReport } from '../usecase/WeeklyReportUseCase';
import {
  formatNumber,
  generateErrorNotificationEmailBody,
  generateMarketIndexAlertEmailBody,
  generateWeeklyReportEmailBody,
} from './emailTemplates';
import { clock, formatJstTimestamp } from '../utils/dateTime';

/**
 * メール送信サービス。
 * Google Apps ScriptのMailAppを使用してメールを送信する。
 *
 * 本文 HTML の生成は `emailTemplates.ts` へ分離しており（H5 #151）、
 * 本サービスは「入力の検証 → 件名の生成 → 送信 → ログ出力」の送信ロジックのみを担う。
 */
export type EmailService = {
  /**
   * 週次レポートをメールで送信する。
   *
   * @param report - 週次レポート
   * @param recipient - 送信先メールアドレス
   * @returns 送信結果
   */
  sendWeeklyReport: (report: WeeklyReport, recipient: string) => Result<void>;

  /**
   * エラー通知メールを送信する。
   *
   * @param taskName - タスク名（例: 基準価額自動取得、積立自動実行）
   * @param errorMessage - エラーメッセージ
   * @param recipient - 送信先メールアドレス
   * @returns 送信結果
   */
  sendErrorNotification: (
    taskName: string,
    errorMessage: string,
    recipient: string
  ) => Result<void>;

  /**
   * -5%ルールアラートメールを送信する。
   * S&P500またはNASDAQが前週比-5%以上下落した場合に、追加投資を促すメールを送信する。
   *
   * @param alertResult - アラート判定結果
   * @param recipient - 送信先メールアドレス
   * @returns 送信結果
   */
  sendMarketIndexAlert: (alertResult: MarketIndexAlertResult, recipient: string) => Result<void>;
};

/**
 * 送信先メールアドレスが指定されているかを検証する。
 *
 * 目的:
 * - 各送信メソッドで重複していた送信先バリデーションを一本化する。
 *
 * @param recipient - 送信先メールアドレス。
 * @returns 妥当ならvoidの成功、未指定ならvalidationエラー。
 */
function validateRecipient(recipient: string): Result<void> {
  if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
    return {
      success: false,
      error: {
        type: 'validation',
        message: '送信先メールアドレスが指定されていません。',
        field: 'recipient',
      },
    };
  }
  return { success: true, value: undefined };
}

/**
 * HTML メールを送信し、完了ログを出力する共通処理。
 *
 * 目的:
 * - 3つの送信メソッドで反復していた「`MailApp.sendEmail({to, subject, htmlBody})` →
 *   `Logger.log`」の定型を一本化する（H5 #151）。
 *
 * 注意:
 * - 送信前の検証（宛先・タスク名・アラート発火条件）は各メソッド固有のため、
 *   本ヘルパーには含めない（検証済みの入力で呼び出すこと）。
 *
 * @param recipient - 送信先メールアドレス（検証済み）。
 * @param subject - メール件名。
 * @param htmlBody - メール本文 HTML。
 * @param logMessage - 送信完了時に出力するログ文言。
 * @returns 送信完了の成功 {@link Result}。
 */
function sendHtmlEmail(
  recipient: string,
  subject: string,
  htmlBody: string,
  logMessage: string
): Result<void> {
  // GASのMailAppを使用してメール送信
  MailApp.sendEmail({
    to: recipient,
    subject,
    htmlBody,
  });

  Logger.log(logMessage);

  return { success: true, value: undefined };
}

/**
 * メール送信サービスを生成する。
 *
 * @returns メール送信サービス
 */
export function createEmailService(): EmailService {
  return {
    sendWeeklyReport: (report: WeeklyReport, recipient: string): Result<void> => {
      // メールアドレスのバリデーション
      const recipientResult = validateRecipient(recipient);
      if (!recipientResult.success) {
        return recipientResult;
      }

      // メール本文を生成
      const htmlBody = generateWeeklyReportEmailBody(report);

      // メール件名に損益情報を追加
      let subject = `【Trustfolio】週次投資実績レポート（${report.generatedAt.split(' ')[0]}）`;
      if (report.portfolio.totalUnrealizedGain !== null) {
        const gainStr = formatNumber(report.portfolio.totalUnrealizedGain);
        const prefix = report.portfolio.totalUnrealizedGain >= 0 ? '+' : '';
        subject += ` ${prefix}${gainStr}円`;
      }

      return sendHtmlEmail(
        recipient,
        subject,
        htmlBody,
        `週次レポートメールを送信しました: ${recipient}`
      );
    },

    sendErrorNotification: (
      taskName: string,
      errorMessage: string,
      recipient: string
    ): Result<void> => {
      // メールアドレスのバリデーション
      const recipientResult = validateRecipient(recipient);
      if (!recipientResult.success) {
        return recipientResult;
      }

      // タスク名のバリデーション
      if (!taskName || typeof taskName !== 'string' || taskName.trim() === '') {
        return {
          success: false,
          error: {
            type: 'validation',
            message: 'タスク名が指定されていません。',
            field: 'taskName',
          },
        };
      }

      // エラー通知メール本文（発生日時の取得・JST 整形は送信側の責務）
      const timestamp = formatJstTimestamp(clock.now());
      const htmlBody = generateErrorNotificationEmailBody(taskName, errorMessage, timestamp);

      const subject = `【Trustfolio】エラー通知: ${taskName}`;

      return sendHtmlEmail(
        recipient,
        subject,
        htmlBody,
        `エラー通知メールを送信しました: ${recipient} (タスク: ${taskName})`
      );
    },

    sendMarketIndexAlert: (
      alertResult: MarketIndexAlertResult,
      recipient: string
    ): Result<void> => {
      // メールアドレスのバリデーション
      const recipientResult = validateRecipient(recipient);
      if (!recipientResult.success) {
        return recipientResult;
      }

      // アラートがトリガーされていない場合は送信しない
      if (!alertResult.isAlertTriggered) {
        return {
          success: false,
          error: {
            type: 'validation',
            message: 'アラート条件を満たしていないため、メールを送信しません。',
          },
        };
      }

      // メール本文を生成
      const htmlBody = generateMarketIndexAlertEmailBody(alertResult);

      // 下落率をタイトルに含める
      const triggeredIndices: string[] = [];
      if (alertResult.sp500?.isTriggered) {
        triggeredIndices.push(`S&P500 ${alertResult.sp500.changeRate.toFixed(1)}%`);
      }
      if (alertResult.nasdaq?.isTriggered) {
        triggeredIndices.push(`NASDAQ ${alertResult.nasdaq.changeRate.toFixed(1)}%`);
      }
      const subject = `【Trustfolio】-5%ルールアラート: ${triggeredIndices.join(', ')}`;

      return sendHtmlEmail(
        recipient,
        subject,
        htmlBody,
        `-5%ルールアラートメールを送信しました: ${recipient}`
      );
    },
  };
}
