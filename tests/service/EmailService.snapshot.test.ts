import { describe, expect, it, vi } from 'vitest';
import { createEmailService } from '../../src/service/EmailService';
import type { MarketIndexAlertResult } from '../../src/usecase/MarketIndexAlertUseCase';
import type { WeeklyReport } from '../../src/usecase/WeeklyReportUseCase';

/**
 * このテストは EmailService が生成する HTML メール本文を「丸ごと」スナップショットとして固定する。
 *
 * 目的:
 * - スタイル定数化・テンプレート共通化などのリファクタリング前後で、
 *   送信される HTML 出力が1文字も変わらないことを保証する回帰テストとして機能させる。
 *
 * 前提:
 * - MailApp / Utilities などの GAS グローバルは tests/setup.ts でスタブ化されている。
 * - エラー通知のタイムスタンプは Utilities.formatDate をモックして固定する。
 */

/**
 * 週次レポートを送信し、MailApp.sendEmail へ渡された htmlBody を取り出す。
 */
function captureWeeklyReportHtml(report: WeeklyReport): string {
  const service = createEmailService();
  const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
  const result = service.sendWeeklyReport(report, 'investor@example.com');
  expect(result.success).toBe(true);
  const call = sendEmailMock.mock.calls[0]?.[0];
  sendEmailMock.mockRestore();
  return call?.htmlBody ?? '';
}

