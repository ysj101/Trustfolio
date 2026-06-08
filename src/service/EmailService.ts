import type { HoldingWithWeekOverWeek, Result, WeekOverWeekChange } from '../domain/types';
import type { MarketIndexAlertResult } from '../usecase/MarketIndexAlertUseCase';
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
 * HTMLメールのテーブルセルで繰り返し用いるインラインスタイル定数。
 *
 * 目的:
 * - 各メール本文に大量に重複していた `padding: ...; border: 1px solid #ddd; ...`
 *   というスタイル文字列を一元化する。
 *
 * 注意:
 * - 各値は元の文字列と完全に一致させており、`${STYLE.x} color: ...;` のように
 *   末尾へ追記する形でも、既存のHTML出力が1バイトも変わらないようにしている。
 */
const STYLE = {
  /** 8px パディングの通常セル。 */
  td: 'padding: 8px; border: 1px solid #ddd;',
  /** 8px パディングの右寄せセル。 */
  tdRight: 'padding: 8px; border: 1px solid #ddd; text-align: right;',
  /** 12px パディングの通常セル。 */
  cell: 'padding: 12px; border: 1px solid #ddd;',
  /** 12px パディングの左寄せセル（テーブル見出し用）。 */
  cellLeft: 'padding: 12px; border: 1px solid #ddd; text-align: left;',
  /** 12px パディングの右寄せセル（テーブル見出し・数値セル用）。 */
  cellRight: 'padding: 12px; border: 1px solid #ddd; text-align: right;',
} as const;

/**
 * 週次レポート・市場指数アラートで共通のHTML外枠（html/head/body）でラップする。
 *
 * 目的:
 * - 2種類のメールで完全に一致していた外枠テンプレートを一本化する。
 *
 * 注意:
 * - エラー通知メール（{@link createEmailService} 内）は歴史的にインデントが異なり、
 *   この関数を使うと出力バイト列が変わってしまうため、あえて本関数を共有しない。
 *
 * @param innerHtml - `<body>` 直下に挿入する本文HTML。先頭に改行とインデントを含む。
 * @returns 外枠で包んだ完全なHTML文字列。
 */
function wrapEmailBody(innerHtml: string): string {
  return `
    <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 20px;">${innerHtml}
      </body>
    </html>
  `;
}

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
 * 前週比の差分（円・%ポイント）に応じた文字色を返す。
 *
 * @param value - 差分値。nullの場合はデータなし。
 * @returns CSSの色コード。
 */
function getChangeColor(value: number | null): string {
  if (value === null) {
    return '#666';
  }
  return value >= 0 ? '#1565c0' : '#c62828';
}

/**
 * 保有銘柄一覧テーブルの各行（tr）HTMLを生成する。
 *
 * @param holdings - 前週比付き保有銘柄の配列
 * @returns 連結済みの行HTML
 */
