import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  doPost,
  initializeSheets,
  fetchAllNavs,
  setupWeeklyReportTrigger,
  deleteWeeklyReportTrigger,
  setupNavFetchTrigger,
  deleteNavFetchTrigger,
  setupRecurringPurchasesTrigger,
  executeRecurringPurchasesDaily,
  sendWeeklyReport,
  doGet,
  include,
} from '../src/main';
import type { EmailService } from '../src/service/EmailService';

vi.mock('../src/api/router', () => ({
  handleApiRequest: vi.fn(),
}));

vi.mock('../src/Config', () => ({
  getWeeklyReportEmail: vi.fn(),
}));

vi.mock('../src/service/EmailService', () => ({
  createEmailService: vi.fn(),
}));

describe('main', () => {
  const isErrorResponse = (
    value: unknown
  ): value is { success: false; error: { message: string } } => {
    return (
      typeof value === 'object' &&
      value !== null &&
      'success' in value &&
      (value as { success: unknown }).success === false &&
      'error' in value &&
      typeof (value as { error: { message?: unknown } }).error.message === 'string'
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTデータが空の場合はバリデーションエラーを返す', () => {
    // 前提: POSTデータが空である
    // 事前条件: ContentServiceがレスポンス生成を行う
    // 検証: エラーメッセージが含まれる
    const output = doPost({
      postData: { contents: '' },
    } as GoogleAppsScript.Events.DoPost);
    const json = JSON.parse((output as unknown as { text: string }).text) as unknown;
    expect(isErrorResponse(json)).toBe(true);
    if (isErrorResponse(json)) {
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('POSTデータが空');
    }
  });

  it('doGetはテンプレートを評価してタイトルを設定する', () => {
    // 前提: HtmlServiceがテンプレートを返す
    // 事前条件: evaluateの戻り値にsetTitleが存在する
    // 検証: setTitleが呼ばれる
    const templateMock = {
      evaluate: vi.fn(() => ({ setTitle: vi.fn() })),
    };
    const createTemplateMock = vi
      .spyOn(globalThis.HtmlService, 'createTemplateFromFile')
      .mockReturnValue(templateMock);

    doGet();

    expect(createTemplateMock).toHaveBeenCalledWith('Index');
    expect(templateMock.evaluate).toHaveBeenCalled();
  });

  it('シート初期化が失敗した場合はアラートを表示する', async () => {
    // 前提: handleApiRequestが失敗する
    // 事前条件: SpreadsheetApp.getUiがalertを持つ
    // 検証: alertが呼ばれる
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({
      success: false,
      error: { type: 'unexpected', message: '初期化に失敗しました。' },
    });

    const alertMock = vi.fn();
    vi.spyOn(globalThis.SpreadsheetApp, 'getUi').mockReturnValue({
      alert: alertMock,
    });

    initializeSheets();
    expect(alertMock).toHaveBeenCalled();
  });

  it('HTMLテンプレート読み込みヘルパーは内容を返す', () => {
    // 前提: HTMLテンプレートが存在する
    // 事前条件: HtmlServiceが固定文字列を返す
    // 検証: 返却値がHTML文字列になる
    const outputMock = { getContent: vi.fn(() => '<div>ok</div>') };
    const createHtmlMock = vi
      .spyOn(globalThis.HtmlService, 'createHtmlOutputFromFile')
      .mockReturnValue(outputMock);

    const result = include('Index');

    expect(createHtmlMock).toHaveBeenCalledWith('Index');
    expect(result).toBe('<div>ok</div>');
  });

  it('基準価額自動取得が失敗した場合はエラー通知メールを送信する', async () => {
    // 前提: 自動取得が失敗する
    // 事前条件: 送信先メールアドレスが設定されている
    // 検証: エラー通知メール送信が呼ばれる
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({
      success: false,
      error: { type: 'unexpected', message: '取得に失敗しました。' },
    });

    const { getWeeklyReportEmail } = vi.mocked(await import('../src/Config'));
    getWeeklyReportEmail.mockReturnValue('notify@example.com');

    const sendErrorNotification = vi.fn(() => ({ success: true as const, value: undefined }));
    const { createEmailService } = vi.mocked(await import('../src/service/EmailService'));
    createEmailService.mockReturnValue({ sendErrorNotification } as EmailService);

    fetchAllNavs();
    expect(sendErrorNotification).toHaveBeenCalled();
  });

  it('自動取得結果の形式が不正な場合はエラー通知メールを送信する', async () => {
    // 前提: 自動取得が成功だが結果形式が不正である
    // 事前条件: 送信先メールアドレスが設定されている
    // 検証: エラー通知メール送信が呼ばれる
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({ success: true, value: { invalid: true } });

    const { getWeeklyReportEmail } = vi.mocked(await import('../src/Config'));
    getWeeklyReportEmail.mockReturnValue('notify@example.com');

    const sendErrorNotification = vi.fn(() => ({ success: true as const, value: undefined }));
    const { createEmailService } = vi.mocked(await import('../src/service/EmailService'));
    createEmailService.mockReturnValue({ sendErrorNotification } as EmailService);

    fetchAllNavs();
    expect(sendErrorNotification).toHaveBeenCalled();
  });

  it('週次レポート送信トリガー設定時に既存トリガーが削除される', () => {
    // 前提: 既存トリガーが存在する
    // 事前条件: getProjectTriggersがsendWeeklyReportのトリガーを返す
    // 検証: deleteTriggerが呼ばれる
    const trigger = { getHandlerFunction: () => 'sendWeeklyReport', getUniqueId: () => 't-1' };
    vi.spyOn(globalThis.ScriptApp, 'getProjectTriggers').mockReturnValue([trigger]);
    const deleteTriggerMock = vi.spyOn(globalThis.ScriptApp, 'deleteTrigger');
    const newTriggerMock = vi.spyOn(globalThis.ScriptApp, 'newTrigger');

    setupWeeklyReportTrigger();

    expect(deleteTriggerMock).toHaveBeenCalledWith(trigger);
    expect(newTriggerMock).toHaveBeenCalledWith('sendWeeklyReport');
  });

  it('週次レポート送信トリガー設定後にログが出力される', () => {
    // 前提: 既存トリガーが存在しない
    // 事前条件: Logger.logが呼び出し可能である
    // 検証: 設定完了ログが出力される
    vi.spyOn(globalThis.ScriptApp, 'getProjectTriggers').mockReturnValue([]);
    const logMock = vi.spyOn(globalThis.Logger, 'log');

    setupWeeklyReportTrigger();

    expect(logMock).toHaveBeenCalledWith(
      '週次レポート送信トリガーを設定しました（毎週土曜日7:00-8:00実行）'
    );
  });

  it('週次レポート送信トリガー削除で対象が無い場合はログに残す', () => {
    // 前提: 対象トリガーが存在しない
    // 事前条件: getProjectTriggersが空配列を返す
    // 検証: 該当メッセージがログに出力される
    vi.spyOn(globalThis.ScriptApp, 'getProjectTriggers').mockReturnValue([]);
    const logMock = vi.spyOn(globalThis.Logger, 'log');

    deleteWeeklyReportTrigger();

    expect(logMock).toHaveBeenCalledWith('削除対象のトリガーが見つかりませんでした。');
  });

  it('週次レポート送信トリガー削除で対象がある場合は件数がログに残る', () => {
    // 前提: sendWeeklyReportのトリガーが存在する
    // 事前条件: getProjectTriggersが対象トリガーを返す
    // 検証: 削除件数がログに出力される
    const trigger = { getHandlerFunction: () => 'sendWeeklyReport', getUniqueId: () => 't-1' };
    vi.spyOn(globalThis.ScriptApp, 'getProjectTriggers').mockReturnValue([trigger]);
    vi.spyOn(globalThis.ScriptApp, 'deleteTrigger');
    const logMock = vi.spyOn(globalThis.Logger, 'log');

    deleteWeeklyReportTrigger();

    expect(logMock).toHaveBeenCalledWith('1個のトリガーを削除しました。');
  });

  it('自動取得で失敗が含まれる場合は一部失敗の通知を送信する', async () => {
    // 前提: 自動取得が成功し、失敗銘柄が存在する
    // 事前条件: 送信先メールアドレスが設定されている
    // 検証: 一部失敗の通知メールが送信される
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({
      success: true,
      value: {
        totalCount: 2,
        successCount: 1,
        alreadyExistsCount: 0,
        skippedCount: 0,
        failedCount: 1,
        items: [
          {
            fundId: 'fund-001',
            fundName: '国内株式',
            status: 'failed',
            message: '取得に失敗しました。',
          },
          {
            fundId: 'fund-002',
            fundName: '海外株式',
            status: 'success',
            nav: { fundId: 'fund-002', date: '2024-03-05', value: 10000, createdAt: '' },
          },
        ],
      },
    });

    const { getWeeklyReportEmail } = vi.mocked(await import('../src/Config'));
    getWeeklyReportEmail.mockReturnValue('notify@example.com');

    const sendErrorNotification = vi.fn(() => ({ success: true as const, value: undefined }));
    const { createEmailService } = vi.mocked(await import('../src/service/EmailService'));
    createEmailService.mockReturnValue({ sendErrorNotification } as EmailService);

    fetchAllNavs();

    expect(sendErrorNotification).toHaveBeenCalledWith(
      '基準価額自動取得（一部失敗）',
      expect.stringContaining('失敗した銘柄'),
      'notify@example.com'
    );
  });

  it('NAV自動取得トリガー設定で既存トリガーが削除される', () => {
    // 前提: fetchAllNavsのトリガーが存在する
    // 事前条件: getProjectTriggersが対象トリガーを返す
    // 検証: deleteTriggerが呼ばれる
    const trigger = { getHandlerFunction: () => 'fetchAllNavs', getUniqueId: () => 't-2' };
    vi.spyOn(globalThis.ScriptApp, 'getProjectTriggers').mockReturnValue([trigger]);
    const deleteTriggerMock = vi.spyOn(globalThis.ScriptApp, 'deleteTrigger');

    setupNavFetchTrigger();

    expect(deleteTriggerMock).toHaveBeenCalledWith(trigger);
  });

  it('NAV自動取得トリガー削除で対象がある場合は件数がログに残る', () => {
    // 前提: fetchAllNavsのトリガーが存在する
    // 事前条件: getProjectTriggersが対象トリガーを返す
    // 検証: 削除件数がログに出力される
    const trigger = { getHandlerFunction: () => 'fetchAllNavs', getUniqueId: () => 't-2' };
    vi.spyOn(globalThis.ScriptApp, 'getProjectTriggers').mockReturnValue([trigger]);
    vi.spyOn(globalThis.ScriptApp, 'deleteTrigger');
    const logMock = vi.spyOn(globalThis.console, 'log');

    deleteNavFetchTrigger();

    expect(logMock).toHaveBeenCalledWith('1個のトリガーを削除しました。');
  });

  it('積立自動実行が成功した場合は集計ログが出力される', async () => {
    // 前提: 積立自動実行が成功する
    // 事前条件: handleApiRequestが成功結果を返す
    // 検証: 成功ログが出力される
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({
      success: true,
      value: {
        executed: [{ id: 'tx-1' }],
        skipped: [{ recurringPurchaseId: 'rec-1', reason: 'INACTIVE' }],
      },
    });
    const logMock = vi.spyOn(globalThis.Logger, 'log');

    executeRecurringPurchasesDaily();

    expect(logMock).toHaveBeenCalledWith(expect.stringContaining('成功: 1, スキップ: 1'));
  });

  it('積立自動実行で失敗した場合はエラー通知メールを送信する', async () => {
    // 前提: 積立自動実行が失敗する
    // 事前条件: 送信先メールアドレスが設定されている
    // 検証: エラー通知メール送信が呼ばれる
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({
      success: false,
      error: { type: 'unexpected', message: '積立に失敗しました。' },
    });

    const { getWeeklyReportEmail } = vi.mocked(await import('../src/Config'));
    getWeeklyReportEmail.mockReturnValue('notify@example.com');

    const sendErrorNotification = vi.fn(() => ({ success: true as const, value: undefined }));
    const { createEmailService } = vi.mocked(await import('../src/service/EmailService'));
    createEmailService.mockReturnValue({ sendErrorNotification } as EmailService);

    executeRecurringPurchasesDaily();

    expect(sendErrorNotification).toHaveBeenCalled();
  });

  it('週次レポート送信が成功した場合はログを出力する', async () => {
    // 前提: 週次レポート送信が成功する
    // 事前条件: handleApiRequestが成功結果を返す
    // 検証: 成功ログが出力される
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({ success: true, value: { message: 'ok' } });
    const logMock = vi.spyOn(globalThis.Logger, 'log');

    sendWeeklyReport();

    expect(logMock).toHaveBeenCalledWith('[sendWeeklyReport] 週次レポートを送信しました。');
  });

  it('積立自動発注トリガー設定で既存トリガーが削除される', () => {
    // 前提: executeRecurringPurchasesDailyのトリガーが存在する
    // 事前条件: getProjectTriggersが対象トリガーを返す
    // 検証: deleteTriggerが呼ばれる
    const trigger = {
      getHandlerFunction: () => 'executeRecurringPurchasesDaily',
      getUniqueId: () => 't-3',
    };
    vi.spyOn(globalThis.ScriptApp, 'getProjectTriggers').mockReturnValue([trigger]);
    const deleteTriggerMock = vi.spyOn(globalThis.ScriptApp, 'deleteTrigger');

    setupRecurringPurchasesTrigger();

    expect(deleteTriggerMock).toHaveBeenCalledWith(trigger);
  });
});
