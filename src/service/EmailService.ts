import type { Result } from '../domain/types';
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

    holdingsHtml += `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${holding.fundName}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${investmentStr}円</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${valueStr}円</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${gainColor}; font-weight: bold;">${gainStr}円</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${gainColor}; font-weight: bold;">${gainRateStr}</td>
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
        <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-bottom: 30px;">
          <tr style="background-color: #f5f5f5;">
            <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">項目</th>
            <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">金額</th>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">残存投資額</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${totalInvestmentStr}円</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">評価額</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${totalValueStr}円</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">損益</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${totalGainColor}; font-weight: bold;">${totalGainStr}円</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">損益率</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: ${totalGainColor}; font-weight: bold;">${totalGainRateStr}</td>
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
  };
}