describe('EmailService HTML出力スナップショット', () => {
  it('週次レポート（フルデータ・前週比あり）', () => {
    // 前提: 評価額・損益・前週比がすべて存在する保有銘柄を含む
    const report: WeeklyReport = {
      portfolio: {
        totalInvestment: 1_000_000,
        totalSaleAmount: 0,
        realizedGain: 0,
        remainingInvestment: 1_000_000,
        totalCurrentValue: 1_120_000,
        totalUnrealizedGain: 120_000,
        totalUnrealizedGainRate: 0.12,
        totalGain: 120_000,
        totalGainRate: 0.12,
        remainingInvestmentChange: { difference: 50_000, changeRate: 5.26 },
        totalCurrentValueChange: { difference: 80_000, changeRate: 7.69 },
        totalUnrealizedGainChange: 30_000,
        totalUnrealizedGainRateChange: 2.5,
        hasPreviousWeekData: true,
        holdings: [
          {
            fundId: 'fund-001',
            fundName: 'eMAXIS Slim 米国株式',
            totalUnits: 500_000,
            averageCost: 12_000,
            totalInvestment: 600_000,
            totalSaleAmount: 0,
            remainingInvestment: 600_000,
            currentNavValue: 13_000,
            currentNavDate: '2026-06-05',
            currentValue: 680_000,
            unrealizedGain: 80_000,
            unrealizedGainRate: 0.1333,
            remainingInvestmentChange: { difference: 30_000, changeRate: 5.26 },
            currentValueChange: { difference: 50_000, changeRate: 7.93 },
            unrealizedGainChange: 20_000,
            unrealizedGainRateChange: 1.8,
            hasPreviousWeekData: true,
          },
        ],
      },
      generatedAt: '2026-06-06 09:00:00',
    };

    expect(captureWeeklyReportHtml(report)).toMatchInlineSnapshot(`
      "
          <html>
            <head>
              <meta charset="utf-8">
            </head>
            <body style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 20px;">
              <h1 style="color: #333;">Trustfolio 週次レポート</h1>
              <p style="color: #666;">レポート生成日時: 2026-06-06 09:00:00</p>

              <h2 style="color: #333; margin-top: 30px;">ポートフォリオ全体</h2>
              <table style="border-collapse: collapse; width: 100%; max-width: 800px; margin-bottom: 30px;">
                <tr style="background-color: #f5f5f5;">
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">項目</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">金額</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">前週比</th>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;">残存投資額</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">1,000,000円</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #1565c0; font-weight: bold; font-size: 12px;">+50,000円 (+5.3%)</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;">評価額</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">1,120,000円</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #1565c0; font-weight: bold; font-size: 12px;">+80,000円 (+7.7%)</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;">損益</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #1565c0; font-weight: bold;">120,000円</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #1565c0; font-weight: bold; font-size: 12px;">+30,000円</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;">損益率</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #1565c0; font-weight: bold;">+12.0%</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #1565c0; font-weight: bold; font-size: 12px;">+2.5%pt</td>
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
                
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">eMAXIS Slim 米国株式</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">600,000円</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">680,000円</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #1565c0; font-weight: bold;">80,000円</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #1565c0; font-weight: bold;">+13.3%</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #1565c0; font-weight: bold;">+20,000円</td>
            </tr>
          
              </table>

              <p style="color: #999; font-size: 12px; margin-top: 40px;">
                このメールはTrustfolioから自動送信されています。
              </p>
            </body>
          </html>
        "
    `);
  });

  it('週次レポート（評価額・前週比がnull）', () => {
    // 前提: 評価額・損益・前週比がいずれも未確定（null）で「---」表示になる
    const report: WeeklyReport = {
      portfolio: {
        totalInvestment: 300_000,
        totalSaleAmount: 0,
        realizedGain: 0,
        remainingInvestment: 300_000,
        totalCurrentValue: null,
        totalUnrealizedGain: null,
        totalUnrealizedGainRate: null,
        totalGain: null,
        totalGainRate: null,
        remainingInvestmentChange: null,
        totalCurrentValueChange: null,
        totalUnrealizedGainChange: null,
        totalUnrealizedGainRateChange: null,
        hasPreviousWeekData: false,
        holdings: [
          {
            fundId: 'fund-002',
            fundName: 'ニッセイ外国株式インデックス',
            totalUnits: 100_000,
            averageCost: 11_000,
            totalInvestment: 110_000,
            totalSaleAmount: 0,
            remainingInvestment: 110_000,
            currentNavValue: null,
            currentNavDate: null,
            currentValue: null,
            unrealizedGain: null,
            unrealizedGainRate: null,
            remainingInvestmentChange: null,
            currentValueChange: null,
            unrealizedGainChange: null,
            unrealizedGainRateChange: null,
            hasPreviousWeekData: false,
          },
        ],
      },
      generatedAt: '2026-06-06 09:00:00',
    };

    expect(captureWeeklyReportHtml(report)).toMatchInlineSnapshot(`
      "
          <html>
            <head>
              <meta charset="utf-8">
            </head>
            <body style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 20px;">
              <h1 style="color: #333;">Trustfolio 週次レポート</h1>
              <p style="color: #666;">レポート生成日時: 2026-06-06 09:00:00</p>

              <h2 style="color: #333; margin-top: 30px;">ポートフォリオ全体</h2>
              <table style="border-collapse: collapse; width: 100%; max-width: 800px; margin-bottom: 30px;">
                <tr style="background-color: #f5f5f5;">
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">項目</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">金額</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">前週比</th>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;">残存投資額</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">300,000円</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #666; font-weight: bold; font-size: 12px;">---</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;">評価額</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">---円</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #666; font-weight: bold; font-size: 12px;">---</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;">損益</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #333; font-weight: bold;">---円</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #666; font-weight: bold; font-size: 12px;">---</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;">損益率</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #333; font-weight: bold;">---</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #666; font-weight: bold; font-size: 12px;">---</td>
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
                
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">ニッセイ外国株式インデックス</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">110,000円</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">---円</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #333; font-weight: bold;">---円</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #333; font-weight: bold;">---</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #666; font-weight: bold;">---</td>
            </tr>
          
              </table>

              <p style="color: #999; font-size: 12px; margin-top: 40px;">
                このメールはTrustfolioから自動送信されています。
              </p>
            </body>
          </html>
        "
    `);
  });

  it('エラー通知', () => {
    // 前提: Utilities.formatDate を固定値にモックし、タイムスタンプを安定させる
    const service = createEmailService();
    const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
    const formatMock = vi
      .spyOn(globalThis.Utilities, 'formatDate')
      .mockReturnValue('2026-06-06 21:30:00');
    const result = service.sendErrorNotification(
      '基準価額自動取得',
      '楽天証券からの取得に失敗しました。\nfundId=12345678',
      'notify@example.com'
    );
    expect(result.success).toBe(true);
    const call = sendEmailMock.mock.calls[0]?.[0];
    formatMock.mockRestore();
    sendEmailMock.mockRestore();
    expect(call?.htmlBody ?? '').toMatchInlineSnapshot(`
      "
              <html>
                <head>
                  <meta charset="utf-8">
                </head>
                <body style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 20px;">
                  <h1 style="color: #c62828;">Trustfolio エラー通知</h1>
                  <p style="color: #666;">発生日時: 2026-06-06 21:30:00</p>

                  <h2 style="color: #333; margin-top: 30px;">タスク</h2>
                  <p style="font-size: 16px; color: #333;">基準価額自動取得</p>

                  <h2 style="color: #333; margin-top: 30px;">エラー内容</h2>
                  <div style="background-color: #ffebee; border-left: 4px solid #c62828; padding: 16px; margin: 16px 0;">
                    <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: monospace; color: #333;">楽天証券からの取得に失敗しました。
      fundId=12345678</pre>
                  </div>

                  <p style="color: #999; font-size: 12px; margin-top: 40px;">
                    このメールはTrustfolioから自動送信されています。
                  </p>
                </body>
              </html>
            "
    `);
  });

  it('-5%ルールアラート（NASDAQトリガー・S&P500は参考表示）', () => {
    // 前提: NASDAQが-5%以上下落（トリガー）、S&P500は上昇（参考表示・正の符号と青色）
    // 検証: H5 #151 で集約した指数行生成4パスのうち、既存ケースと逆の組合せ
    //   （NASDAQ の triggered 行・S&P500 の reference 行）の出力バイト列を固定する
    const alertResult: MarketIndexAlertResult = {
      isAlertTriggered: true,
      sp500: {
        currentValue: 5_600.4,
        previousValue: 5_500.12,
        changeRate: 1.82,
        isTriggered: false,
      },
      nasdaq: {
        currentValue: 17_300.21,
        previousValue: 18_500.77,
        changeRate: -6.49,
        isTriggered: true,
      },
      alertDate: '2026-06-05',
      comparisonDate: '2026-05-29',
    };

    const service = createEmailService();
    const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
    const result = service.sendMarketIndexAlert(alertResult, 'investor@example.com');
    expect(result.success).toBe(true);
    const call = sendEmailMock.mock.calls[0]?.[0];
    sendEmailMock.mockRestore();
    expect(call?.htmlBody ?? '').toMatchInlineSnapshot(`
      "
          <html>
            <head>
              <meta charset="utf-8">
            </head>
            <body style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 20px;">
              <h1 style="color: #c62828;">⚠️ -5%ルールアラート</h1>
              <p style="color: #666;">比較期間: 2026-05-29 → 2026-06-05</p>

              <div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; font-size: 16px; color: #333;">
                  <strong>市場指数が前週比-5%以上下落しました。</strong><br>
                  追加投資を検討するタイミングかもしれません。
                </p>
              </div>

              <h2 style="color: #333; margin-top: 30px;">下落した指数</h2>
              <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-bottom: 20px;">
                <tr style="background-color: #f5f5f5;">
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">指数</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">前週終値</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">今週終値</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">変化率</th>
                </tr>
                
            <tr style="background-color: #ffebee;">
              <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">NASDAQ</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">18,500.77</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">17,300.21</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right; color: #c62828; font-weight: bold;">-6.49%</td>
            </tr>
          
              </table>

              
              <h2 style="color: #333; margin-top: 30px;">参考: その他の指数</h2>
              <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-bottom: 20px;">
                <tr style="background-color: #f5f5f5;">
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">指数</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">前週終値</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">今週終値</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">変化率</th>
                </tr>
                
            <tr>
              <td style="padding: 12px; border: 1px solid #ddd;">S&P500</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">5,500.12</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">5,600.40</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right; color: #1565c0;">+1.82%</td>
            </tr>
          
              </table>
              

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
              </p>
            </body>
          </html>
        "
    `);
  });

  it('-5%ルールアラート（S&P500トリガー・NASDAQは参考表示）', () => {
    // 前提: S&P500が-5%以上下落（トリガー）、NASDAQは下落だが閾値未満（参考表示）
    const alertResult: MarketIndexAlertResult = {
      isAlertTriggered: true,
      sp500: {
        currentValue: 5_200.55,
        previousValue: 5_500.12,
        changeRate: -5.45,
        isTriggered: true,
      },
      nasdaq: {
        currentValue: 18_100.33,
        previousValue: 18_500.77,
        changeRate: -2.16,
        isTriggered: false,
      },
      alertDate: '2026-06-05',
      comparisonDate: '2026-05-29',
    };

    const service = createEmailService();
    const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
    const result = service.sendMarketIndexAlert(alertResult, 'investor@example.com');
    expect(result.success).toBe(true);
    const call = sendEmailMock.mock.calls[0]?.[0];
    sendEmailMock.mockRestore();
    expect(call?.htmlBody ?? '').toMatchInlineSnapshot(`
      "
          <html>
            <head>
              <meta charset="utf-8">
            </head>
            <body style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 20px;">
              <h1 style="color: #c62828;">⚠️ -5%ルールアラート</h1>
              <p style="color: #666;">比較期間: 2026-05-29 → 2026-06-05</p>

              <div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; font-size: 16px; color: #333;">
                  <strong>市場指数が前週比-5%以上下落しました。</strong><br>
                  追加投資を検討するタイミングかもしれません。
                </p>
              </div>

              <h2 style="color: #333; margin-top: 30px;">下落した指数</h2>
              <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-bottom: 20px;">
                <tr style="background-color: #f5f5f5;">
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">指数</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">前週終値</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">今週終値</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">変化率</th>
                </tr>
                
            <tr style="background-color: #ffebee;">
              <td style="padding: 12px; border: 1px solid #ddd; font-weight: bold;">S&P500</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">5,500.12</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">5,200.55</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right; color: #c62828; font-weight: bold;">-5.45%</td>
            </tr>
          
              </table>

              
              <h2 style="color: #333; margin-top: 30px;">参考: その他の指数</h2>
              <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-bottom: 20px;">
                <tr style="background-color: #f5f5f5;">
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">指数</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">前週終値</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">今週終値</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: right;">変化率</th>
                </tr>
                
            <tr>
              <td style="padding: 12px; border: 1px solid #ddd;">NASDAQ</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">18,500.77</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right;">18,100.33</td>
              <td style="padding: 12px; border: 1px solid #ddd; text-align: right; color: #c62828;">-2.16%</td>
            </tr>
          
              </table>
              

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
              </p>
            </body>
          </html>
        "
    `);
  });
});
