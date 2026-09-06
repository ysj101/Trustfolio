import { describe, expect, it, vi } from 'vitest';
import { createEmailService } from '../../src/service/EmailService';
import type { WeeklyReport } from '../../src/usecase/WeeklyReportUseCase';

/** 指定見出しから次の見出しまでのHTMLを切り出し、表の値を局所的に検証する。 */
function extractSection(html: string, heading: string): string {
  const start = html.indexOf(`<h2 style="color: #333; margin-top: 30px;">${heading}</h2>`);
  if (start < 0) return '';
  const end = html.indexOf('<h2 ', start + 1);
  return html.slice(start, end < 0 ? html.length : end);
}

describe('EmailService', () => {
  it('送信先が空の場合はバリデーションエラーになる', () => {
    // 前提: 送信先メールアドレスが空である
    // 事前条件: 週次レポートは最低限の構成でよい
    // 検証: recipientフィールドのエラーが返る
    const report: WeeklyReport = {
      portfolio: {
        totalInvestment: 10000,
        totalSaleAmount: 0,
        realizedGain: 0,
        totalTax: 0,
        realizedGainAfterTax: 0,
        taxUnrecordedSaleCount: 0,
        remainingInvestment: 10000,
        totalCurrentValue: 10000,
        totalUnrealizedGain: 0,
        totalUnrealizedGainRate: 0,
        totalGain: 0,
        totalGainRate: 0,
        remainingInvestmentChange: null,
        totalCurrentValueChange: null,
        totalUnrealizedGainChange: null,
        totalUnrealizedGainRateChange: null,
        hasPreviousWeekData: false,
        assetClassSummaries: [],
        holdings: [],
      },
      generatedAt: '2024-04-01 09:00:00',
    };
    const service = createEmailService();
    const result = service.sendWeeklyReport(report, '');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('recipient');
    }
  });

  it('週次レポートメールの件名に損益が含まれる', () => {
    // 前提: 送信先メールアドレスが有効である
    // 事前条件: ポートフォリオに損益が存在し、前週比データもある
    // 検証: MailApp.sendEmailが損益付き件名で呼ばれ、資産クラス別見出し・区分行・資産クラス列・前週比情報が本文に含まれる
    const report: WeeklyReport = {
      portfolio: {
        totalInvestment: 10000,
        totalSaleAmount: 0,
        realizedGain: 0,
        totalTax: 0,
        realizedGainAfterTax: 0,
        taxUnrecordedSaleCount: 0,
        remainingInvestment: 10000,
        totalCurrentValue: 12000,
        totalUnrealizedGain: 2000,
        totalUnrealizedGainRate: 0.2,
        totalGain: 2000,
        totalGainRate: 0.2,
        remainingInvestmentChange: { difference: 1000, changeRate: 11.11 },
        totalCurrentValueChange: { difference: 1500, changeRate: 14.29 },
        totalUnrealizedGainChange: 500,
        totalUnrealizedGainRateChange: 5.56,
        hasPreviousWeekData: true,
        assetClassSummaries: [
          {
            assetClass: 'equity',
            totalInvestment: 10000,
            totalSaleAmount: 0,
            realizedGain: 0,
            totalTax: 0,
            realizedGainAfterTax: 0,
            taxUnrecordedSaleCount: 0,
            remainingInvestment: 10000,
            totalCurrentValue: 12000,
            totalUnrealizedGain: 2000,
            totalUnrealizedGainRate: 0.2,
            totalGain: 2000,
            totalGainRate: 0.2,
            holdingCount: 1,
            allocationRate: 1,
          },
        ],
        holdings: [
          {
            fundId: 'fund-001',
            fundName: '国内株式',
            assetClass: 'equity',
            totalUnits: 10000,
            averageCost: 10000,
            totalInvestment: 10000,
            totalSaleAmount: 0,
            remainingInvestment: 10000,
            currentNavValue: 12000,
            currentNavDate: '2024-04-01',
            currentValue: 12000,
            unrealizedGain: 2000,
            unrealizedGainRate: 0.2,
            remainingInvestmentChange: { difference: 1000, changeRate: 11.11 },
            currentValueChange: { difference: 1500, changeRate: 14.29 },
            unrealizedGainChange: 500,
            // ポートフォリオ全体側（totalUnrealizedGainRateChange: 5.56）と別の値にして、
            // 保有銘柄一覧の「前週比（損益率）」列が銘柄側の値を参照していることを検証可能にする
            unrealizedGainRateChange: 3.21,
            hasPreviousWeekData: true,
          },
        ],
      },
      generatedAt: '2024-04-01 09:00:00',
    };

    const service = createEmailService();
    const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
    const result = service.sendWeeklyReport(report, 'test@example.com');
    expect(result.success).toBe(true);
    expect(sendEmailMock).toHaveBeenCalled();
    const call = sendEmailMock.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (call) {
      expect(call.subject).toContain('+2,000円');
      expect(call.htmlBody).toContain('国内株式');
      // 資産クラス別表の見出しが出力されることを検証する。
      const assetClassSection = extractSection(call.htmlBody, '資産クラス別');
      expect(assetClassSection).toContain('資産クラス別');
      // 資産クラス別表の株式ラベル行を検証する。
      expect(assetClassSection).toContain(
        '<td style="padding: 8px; border: 1px solid #ddd;">株式</td>'
      );
      // 資産クラス別表の残存投資額セルを検証する。
      expect(assetClassSection).toContain(
        '<td style="padding: 8px; border: 1px solid #ddd; text-align: right;">10,000円</td>'
      );
      // 株式行の残存投資額、評価額、未実現損益、未実現損益率、評価額構成比を検証する。
      expect(assetClassSection).toContain(
        '<td style="padding: 8px; border: 1px solid #ddd; text-align: right;">12,000円</td>'
      );
      expect(assetClassSection).toContain(
        '<td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #1565c0; font-weight: bold;">2,000円</td>'
      );
      expect(assetClassSection).toContain(
        '<td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #1565c0; font-weight: bold;">+20.0%</td>'
      );
      expect(assetClassSection).toContain(
        '<td style="padding: 8px; border: 1px solid #ddd; text-align: right;">100.0%</td>'
      );
      // 保有銘柄一覧の資産クラス列見出しを検証する。
      expect(call.htmlBody).toContain(
        '<th style="padding: 12px; border: 1px solid #ddd; text-align: left;">資産クラス</th>'
      );
      // 保有銘柄一覧では銘柄名セルの直後に資産クラスセルが出力されることを検証する。
      // 銘柄名セルの直後に資産クラスセルが続くことを、保有一覧部分で検証する。
      const holdingsSection = extractSection(call.htmlBody, '保有銘柄一覧');
      expect(holdingsSection).toMatch(
        /<td style="[^"]*">国内株式<\/td>\s*<td style="[^"]*">株式<\/td>/
      );
      // 前週比情報が含まれることを確認
      expect(call.htmlBody).toContain('前週比');
      expect(call.htmlBody).toContain('+1,000円');
      expect(call.htmlBody).toContain('+500円');
      // 保有銘柄一覧の「前週比（損益率）」列（#185）を確認する。
      // 「+3.2%pt」は銘柄側の unrealizedGainRateChange: 3.21 のみから生成される値であり、
      // ポートフォリオ全体側（+5.6%pt）と区別して列の存在と参照データを検証できる
      expect(call.htmlBody).toContain('前週比（損益率）');
      expect(call.htmlBody).toContain('+3.2%pt');
    }
  });

  it('週次レポートメールの本文に売却税額と税引後実現損益が含まれる', () => {
    // 前提: 送信先メールアドレスが有効である
    // 事前条件: ポートフォリオに記録済みの売却税額（2,033円）と税引後実現損益（2,967円）が存在する
    // 検証: MailApp.sendEmailの本文に「売却税額（記録分）」「税引後実現損益」の行と金額が含まれる
    const report: WeeklyReport = {
      portfolio: {
        totalInvestment: 100000,
        totalSaleAmount: 50000,
        realizedGain: 5000,
        totalTax: 2033,
        realizedGainAfterTax: 2967,
        taxUnrecordedSaleCount: 0,
        remainingInvestment: 50000,
        totalCurrentValue: 60000,
        totalUnrealizedGain: 10000,
        totalUnrealizedGainRate: 0.2,
        totalGain: 15000,
        totalGainRate: 0.15,
        remainingInvestmentChange: null,
        totalCurrentValueChange: null,
        totalUnrealizedGainChange: null,
        totalUnrealizedGainRateChange: null,
        hasPreviousWeekData: false,
        assetClassSummaries: [],
        holdings: [],
      },
      generatedAt: '2024-04-01 09:00:00',
    };

    const service = createEmailService();
    const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
    // 直前のテストで記録された呼び出しが mock.calls[0] に残らないよう、履歴をクリアしてから送信する
    sendEmailMock.mockClear();
    const result = service.sendWeeklyReport(report, 'test@example.com');
    expect(result.success).toBe(true);
    const call = sendEmailMock.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (call) {
      // 「2,033」は totalTax、「2,967」は realizedGainAfterTax のみから生成される値であり、
      // 新規追加した2行がそれぞれ対応するフィールドを参照していることを検証できる
      expect(call.htmlBody).toContain('売却税額（記録分）');
      expect(call.htmlBody).toContain('2,033円');
      expect(call.htmlBody).toContain('税引後実現損益');
      expect(call.htmlBody).toContain('2,967円');
      // 「15,000」「+15.0%」は totalGain: 15000 / totalGainRate: 0.15 のみから生成される値であり、
      // 総損益行が未実現損益（10,000円）ではなく税引後ベースの totalGain を参照することを検証できる
      expect(call.htmlBody).toContain('総損益（税引後実現＋未実現）');
      expect(call.htmlBody).toContain('15,000円');
      expect(call.htmlBody).toContain('総損益率');
      expect(call.htmlBody).toContain('+15.0%');
      // 税未記録の売却が0件のため、参考値の注記は表示されない
      expect(call.htmlBody).not.toContain('参考値');
      // 資産クラス別サマリーが空配列の場合、資産クラス別表の見出しを表示しないことを検証する。
      expect(call.htmlBody).not.toContain('資産クラス別');
    }
  });

  it('税未記録の売却がある場合は税引後実現損益に参考値の注記が付く', () => {
    // 前提: 送信先メールアドレスが有効である
    // 事前条件: 税額未記録の売却が2件存在する（taxUnrecordedSaleCount: 2）
    // 検証: 税引後実現損益の行に「※税未記録の売却が2件あるため参考値」の注記が含まれる
    const report: WeeklyReport = {
      portfolio: {
        totalInvestment: 100000,
        totalSaleAmount: 50000,
        realizedGain: 5000,
        totalTax: 1000,
        realizedGainAfterTax: 4000,
        taxUnrecordedSaleCount: 2,
        remainingInvestment: 50000,
        totalCurrentValue: 60000,
        totalUnrealizedGain: 10000,
        totalUnrealizedGainRate: 0.2,
        totalGain: 15000,
        totalGainRate: 0.15,
        remainingInvestmentChange: null,
        totalCurrentValueChange: null,
        totalUnrealizedGainChange: null,
        totalUnrealizedGainRateChange: null,
        hasPreviousWeekData: false,
        assetClassSummaries: [
          {
            assetClass: null,
            totalInvestment: 110000,
            totalSaleAmount: 0,
            realizedGain: 0,
            totalTax: 0,
            realizedGainAfterTax: 0,
            taxUnrecordedSaleCount: 0,
            remainingInvestment: 110000,
            totalCurrentValue: 120000,
            totalUnrealizedGain: 10000,
            totalUnrealizedGainRate: 0.0909,
            totalGain: 10000,
            totalGainRate: 0.0909,
            holdingCount: 1,
            allocationRate: 1,
          },
        ],
        holdings: [
          {
            fundId: 'fund-002',
            fundName: 'たわらノーロード先進国株式',
            assetClass: null,
            totalUnits: 100000,
            averageCost: 110000,
            totalInvestment: 110000,
            totalSaleAmount: 0,
            remainingInvestment: 110000,
            currentNavValue: 12000,
            currentNavDate: '2024-03-29',
            currentValue: 120000,
            unrealizedGain: 10000,
            unrealizedGainRate: 0.0909,
            remainingInvestmentChange: null,
            currentValueChange: null,
            unrealizedGainChange: null,
            unrealizedGainRateChange: null,
            hasPreviousWeekData: false,
          },
        ],
      },
      generatedAt: '2024-04-01 09:00:00',
    };

    const service = createEmailService();
    const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
    // 直前のテストで記録された呼び出しが mock.calls[0] に残らないよう、履歴をクリアしてから送信する
    sendEmailMock.mockClear();
    const result = service.sendWeeklyReport(report, 'test@example.com');
    expect(result.success).toBe(true);
    const call = sendEmailMock.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (call) {
      // 資産クラス別表の未設定ラベルと、保有一覧とは異なる残存投資額を検証する。
      const assetClassSection = extractSection(call.htmlBody, '資産クラス別');
      expect(assetClassSection).toContain(
        '<td style="padding: 8px; border: 1px solid #ddd;">未設定</td>'
      );
      expect(assetClassSection).toContain('110,000円');
      expect(call.htmlBody).toContain('※税未記録の売却が2件あるため参考値');
    }
  });

  it('エラー通知でタスク名が空の場合はバリデーションエラーになる', () => {
    // 前提: タスク名が空文字列である
    // 事前条件: 送信先メールアドレスは有効である
    // 検証: taskNameフィールドのエラーが返る
    const service = createEmailService();
    const result = service.sendErrorNotification('', 'テストエラー', 'notify@example.com');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('taskName');
    }
  });

  it('エラー通知メールを送信できる', () => {
    // 前提: タスク名と送信先が有効である
    // 事前条件: Utilities.formatDateが固定値を返す
    // 検証: MailApp.sendEmailが呼ばれる
    const service = createEmailService();
    const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
    const formatMock = vi
      .spyOn(globalThis.Utilities, 'formatDate')
      .mockReturnValue('2024-04-01 10:00:00');
    const result = service.sendErrorNotification(
      '基準価額自動取得',
      '取得に失敗しました。',
      'notify@example.com'
    );
    expect(result.success).toBe(true);
    expect(sendEmailMock).toHaveBeenCalled();
    formatMock.mockRestore();
  });

  describe('件名・送信ログの完全一致（H5 #151 の送信定型集約の回帰防止）', () => {
    /** 週次レポートの最小構成（損益 +2,000円）。 */
    function createMinimalReport(): WeeklyReport {
      return {
        portfolio: {
          totalInvestment: 10000,
          totalSaleAmount: 0,
          realizedGain: 0,
          totalTax: 0,
          realizedGainAfterTax: 0,
          taxUnrecordedSaleCount: 0,
          remainingInvestment: 10000,
          totalCurrentValue: 12000,
          totalUnrealizedGain: 2000,
          totalUnrealizedGainRate: 0.2,
          totalGain: 2000,
          totalGainRate: 0.2,
          remainingInvestmentChange: null,
          totalCurrentValueChange: null,
          totalUnrealizedGainChange: null,
          totalUnrealizedGainRateChange: null,
          hasPreviousWeekData: false,
          assetClassSummaries: [],
          holdings: [],
        },
        generatedAt: '2024-04-01 09:00:00',
      };
    }

    it('週次レポートの件名と送信ログが完全一致で固定される', () => {
      // 前提: 損益 +2,000円 のレポートを有効な宛先へ送信する
      // 事前条件: MailApp.sendEmail / Logger.log を spy で捕捉する
      // 検証: sendHtmlEmail へ集約した後も、件名（日付＋損益）とログ文言が
      //   集約前と1文字も変わらないことを完全一致で固定する
      const service = createEmailService();
      const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
      const logSpy = vi.spyOn(globalThis.Logger, 'log');
      // MailApp.sendEmail / Logger.log はテスト間で共有されるグローバルモックのため、
      // calls[0] が本テストの呼び出しを指すよう開始時にクリアする
      sendEmailMock.mockClear();
      logSpy.mockClear();

      const result = service.sendWeeklyReport(createMinimalReport(), 'investor@example.com');

      expect(result.success).toBe(true);
      expect(sendEmailMock.mock.calls[0]?.[0]?.subject).toBe(
        '【Trustfolio】週次投資実績レポート（2024-04-01） +2,000円'
      );
      expect(logSpy).toHaveBeenCalledWith('週次レポートメールを送信しました: investor@example.com');
    });

    it('エラー通知の件名と送信ログが完全一致で固定される', () => {
      // 前提: タスク名「基準価額自動取得」のエラー通知を有効な宛先へ送信する
      // 事前条件: Utilities.formatDate は固定値を返す
      // 検証: 件名（タスク名付き）とログ文言（宛先・タスク名付き）が完全一致で固定される
      const service = createEmailService();
      const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
      const logSpy = vi.spyOn(globalThis.Logger, 'log');
      const formatMock = vi
        .spyOn(globalThis.Utilities, 'formatDate')
        .mockReturnValue('2024-04-01 10:00:00');
      // グローバルモック共有のため、calls[0] が本テストの呼び出しを指すようクリアする
      sendEmailMock.mockClear();
      logSpy.mockClear();

      const result = service.sendErrorNotification(
        '基準価額自動取得',
        '取得に失敗しました。',
        'notify@example.com'
      );

      expect(result.success).toBe(true);
      expect(sendEmailMock.mock.calls[0]?.[0]?.subject).toBe(
        '【Trustfolio】エラー通知: 基準価額自動取得'
      );
      expect(logSpy).toHaveBeenCalledWith(
        'エラー通知メールを送信しました: notify@example.com (タスク: 基準価額自動取得)'
      );
      formatMock.mockRestore();
    });

    it('-5%ルールアラートの件名と送信ログが完全一致で固定される', () => {
      // 前提: S&P500 のみ発火（-5.45%）したアラートを有効な宛先へ送信する
      // 事前条件: MailApp.sendEmail / Logger.log を spy で捕捉する
      // 検証: 件名（発火指数と下落率付き）とログ文言が完全一致で固定される
      const service = createEmailService();
      const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
      const logSpy = vi.spyOn(globalThis.Logger, 'log');
      // MailApp.sendEmail / Logger.log はテスト間で共有されるグローバルモックのため、
      // calls[0] が本テストの呼び出しを指すよう開始時にクリアする
      sendEmailMock.mockClear();
      logSpy.mockClear();

      const result = service.sendMarketIndexAlert(
        {
          isAlertTriggered: true,
          sp500: {
            currentValue: 5200.55,
            previousValue: 5500.12,
            changeRate: -5.45,
            isTriggered: true,
          },
          nasdaq: {
            currentValue: 18100.33,
            previousValue: 18500.77,
            changeRate: -2.16,
            isTriggered: false,
          },
          alertDate: '2026-06-05',
          comparisonDate: '2026-05-29',
        },
        'investor@example.com'
      );

      expect(result.success).toBe(true);
      expect(sendEmailMock.mock.calls[0]?.[0]?.subject).toBe(
        '【Trustfolio】-5%ルールアラート: S&P500 -5.5%'
      );
      expect(logSpy).toHaveBeenCalledWith(
        '-5%ルールアラートメールを送信しました: investor@example.com'
      );
    });

    it('検証エラー時（宛先なし・アラート非発火）はメール送信もログ出力も行わない', () => {
      // 前提: 宛先が空の週次レポート送信と、アラート非発火の指数アラート送信を試みる
      // 事前条件: MailApp.sendEmail を spy で捕捉する
      // 検証: いずれも検証段階で失敗し、sendHtmlEmail（送信＋ログ）には到達しない
      const service = createEmailService();
      const sendEmailMock = vi.spyOn(globalThis.MailApp, 'sendEmail');
      sendEmailMock.mockClear();

      const weeklyResult = service.sendWeeklyReport(createMinimalReport(), '');
      const alertResult = service.sendMarketIndexAlert(
        {
          isAlertTriggered: false,
          sp500: null,
          nasdaq: null,
          alertDate: '2026-06-05',
          comparisonDate: '2026-05-29',
        },
        'investor@example.com'
      );

      expect(weeklyResult.success).toBe(false);
      expect(alertResult.success).toBe(false);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  });
});