function buildHoldingsRows(holdings: HoldingWithWeekOverWeek[]): string {
  let holdingsHtml = '';
  for (const holding of holdings) {
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
        <td style="${STYLE.td}">${holding.fundName}</td>
        <td style="${STYLE.tdRight}">${investmentStr}円</td>
        <td style="${STYLE.tdRight}">${valueStr}円</td>
        <td style="${STYLE.tdRight} color: ${gainColor}; font-weight: bold;">${gainStr}円</td>
        <td style="${STYLE.tdRight} color: ${gainColor}; font-weight: bold;">${gainRateStr}</td>
        <td style="${STYLE.tdRight} color: ${holdingGainChangeColor}; font-weight: bold;">${holdingGainChangeStr}</td>
      </tr>
    `;
  }
  return holdingsHtml;
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
  const totalInvestmentChangeColor = getChangeColor(
    portfolio.remainingInvestmentChange?.difference ?? null
  );
  const totalValueChangeColor = getChangeColor(
    portfolio.totalCurrentValueChange?.difference ?? null
  );
  const totalGainChangeColor = getChangeColor(portfolio.totalUnrealizedGainChange);
  const totalGainRateChangeColor = getChangeColor(portfolio.totalUnrealizedGainRateChange);

  // 保有銘柄一覧のHTML生成
  const holdingsHtml = buildHoldingsRows(portfolio.holdings);

  const inner = `
        <h1 style="color: #333;">Trustfolio 週次レポート</h1>
        <p style="color: #666;">レポート生成日時: ${generatedAt}</p>

        <h2 style="color: #333; margin-top: 30px;">ポートフォリオ全体</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 800px; margin-bottom: 30px;">
          <tr style="background-color: #f5f5f5;">
            <th style="${STYLE.cellLeft}">項目</th>
            <th style="${STYLE.cellRight}">金額</th>
            <th style="${STYLE.cellRight}">前週比</th>
          </tr>
          <tr>
            <td style="${STYLE.td}">残存投資額</td>
            <td style="${STYLE.tdRight}">${totalInvestmentStr}円</td>
            <td style="${STYLE.tdRight} color: ${totalInvestmentChangeColor}; font-weight: bold; font-size: 12px;">${totalInvestmentChangeStr}</td>
          </tr>
          <tr>
            <td style="${STYLE.td}">評価額</td>
            <td style="${STYLE.tdRight}">${totalValueStr}円</td>
            <td style="${STYLE.tdRight} color: ${totalValueChangeColor}; font-weight: bold; font-size: 12px;">${totalValueChangeStr}</td>
          </tr>
          <tr>
            <td style="${STYLE.td}">損益</td>
            <td style="${STYLE.tdRight} color: ${totalGainColor}; font-weight: bold;">${totalGainStr}円</td>
            <td style="${STYLE.tdRight} color: ${totalGainChangeColor}; font-weight: bold; font-size: 12px;">${totalGainChangeStr}</td>
          </tr>
          <tr>
            <td style="${STYLE.td}">損益率</td>
            <td style="${STYLE.tdRight} color: ${totalGainColor}; font-weight: bold;">${totalGainRateStr}</td>
            <td style="${STYLE.tdRight} color: ${totalGainRateChangeColor}; font-weight: bold; font-size: 12px;">${totalGainRateChangeStr}</td>
          </tr>
        </table>

        <h2 style="color: #333; margin-top: 30px;">保有銘柄一覧</h2>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
          <tr style="background-color: #f5f5f5;">
            <th style="${STYLE.cellLeft}">銘柄名</th>
            <th style="${STYLE.cellRight}">残存投資額</th>
            <th style="${STYLE.cellRight}">評価額</th>
            <th style="${STYLE.cellRight}">損益</th>
            <th style="${STYLE.cellRight}">損益率</th>
            <th style="${STYLE.cellRight}">前週比（損益）</th>
          </tr>
          ${holdingsHtml}
        </table>

        <p style="color: #999; font-size: 12px; margin-top: 40px;">
          このメールはTrustfolioから自動送信されています。
        </p>`;

  return wrapEmailBody(inner);
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

      // エラー通知メール本文
      const now = new Date();
      const timestamp = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

      // 注意: このメールは歴史的に外枠のインデントが他メールと異なるため、
      // wrapEmailBody を使わずインラインで生成して既存の出力を維持している。
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

      // GASのMailAppを使用してメール送信
      MailApp.sendEmail({
        to: recipient,
        subject,
        htmlBody,
      });

      Logger.log(`-5%ルールアラートメールを送信しました: ${recipient}`);

      return { success: true, value: undefined };
    },
  };
}

/**
 * -5%ルールアラートのHTMLメール本文を生成する。
 *
 * @param alertResult - アラート判定結果
 * @returns HTMLメール本文
 */
function generateMarketIndexAlertEmailBody(alertResult: MarketIndexAlertResult): string {
  const { sp500, nasdaq, alertDate, comparisonDate } = alertResult;

  // 下落した指数の詳細を生成
  let triggeredIndicesHtml = '';

  if (sp500?.isTriggered) {
    triggeredIndicesHtml += `
      <tr style="background-color: #ffebee;">
        <td style="${STYLE.cell} font-weight: bold;">S&P500</td>
        <td style="${STYLE.cellRight}">${sp500.previousValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="${STYLE.cellRight}">${sp500.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="${STYLE.cellRight} color: #c62828; font-weight: bold;">${sp500.changeRate.toFixed(2)}%</td>
      </tr>
    `;
  }

  if (nasdaq?.isTriggered) {
    triggeredIndicesHtml += `
      <tr style="background-color: #ffebee;">
        <td style="${STYLE.cell} font-weight: bold;">NASDAQ</td>
        <td style="${STYLE.cellRight}">${nasdaq.previousValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="${STYLE.cellRight}">${nasdaq.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="${STYLE.cellRight} color: #c62828; font-weight: bold;">${nasdaq.changeRate.toFixed(2)}%</td>
      </tr>
    `;
  }

  // 下落していない指数も参考情報として表示
  let referenceIndicesHtml = '';

  if (sp500 && !sp500.isTriggered) {
    const changeColor = sp500.changeRate >= 0 ? '#1565c0' : '#c62828';
    const changeSign = sp500.changeRate >= 0 ? '+' : '';
    referenceIndicesHtml += `
      <tr>
        <td style="${STYLE.cell}">S&P500</td>
        <td style="${STYLE.cellRight}">${sp500.previousValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="${STYLE.cellRight}">${sp500.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="${STYLE.cellRight} color: ${changeColor};">${changeSign}${sp500.changeRate.toFixed(2)}%</td>
      </tr>
    `;
  }

  if (nasdaq && !nasdaq.isTriggered) {
    const changeColor = nasdaq.changeRate >= 0 ? '#1565c0' : '#c62828';
    const changeSign = nasdaq.changeRate >= 0 ? '+' : '';
    referenceIndicesHtml += `
      <tr>
        <td style="${STYLE.cell}">NASDAQ</td>
        <td style="${STYLE.cellRight}">${nasdaq.previousValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="${STYLE.cellRight}">${nasdaq.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="${STYLE.cellRight} color: ${changeColor};">${changeSign}${nasdaq.changeRate.toFixed(2)}%</td>
      </tr>
    `;
  }

  const inner = `
        <h1 style="color: #c62828;">⚠️ -5%ルールアラート</h1>
        <p style="color: #666;">比較期間: ${comparisonDate} → ${alertDate}</p>

        <div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; font-size: 16px; color: #333;">
            <strong>市場指数が前週比-5%以上下落しました。</strong><br>
            追加投資を検討するタイミングかもしれません。
          </p>
        </div>

        <h2 style="color: #333; margin-top: 30px;">下落した指数</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-bottom: 20px;">
          <tr style="background-color: #f5f5f5;">
            <th style="${STYLE.cellLeft}">指数</th>
            <th style="${STYLE.cellRight}">前週終値</th>
            <th style="${STYLE.cellRight}">今週終値</th>
            <th style="${STYLE.cellRight}">変化率</th>
          </tr>
          ${triggeredIndicesHtml}
        </table>

        ${
          referenceIndicesHtml !== ''
            ? `
        <h2 style="color: #333; margin-top: 30px;">参考: その他の指数</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-bottom: 20px;">
          <tr style="background-color: #f5f5f5;">
            <th style="${STYLE.cellLeft}">指数</th>
            <th style="${STYLE.cellRight}">前週終値</th>
            <th style="${STYLE.cellRight}">今週終値</th>
            <th style="${STYLE.cellRight}">変化率</th>
          </tr>
          ${referenceIndicesHtml}
        </table>
        `
            : ''
        }

        <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #333;">
            <strong>-5%ルールとは</strong><br>
            市場が大きく下落した際に追加投資を行う投資戦略です。<br>
            長期的な視点で、割安になった資産を購入する機会として活用できます。
          </p>
        </div>

        <p style="color: #999; font-size: 12px; margin-top: 40px;">
          このメールはTrustfolioから自動送信されています。<br>
          投資は自己責任で行ってください。
        </p>`;

  return wrapEmailBody(inner);
}
