import type { Result, WeekOverWeekChange } from '../domain/types';
import type { WeeklyReport } from '../usecase/WeeklyReportUseCase';

/**
 * メール送信サービス。
 * Google Apps ScriptのMailAppを使用してメールを送信する。
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
};

/**
 * 数値を3桁区切りの文字列に変換する。
 *
 * @param value - 数値
 * @returns フォーマット済み文字列
 */
function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('ja-JP');
}

/**
 * 損益率をパーセント表記の文字列に変換する。
 *
 * @param rate - 損益率（小数、例: 0.15 = 15%）
 * @returns パーセント表記の文字列（例: "+15.0%"）
 */
function formatRate(rate: number): string {
  const percentage = rate * 100;
  const sign = percentage >= 0 ? '+' : '';
  return `${sign}${percentage.toFixed(1)}%`;
}

/**
 * 前週比の差分を符号付きの文字列に変換する。
 *
 * @param difference - 差分（円単位）
 * @returns フォーマット済み文字列（例: "+10,000円"、"-5,000円"）
 */
function formatDifference(difference: number): string {
  const sign = difference >= 0 ? '+' : '';
  return `${sign}${formatNumber(difference)}円`;
}

/**
 * 前週比の変化率を符号付きの文字列に変換する。
 *
 * @param changeRate - 変化率（%単位、例: 5.2 = +5.2%）
 * @returns フォーマット済み文字列（例: "+5.2%"、"-3.1%"）
 */
function formatChangeRate(changeRate: number): string {
  const sign = changeRate >= 0 ? '+' : '';
  return `${sign}${changeRate.toFixed(1)}%`;
}

/**
 * 前週比の差分と変化率を1つの文字列にフォーマットする。
 *
 * @param change - 前週比情報
 * @returns フォーマット済み文字列（例: "+10,000円 (+5.2%)"）
 */
function formatWeekOverWeekChange(change: WeekOverWeekChange | null): string {
  if (change === null) {
    return '---';
  }
  const diffStr = formatDifference(change.difference);
  const rateStr = formatChangeRate(change.changeRate);
  return `${diffStr} (${rateStr})`;
}

/**
 * 損益率の前週比（%ポイント）を符号付きの文字列に変換する。
 *
 * @param changeInPercentagePoints - %ポイント差分（例: 1.5 = +1.5%ポイント）
 * @returns フォーマット済み文字列（例: "+1.5%pt"、"-0.8%pt"）
 */
function formatPercentagePointChange(changeInPercentagePoints: number): string {
  const sign = changeInPercentagePoints >= 0 ? '+' : '';
  return `${sign}${changeInPercentagePoints.toFixed(1)}%pt`;
}

/**
 * 週次レポートのHTMLメール本文を生成する。
 *
 * @param report - 週次レポート
 * @returns HTMLメール本文
 */
