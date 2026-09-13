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
  handleApiRequestJson,
} from '../src/main';
import type { EmailService } from '../src/service/EmailService';
import type { AppContainer } from '../src/usecase/appContainer';

vi.mock('../src/api/router', () => ({
  handleApiRequest: vi.fn(),
}));

// Config は getWeeklyReportEmail のみモックし、TRIGGER_SCHEDULES など他の実定義は
// 実体をそのまま使う。これによりトリガー設定関数がスケジュール定数を正しく参照できる。
vi.mock('../src/Config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/Config')>();
  return { ...actual, getWeeklyReportEmail: vi.fn() };
});

vi.mock('../src/service/EmailService', () => ({
  createEmailService: vi.fn(),
}));

// appContainer は checkAndSendMarketIndexAlert（sendWeeklyReport から呼ばれる）の委譲経路
// 検証のためにモックする。委譲経路を検証しないテストでは呼び出されないため影響しない。
vi.mock('../src/usecase/appContainer', () => ({
  createAppContainer: vi.fn(),
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

  it('handleApiRequestJsonは戻り値をJSON文字列で返し、nullプロパティを保持する', async () => {
    // 前提: routerのhandleApiRequestがnullプロパティを含む成功結果を返す。
    // 事前条件: なし（router はモック済みで、Spreadsheet 等の外部依存には触れない）
    // 検証: 戻り値が文字列であり、JSON.parse後もnullが保持され、同じリクエストが渡される。
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    const request = { action: 'listFunds' } as const;
    handleApiRequest.mockReturnValue({
      success: true,
      value: { funds: [{ id: 'fund-001', assetClass: null }] },
    });

    const result = handleApiRequestJson(request);

    expect(typeof result).toBe('string');
    expect(JSON.parse(result).value.funds[0].assetClass).toBeNull();
    expect(handleApiRequest).toHaveBeenCalledWith(request);
  });

  it('POSTデータが action を持たない場合はバリデーションエラーを返す', async () => {
    // 前提: JSON としては正しいが、action プロパティを持たないリクエストボディが届く
    // 事前条件: なし（router へ到達する前に doPost の形状検証で弾かれることを確認する）
    // 検証: 形式不正の validation エラーが返り、handleApiRequest は呼ばれない（H2 #148）
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));

    const output = doPost({
      postData: { contents: '{"foo": "bar"}' },
    } as GoogleAppsScript.Events.DoPost);
    const json = JSON.parse((output as unknown as { text: string }).text) as unknown;

    expect(isErrorResponse(json)).toBe(true);
    if (isErrorResponse(json)) {
      expect(json.error.message).toContain('リクエスト形式が不正です');
    }
    expect(handleApiRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['JSON の null', 'null'],
    ['JSON の配列', '["listFunds"]'],
    ['action が数値', '{"action": 123}'],
  ])('POSTデータが %s の場合はバリデーションエラーを返す', async (_label, contents) => {
    // 前提: JSON としては正しいが「action（文字列）を持つオブジェクト」でないボディが届く
    // 事前条件: なし
    // 検証: 形状検証で弾かれて validation エラーが返り、handleApiRequest は呼ばれない
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));

    const output = doPost({ postData: { contents } } as GoogleAppsScript.Events.DoPost);
    const json = JSON.parse((output as unknown as { text: string }).text) as unknown;

    expect(isErrorResponse(json)).toBe(true);
    expect(handleApiRequest).not.toHaveBeenCalled();
  });

  it('POSTデータが文字列 action を持つ場合は handleApiRequest へ渡される', async () => {
    // 前提: 「action（文字列）を持つオブジェクト」の正しい形状のボディが届く
    // 事前条件: handleApiRequest が成功結果を返す
    // 検証: パース結果がそのまま handleApiRequest へ渡り、そのレスポンスが JSON で返る（成功境界）
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({ success: true, value: { message: 'ok' } });

    const output = doPost({
      postData: { contents: '{"action": "listFunds"}' },
    } as GoogleAppsScript.Events.DoPost);
    const json = JSON.parse((output as unknown as { text: string }).text) as unknown;

    expect(handleApiRequest).toHaveBeenCalledWith({ action: 'listFunds' });
    expect(json).toEqual({ success: true, value: { message: 'ok' } });
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
        performanceFailures: [],
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

  it('実績記録に失敗した場合は実績記録失敗の通知を送信する', async () => {
    // 前提: NAV の取得・登録は全件成功だが、実績シートへの記録（全体・ファンド別）に失敗する。
    //   これは自動回復されないデータロストであり、取得失敗（failedCount）とは別件の通知を送る（#144）。
    // 事前条件: 送信先メールアドレスが設定されている。failedCount は 0（取得失敗は無い）。
    // 検証: 「基準価額自動取得（実績記録失敗）」の通知メールが、失敗した銘柄名・理由を含めて送信される。
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({
      success: true,
      value: {
        totalCount: 1,
        successCount: 1,
        alreadyExistsCount: 0,
        skippedCount: 0,
        failedCount: 0,
        items: [
          {
            fundId: 'fund-002',
            fundName: '海外株式',
            status: 'success',
            nav: { fundId: 'fund-002', date: '2024-03-05', value: 10000, createdAt: '' },
          },
        ],
        // NAV 登録は成功したが、ファンド別・全体の実績記録が失敗したケース。
        performanceFailures: [
          {
            scope: 'fund',
            fundId: 'fund-002',
            fundName: '海外株式',
            message: 'ファンド別実績シートの書き込みに失敗しました。',
          },
          {
            scope: 'global',
            fundId: null,
            fundName: null,
            message: '全体実績シートの書き込みに失敗しました。',
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

    // 実績記録失敗の通知が、ファンド別失敗（銘柄名）・全体失敗の内訳を含めて送信される。
    expect(sendErrorNotification).toHaveBeenCalledWith(
      '基準価額自動取得（実績記録失敗）',
      expect.stringContaining('海外株式'),
      'notify@example.com'
    );
    expect(sendErrorNotification).toHaveBeenCalledWith(
      '基準価額自動取得（実績記録失敗）',
      expect.stringContaining('全体実績'),
      'notify@example.com'
    );
    // 取得失敗（一部失敗）の通知は送られない（failedCount が 0 のため）。
    expect(sendErrorNotification).not.toHaveBeenCalledWith(
      '基準価額自動取得（一部失敗）',
      expect.anything(),
      expect.anything()
    );
  });

  it('取得失敗と実績記録失敗が同時に発生した場合は両方の通知を送信する', async () => {
    // 前提: 一部の銘柄は取得に失敗し（failedCount>0）、別途 実績記録にも失敗した（performanceFailures>0）。
    //   両者は原因も対処も異なるため、独立した2通の通知（一部失敗・実績記録失敗）を送る設計を固定する。
    // 事前条件: 送信先メールアドレスが設定されている。
    // 検証: 「一部失敗」通知と「実績記録失敗」通知の両方が送信される。
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
        performanceFailures: [
          {
            scope: 'fund',
            fundId: 'fund-002',
            fundName: '海外株式',
            message: 'ファンド別実績シートの書き込みに失敗しました。',
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

    // 取得失敗の通知（一部失敗）と、実績記録失敗の通知の両方が送信される。
    expect(sendErrorNotification).toHaveBeenCalledWith(
      '基準価額自動取得（一部失敗）',
      expect.stringContaining('失敗した銘柄'),
      'notify@example.com'
    );
    expect(sendErrorNotification).toHaveBeenCalledWith(
      '基準価額自動取得（実績記録失敗）',
      expect.stringContaining('海外株式'),
      'notify@example.com'
    );
  });

  it('実績記録失敗の内訳が不正な構造の場合は形式不正として通知する', async () => {
    // 前提: NavFetchResult の performanceFailures に、型不変条件を満たさない不正要素が含まれる。
    //   （scope='fund' なのに fundId/fundName が null 等）。型ガードはこれを fail fast で弾く。
    // 事前条件: 送信先メールアドレスが設定されている。
    // 検証: 実績記録失敗の通知ではなく「結果形式が不正」の通知が送信される（不正値の通知混入を防ぐ）。
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({
      success: true,
      value: {
        totalCount: 1,
        successCount: 1,
        alreadyExistsCount: 0,
        skippedCount: 0,
        failedCount: 0,
        items: [
          {
            fundId: 'fund-002',
            fundName: '海外株式',
            status: 'success',
            nav: { fundId: 'fund-002', date: '2024-03-05', value: 10000, createdAt: '' },
          },
        ],
        // scope='fund' だが fundId/fundName が null（不変条件違反）の不正要素。
        performanceFailures: [
          {
            scope: 'fund',
            fundId: null,
            fundName: null,
            message: 'ファンド別実績シートの書き込みに失敗しました。',
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

    // 型ガードが不正要素を弾き、形式不正の通知が送られる。
    expect(sendErrorNotification).toHaveBeenCalledWith(
      '基準価額自動取得',
      expect.stringContaining('結果の形式が不正'),
      'notify@example.com'
    );
    // 不正値を含む実績記録失敗の通知は送られない。
    expect(sendErrorNotification).not.toHaveBeenCalledWith(
      '基準価額自動取得（実績記録失敗）',
      expect.anything(),
      expect.anything()
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
    // GAS 公式の Logger.log へログ出力を統一したため、Logger.log を捕捉する
    const logMock = vi.spyOn(globalThis.Logger, 'log');

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
    // 事前条件: handleApiRequestが成功結果を返す、-5%ルール判定はスキップ（メールアドレス未設定）
    // 検証: 成功ログが出力される
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({ success: true, value: { message: 'ok' } });

    // -5%ルール判定をスキップするためにメールアドレスをnullに設定
    const { getWeeklyReportEmail } = vi.mocked(await import('../src/Config'));
    getWeeklyReportEmail.mockReturnValue(null);

    const logMock = vi.spyOn(globalThis.Logger, 'log');

    sendWeeklyReport();

    expect(logMock).toHaveBeenCalledWith('[sendWeeklyReport] 週次レポートを送信しました。');
  });

  it('週次レポート送信成功後、シート保証とアラート判定通知が順に委譲される', async () => {
    // 前提: 週次レポート送信が成功し、メールアドレスも設定されている
    // 事前条件: createAppContainer が成功し、ensureMarketIndexSheet・checkAndNotify とも成功する
    // 検証: ensureMarketIndexSheet → checkAndNotify が各1回この順で呼ばれ、
    //   宛先が checkAndNotify へ渡される（H2 #148 で薄くした委譲経路の固定）
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({ success: true, value: { message: 'ok' } });

    const { getWeeklyReportEmail } = vi.mocked(await import('../src/Config'));
    getWeeklyReportEmail.mockReturnValue('notify@example.com');

    const callOrder: string[] = [];
    const ensureMarketIndexSheet = vi.fn(() => {
      callOrder.push('ensureMarketIndexSheet');
      return { success: true as const, value: undefined };
    });
    const checkAndNotify = vi.fn(() => {
      callOrder.push('checkAndNotify');
      return { success: true as const, value: undefined };
    });
    const { createAppContainer } = vi.mocked(await import('../src/usecase/appContainer'));
    // 委譲経路の検証に必要な2ユースケースのみを持つ部分スタブ
    // （EmailService モックと同じ部分キャストの慣例に従う）
    createAppContainer.mockReturnValue({
      success: true,
      value: {
        sheetInitializationUseCase: { ensureMarketIndexSheet },
        marketIndexAlertUseCase: { checkAndNotify },
      } as unknown as AppContainer,
    });

    sendWeeklyReport();

    expect(callOrder).toEqual(['ensureMarketIndexSheet', 'checkAndNotify']);
    expect(checkAndNotify).toHaveBeenCalledWith('notify@example.com');
  });

  it('アラート判定の前段でコンテナ生成に失敗した場合は後続処理を呼ばない', async () => {
    // 前提: 週次レポート送信は成功するが、スプレッドシート接続（コンテナ生成）が失敗する
    // 事前条件: createAppContainer が失敗を返す
    // 検証: 失敗ログのみで正常終了し、後続（シート保証・判定通知）は実行されない
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({ success: true, value: { message: 'ok' } });

    const { getWeeklyReportEmail } = vi.mocked(await import('../src/Config'));
    getWeeklyReportEmail.mockReturnValue('notify@example.com');

    const { createAppContainer } = vi.mocked(await import('../src/usecase/appContainer'));
    createAppContainer.mockReturnValue({
      success: false,
      error: { type: 'unexpected', message: 'スプレッドシートを開けませんでした。' },
    });
    const logMock = vi.spyOn(globalThis.Logger, 'log');

    // 失敗してもトリガー実行自体は例外にならず正常終了する
    expect(() => {
      sendWeeklyReport();
    }).not.toThrow();
    // コンテナ生成失敗は logError 経由（[ERROR] プレフィックス付き）で記録される（#148）
    expect(logMock).toHaveBeenCalledWith(
      '[ERROR] [checkAndSendMarketIndexAlert] シートリポジトリの取得に失敗: スプレッドシートを開けませんでした。'
    );
  });

  it('アラート判定はメールアドレス未設定の場合 WARN でスキップし、コンテナを生成しない', async () => {
    // 前提: 週次レポート送信は成功するが、WEEKLY_REPORT_EMAIL が未設定である
    // 事前条件: getWeeklyReportEmail が null を返す
    // 検証: スキップが logWarn 経由（[WARN] プレフィックス付き）で記録され、
    //   コンテナ生成（後続処理）は実行されない（#148 の severity 統一の固定）
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({ success: true, value: { message: 'ok' } });

    const { getWeeklyReportEmail } = vi.mocked(await import('../src/Config'));
    getWeeklyReportEmail.mockReturnValue(null);

    const { createAppContainer } = vi.mocked(await import('../src/usecase/appContainer'));
    const logMock = vi.spyOn(globalThis.Logger, 'log');

    sendWeeklyReport();

    expect(logMock).toHaveBeenCalledWith(
      '[WARN] [checkAndSendMarketIndexAlert] WEEKLY_REPORT_EMAILが設定されていないためスキップします。'
    );
    expect(createAppContainer).not.toHaveBeenCalled();
  });

  it('アラート判定の前段でシート保証に失敗した場合は ERROR を記録し判定通知を呼ばない', async () => {
    // 前提: 週次レポート送信・コンテナ生成は成功するが、市場指数シートの保証が失敗する
    // 事前条件: ensureMarketIndexSheet が失敗を返す
    // 検証: 失敗が logError 経由（[ERROR] プレフィックス付き）で記録され、
    //   後続の checkAndNotify は実行されない（#148 の severity 統一の固定）
    const { handleApiRequest } = vi.mocked(await import('../src/api/router'));
    handleApiRequest.mockReturnValue({ success: true, value: { message: 'ok' } });

    const { getWeeklyReportEmail } = vi.mocked(await import('../src/Config'));
    getWeeklyReportEmail.mockReturnValue('notify@example.com');

    const checkAndNotify = vi.fn(() => ({ success: true as const, value: undefined }));
    const { createAppContainer } = vi.mocked(await import('../src/usecase/appContainer'));
    createAppContainer.mockReturnValue({
      success: true,
      value: {
        sheetInitializationUseCase: {
          ensureMarketIndexSheet: () => ({
            success: false as const,
            error: { type: 'unexpected' as const, message: 'シートの作成に失敗しました。' },
          }),
        },
        marketIndexAlertUseCase: { checkAndNotify },
      } as unknown as AppContainer,
    });
    const logMock = vi.spyOn(globalThis.Logger, 'log');

    sendWeeklyReport();

    expect(logMock).toHaveBeenCalledWith(
      '[ERROR] [checkAndSendMarketIndexAlert] 市場指数シートの確認に失敗: シートの作成に失敗しました。'
    );
    expect(checkAndNotify).not.toHaveBeenCalled();
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
