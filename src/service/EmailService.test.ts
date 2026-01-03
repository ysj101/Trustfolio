import { describe, expect, it, vi } from 'vitest';
import { createEmailService } from './EmailService';
import type { WeeklyReport } from '../usecase/WeeklyReportUseCase';

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
        remainingInvestment: 10000,
        totalCurrentValue: 10000,
        totalUnrealizedGain: 0,
        totalUnrealizedGainRate: 0,
        totalGain: 0,
        totalGainRate: 0,
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
    // 事前条件: ポートフォリオに損益が存在する
    // 検証: MailApp.sendEmailが損益付き件名で呼ばれる
    const report: WeeklyReport = {
      portfolio: {
        totalInvestment: 10000,
        totalSaleAmount: 0,
        realizedGain: 0,
        remainingInvestment: 10000,
        totalCurrentValue: 12000,
        totalUnrealizedGain: 2000,
        totalUnrealizedGainRate: 0.2,
        totalGain: 2000,
        totalGainRate: 0.2,
        holdings: [
          {
            fundId: 'fund-001',
            fundName: '国内株式',
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
});