function generateEmailBody(report: WeeklyReport): string {
  const { portfolio, generatedAt } = report;

  // ポートフォリオ全体のサマリー
  const totalInvestmentStr = formatNumber(portfolio.remainingInvestment);
  const totalValueStr =
    portfolio.totalCurrentValue !== null ? formatNumber(portfolio.totalCurrentValue) : '---';
  const totalGainStr =
    portfolio.totalUnrealizedGain !== null ? formatNumber(portfolio.totalUnrealizedGain) : '---';
  const totalGainRateStr =
    portfolio.totalUnrealizedGainRate !== null
      ? formatRate(portfolio.totalUnrealizedGainRate)
      : '---';

  // 損益の色を決定（全体）
  const totalGainColor =
    portfolio.totalUnrealizedGain !== null
      ? portfolio.totalUnrealizedGain >= 0
        ? '#1565c0'
        : '#c62828'
      : '#333';

  // 前週比のフォーマット（全体）
  const totalInvestmentChangeStr = formatWeekOverWeekChange(portfolio.remainingInvestmentChange);
  const totalValueChangeStr = formatWeekOverWeekChange(portfolio.totalCurrentValueChange);
  const totalGainChangeStr =
    portfolio.totalUnrealizedGainChange !== null
      ? formatDifference(portfolio.totalUnrealizedGainChange)
      : '---';
  const totalGainRateChangeStr =
    portfolio.totalUnrealizedGainRateChange !== null
      ? formatPercentagePointChange(portfolio.totalUnrealizedGainRateChange)
      : '---';

  // 前週比の色を決定
  const getChangeColor = (value: number | null): string => {
    if (value === null) return '#666';
    return value >= 0 ? '#1565c0' : '#c62828';
  };

  const totalInvestmentChangeColor = getChangeColor(
    portfolio.remainingInvestmentChange?.difference ?? null
  );
  const totalValueChangeColor = getChangeColor(
    portfolio.totalCurrentValueChange?.difference ?? null
  );
  const totalGainChangeColor = getChangeColor(portfolio.totalUnrealizedGainChange);
  const totalGainRateChangeColor = getChangeColor(portfolio.totalUnrealizedGainRateChange);

  // 保有銘柄一覧のHTML生成
  let holdingsHtml = '';
  for (const holding of portfolio.holdings) {
    const investmentStr = formatNumber(holding.remainingInvestment);
    const valueStr = holding.currentValue !== null ? formatNumber(holding.currentValue) : '---';
    const gainStr = holding.unrealizedGain !== null ? formatNumber(holding.unrealizedGain) : '---';
    const gainRateStr =
      holding.unrealizedGainRate !== null ? formatRate(holding.unrealizedGainRate) : '---';

    // 損益の色を決定（個別銘柄）
    const gainColor =
      holding.unrealizedGain !== null
        ? holding.unrealizedGain >= 0
          ? '#1565c0'
          : '#c62828'
        : '#333';

    // 前週比のフォーマット（個別銘柄）
    const holdingGainChangeStr =
      holding.unrealizedGainChange !== null
        ? formatDifference(holding.unrealizedGainChange)
        : '---';
    const holdingGainChangeColor = getChangeColor(holding.unrealizedGainChange);

    holdingsHtml += `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${holding.fundName}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${investmentStr}円</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${valueStr}円</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${gainColor}; font-weight: bold;">${gainStr}円</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${gainColor}; font-weight: bold;">${gainRateStr}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${holdingGainChangeColor}; font-weight: bold;">${holdingGainChangeStr}</td>
      </tr>
    `;
  }

  const html = `
    <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 20px;">
        <h1 style="color: #333;">Trustfolio 週次レポート</h1>
        <p style="color: #666;">レポート生成日時: ${generatedAt}</p>

        <h2 style="color: #333; margin-top: 30px;">ポートフォリオ全体</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 800px; margin-bottom: 30px;">
          <tr style="background-color: #f5f5f5;">
            <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">項目</th>
            <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">金額</th>
            <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">前週比</th>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">残存投資額</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${totalInvestmentStr}円</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${totalInvestmentChangeColor}; font-weight: bold; font-size: 12px;">${totalInvestmentChangeStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">評価額</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${totalValueStr}円</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${totalValueChangeColor}; font-weight: bold; font-size: 12px;">${totalValueChangeStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">損益</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${totalGainColor}; font-weight: bold;">${totalGainStr}円</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${totalGainChangeColor}; font-weight: bold; font-size: 12px;">${totalGainChangeStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">損益率</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${totalGainColor}; font-weight: bold;">${totalGainRateStr}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${totalGainRateChangeColor}; font-weight: bold; font-size: 12px;">${totalGainRateChangeStr}</td>
          </tr>
        </table>

        <h2 style="color: #333; margin-top: 30px;">保有銘柄一覧</h2>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
          <tr style="background-color: #f5f5f5;">
            <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">銘柄名</th>
            <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">残存投資額</th>
            <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">評価額</th>
            <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">損益</th>
            <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">損益率</th>
            <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">前週比（損益）</th>
          </tr>
          ${holdingsHtml}
        </table>

        <p style="color: #999; font-size: 12px; margin-top: 40px;">
          このメールはTrustfolioから自動送信されています。
        </p>
      </body>
    </html>
  `;

  return html;
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

      // メール本文を生成
      const htmlBody = generateEmailBody(report);

      // メール件名に損益情報を追加
      let subject = `【Trustfolio】週次投資実績レポート（${report.generatedAt.split(' ')[0]}）`;
      if (report.portfolio.totalUnrealizedGain !== null) {
        const gainStr = formatNumber(report.portfolio.totalUnrealizedGain);
        const prefix = report.portfolio.totalUnrealizedGain >= 0 ? '+' : '';
        subject += ` ${prefix}${gainStr}円`;
      }

      // GASのMailAppを使用してメール送信
      MailApp.sendEmail({
        to: recipient,
        subject,
        htmlBody,
      });

      Logger.log(`週次レポートメールを送信しました: ${recipient}`);

      return { success: true, value: undefined };
    },

    sendErrorNotification: (
      taskName: string,
      errorMessage: string,
      recipient: string
    ): Result<void> => {
      // メールアドレスのバリデーション
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

      // エラー通知メール本文
      const now = new Date();
      const timestamp = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

      const htmlBody = `
        <html>
          <head>
            <meta charset="utf-8">
          </head>
          <body style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 20px;">
            <h1 style="color: #c62828;">Trustfolio エラー通知</h1>
            <p style="color: #666;">発生日時: ${timestamp}</p>

            <h2 style="color: #333; margin-top: 30px;">タスク</h2>
            <p style="font-size: 16px; color: #333;">${taskName}</p>

            <h2 style="color: #333; margin-top: 30px;">エラー内容</h2>
            <div style="background-color: #ffebee; border-left: 4px solid #c62828; padding: 16px; margin: 16px 0;">
              <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: monospace; color: #333;">${errorMessage}</pre>
            </div>

            <p style="color: #999; font-size: 12px; margin-top: 40px;">
              このメールはTrustfolioから自動送信されています。
            </p>
          </body>
        </html>
      `;

      const subject = `【Trustfolio】エラー通知: ${taskName}`;

      // GASのMailAppを使用してメール送信
      MailApp.sendEmail({
        to: recipient,
        subject,
        htmlBody,
      });

      Logger.log(`エラー通知メールを送信しました: ${recipient} (タスク: ${taskName})`);

      return { success: true, value: undefined };
    },
  };
}
