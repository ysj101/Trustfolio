import type { ApiRequest } from './api/router';
import { handleApiRequest } from './api/router';
export { handleApiRequest } from './api/router';
export { runRakutenIntegrationTest } from './integration/RakutenIntegrationTest';
export type { NavFetchResult, PerformanceRecordFailure } from './usecase/NavFetchUseCase';
import type { AppError, Result } from './domain/types';
import { propagateFailure } from './domain/result';
import type {
  NavFetchResult,
  NavFetchResultItem,
  PerformanceRecordFailure,
} from './usecase/NavFetchUseCase';
import type { ExecuteRecurringResult } from './usecase/RecurringUseCase';
import {
  getWeeklyReportEmail,
  SHEET_HEADERS,
  SHEET_NAMES,
  TRIGGER_SCHEDULES,
  type SheetDefinition,
  type TriggerSchedule,
} from './Config';
import { createEmailService } from './service/EmailService';
import { createMarketIndexRepository } from './repository/MarketIndexRepository';
import { openSheetRepository } from './repository/SheetRepository';
import { createMarketIndexAlertUseCase } from './usecase/MarketIndexAlertUseCase';
import { logError } from './utils/logger';

/**
 * Webアプリのエントリーポイント（GET）。
 * TrustfolioのUIテンプレートを返却する。
 */
export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  const template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate().setTitle('Trustfolio');
}

/**
 * Webアプリのエントリーポイント（POST）。
 * 受信したJSONリクエストに応じて処理を実行する。
 */
export function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  const contents = e.postData.contents;
  if (contents.length === 0) {
    return createJsonResponse({
      success: false,
      error: {
        type: 'validation',
        message: 'POSTデータが空です。JSONリクエストを送信してください。',
      },
    });
  }

  const request = JSON.parse(contents) as ApiRequest;
  const response = handleApiRequest(request);
  return createJsonResponse(response);
}

/**
 * スプレッドシート起動時のメニューを設定する。
 */
export function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Trustfolio').addItem('シート初期化', 'initializeSheets').addToUi();
}

/**
 * 必要なシートを作成し、ヘッダー整合性を検証する。
 */
export function initializeSheets(): void {
  const response = handleApiRequest({ action: 'initializeSheets' });
  if (!response.success) {
    SpreadsheetApp.getUi().alert(response.error.message);
  }
}

/**
 * HTMLテンプレートからファイルを読み込むためのヘルパー。
 */
export function include(filename: string): string {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function createJsonResponse(response: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * エラー通知メールを送信するヘルパー関数。
 * スクリプトプロパティからメールアドレスを取得して送信する。
 *
 * @param taskName - タスク名
 * @param errorMessage - エラーメッセージ
 */
function sendErrorNotificationEmail(taskName: string, errorMessage: string): void {
  const recipient = getWeeklyReportEmail();
  if (recipient === null) {
    Logger.log('エラー通知メールの送信先が設定されていません（WEEKLY_REPORT_EMAIL）');
    return;
  }

  const emailService = createEmailService();
  const result = emailService.sendErrorNotification(taskName, errorMessage, recipient);

  if (!result.success) {
    Logger.log(`エラー通知メールの送信に失敗しました: ${result.error.message}`);
  }
}

/**
 * Result のエラー情報を、エラー通知メール本文用の共通フォーマットへ整形する。
 * 「エラー: {メッセージ}」「タイプ: {種別}」の2行を生成する。
 *
 * 各タスクのエラー通知で繰り返し記述していた本文末尾の定型部分を共通化したもの。
 * 生成される文字列は従来の inline 記述と完全に一致する（メール本文を変えない）。
 *
 * @param error - Result の失敗時のエラー情報
 * @returns エラー通知メール本文用の整形済み文字列
 */
function formatErrorDetail(error: AppError): string {
  return `エラー: ${error.message}\nタイプ: ${error.type}`;
}

/**
 * 全銘柄の基準価額を自動取得する。
 * Google Apps Scriptのトリガーから呼び出すための関数。
 * 毎日21:00〜22:00頃に実行することを推奨（投資信託協会の基準価額公開後）。
 */
export function fetchAllNavs(): void {
  const response = handleApiRequest({ action: 'fetchAllNavs' });
  if (!response.success) {
    logError(`基準価額の自動取得に失敗しました: ${response.error.message}`);
    // エラー通知メールを送信
    sendErrorNotificationEmail(
      '基準価額自動取得',
      `基準価額の自動取得に失敗しました。\n\n${formatErrorDetail(response.error)}`
    );
    return;
  }

  const result = response.value;
  if (!isNavFetchResult(result)) {
    logError('基準価額の自動取得結果の形式が不正です');
    // エラー通知メールを送信
    sendErrorNotificationEmail(
      '基準価額自動取得',
      '基準価額の自動取得結果の形式が不正です。\n\nレスポンス形式が期待通りではありません。'
    );
    return;
  }

  Logger.log(
    `基準価額の自動取得が完了しました。` +
      `総数: ${String(result.totalCount)}, ` +
      `成功: ${String(result.successCount)}, ` +
      `既存: ${String(result.alreadyExistsCount)}, ` +
      `スキップ: ${String(result.skippedCount)}, ` +
      `失敗: ${String(result.failedCount)}`
  );

  logNavFetchFailures(result.items);

  // 失敗があった場合はメール通知
  if (result.failedCount > 0) {
    const failedItems = result.items.filter((item) => item.status === 'failed');
    const errorDetails = failedItems
      .map((item) => `- ${item.fundName} (${item.fundId}): ${item.message ?? '不明なエラー'}`)
      .join('\n');
    sendErrorNotificationEmail(
      '基準価額自動取得（一部失敗）',
      `基準価額の自動取得で一部の銘柄が失敗しました。\n\n` +
        `総数: ${String(result.totalCount)}\n` +
        `成功: ${String(result.successCount)}\n` +
        `失敗: ${String(result.failedCount)}\n\n` +
        `失敗した銘柄:\n${errorDetails}`
    );
  }

  // 実績記録に失敗した場合はメール通知（#144）。
  // これは「NAV の取得・登録は成功したが実績シートへの永続化に失敗」したケースであり、
  // 同一日付の再実行では自動回復されない静かなデータロストである。取得失敗（上記の failedCount）
  // とは原因も対処も異なるため、別件の通知として運用者へ手動復旧を促す。
  if (result.performanceFailures.length > 0) {
    const failureDetails = result.performanceFailures
      .map((failure) =>
        // scope で銘柄情報の有無が型上保証される（global は銘柄なし、fund は fundId/fundName が非 null）。
        failure.scope === 'global'
          ? `- 全体実績: ${failure.message}`
          : `- ${failure.fundName} (${failure.fundId}): ${failure.message}`
      )
      .join('\n');
    sendErrorNotificationEmail(
      '基準価額自動取得（実績記録失敗）',
      `基準価額の取得・登録に成功した銘柄のうち、実績シートへの記録に失敗したものがあります。\n` +
        `該当日付の実績は自動的には再記録されないため、手動での復旧が必要です。\n\n` +
        `失敗した実績記録:\n${failureDetails}`
    );
  }
}

/**
 * 積立設定に基づく自動発注を毎日実行する。
 * 約定日をJSTで生成し、結果の成功/スキップ/失敗をログに記録する。
 */
export function executeRecurringPurchasesDaily(): Result<ExecuteRecurringResult> {
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  Logger.log(`[executeRecurringPurchasesDaily] 約定日: ${today}`);

  const response = handleApiRequest({
    action: 'executeRecurringPurchases',
    targetDate: today,
  });

  if (!response.success) {
    Logger.log(
      `[executeRecurringPurchasesDaily] 失敗: ${response.error.message} (${response.error.type})`
    );
    // エラー通知メールを送信
    sendErrorNotificationEmail(
      '積立自動実行',
      `積立の自動実行に失敗しました。\n\n約定日: ${today}\n${formatErrorDetail(response.error)}`
    );
    return propagateFailure(response);
  }

  if (!isExecuteRecurringResult(response.value)) {
    Logger.log('[executeRecurringPurchasesDaily] 失敗: 実行結果の形式が不正です。');
    // エラー通知メールを送信
    sendErrorNotificationEmail(
      '積立自動実行',
      `積立の自動実行結果の形式が不正です。\n\n約定日: ${today}\n\nレスポンス形式が期待通りではありません。`
    );
    return {
      success: false,
      error: {
        type: 'unexpected',
        message: '実行結果の形式が不正です。',
      },
    };
  }

  const executedCount = response.value.executed.length;
  const skippedCount = response.value.skipped.length;
  const skippedSummary = summarizeSkippedReasons(response.value.skipped);

  Logger.log(
    `[executeRecurringPurchasesDaily] 成功: ${String(executedCount)}, ` +
      `スキップ: ${String(skippedCount)}, 内訳: ${JSON.stringify(skippedSummary)}`
  );

  return { success: true, value: response.value };
}

/**
 * NAV自動取得で失敗した銘柄の詳細をログ出力する。
 * 失敗理由を即時に把握できるようにするための補助関数。
 */
function logNavFetchFailures(items: NavFetchResultItem[]): void {
  const failedItems = items.filter((item) => item.status === 'failed');
  if (failedItems.length === 0) {
    return;
  }

  for (const item of failedItems) {
    logError(
      `基準価額取得に失敗しました: fundId=${item.fundId}, fundName=${item.fundName}, reason=${
        item.message ?? '不明なエラー'
      }`
    );
  }
}

// ============================================
// 時間駆動トリガーの管理（設定/削除の共通基盤）
// ============================================

/**
 * 時間駆動トリガーの設定情報。
 * 「どのハンドラ関数を」「どのスケジュールで」起動するか、および設定完了時のログ文言を束ねる。
 */
type TriggerConfig = {
  /** GAS がトリガーから名前で呼び出すハンドラ関数名。 */
  readonly handlerFunctionName: string;
  /** 実行スケジュール（Config の TRIGGER_SCHEDULES に集約）。 */
  readonly schedule: TriggerSchedule;
  /** トリガー設定完了時に出力するログ文言。 */
  readonly setupLogMessage: string;
};

/** 基準価額の自動取得トリガー設定。 */
const NAV_FETCH_TRIGGER: TriggerConfig = {
  handlerFunctionName: 'fetchAllNavs',
  schedule: TRIGGER_SCHEDULES.navFetch,
  setupLogMessage: 'NAV自動取得トリガーを設定しました（毎日21:00-22:00実行）',
};

/** 積立自動発注トリガー設定。 */
const RECURRING_PURCHASES_TRIGGER: TriggerConfig = {
  handlerFunctionName: 'executeRecurringPurchasesDaily',
  schedule: TRIGGER_SCHEDULES.recurringPurchases,
  setupLogMessage: '積立自動発注トリガーを設定しました（毎日22:30実行）',
};

/** 週次レポート送信トリガー設定。 */
const WEEKLY_REPORT_TRIGGER: TriggerConfig = {
  handlerFunctionName: 'sendWeeklyReport',
  schedule: TRIGGER_SCHEDULES.weeklyReport,
  setupLogMessage: '週次レポート送信トリガーを設定しました（毎週土曜日7:00-8:00実行）',
};

/** 市場指数取得トリガー設定。 */
const MARKET_INDEX_FETCH_TRIGGER: TriggerConfig = {
  handlerFunctionName: 'fetchMarketIndices',
  schedule: TRIGGER_SCHEDULES.marketIndexFetch,
  setupLogMessage: '市場指数取得トリガーを設定しました（毎日7:00-8:00実行）',
};

/**
 * 曜日識別子を GAS の Weekday へ変換する。
 *
 * @param weekDay - 曜日識別子（現状は土曜日のみ）
 * @returns GAS の Weekday
 */
function resolveWeekDay(weekDay: 'SATURDAY'): GoogleAppsScript.Base.Weekday {
  switch (weekDay) {
    case 'SATURDAY':
      return ScriptApp.WeekDay.SATURDAY;
  }
}

/**
 * 指定スケジュールに従って時間駆動トリガーを新規作成する。
 *
 * @param handlerFunctionName - 起動するハンドラ関数名
 * @param schedule - 実行スケジュール
 */
function buildTimeBasedTrigger(handlerFunctionName: string, schedule: TriggerSchedule): void {
  const timeBased = ScriptApp.newTrigger(handlerFunctionName).timeBased();

  if (schedule.frequency === 'weekly') {
    timeBased.onWeekDay(resolveWeekDay(schedule.weekDay)).atHour(schedule.atHour).create();
    return;
  }

  const daily = timeBased.everyDays(1).atHour(schedule.atHour);
  if (schedule.nearMinute === undefined) {
    daily.create();
    return;
  }
  daily.nearMinute(schedule.nearMinute).create();
}

/**
 * 指定ハンドラ名の既存トリガーを全て削除し、削除件数を返す。
 * 各削除時に logEach(uniqueId) を呼び、呼び出し側でログ文言を制御できるようにする。
 *
 * @param handlerFunctionName - 削除対象のハンドラ関数名
 * @param logEach - 1件削除するたびに呼ばれるログ出力関数
 * @returns 削除した件数
 */
function deleteTriggersByHandler(
  handlerFunctionName: string,
  logEach: (uniqueId: string) => void
): number {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === handlerFunctionName) {
      ScriptApp.deleteTrigger(trigger);
      deletedCount += 1;
      logEach(trigger.getUniqueId());
    }
  }
  return deletedCount;
}

/**
 * トリガーを（再）設定する。
 * 既存の同名トリガーを削除してから、スケジュールに従って新規作成する。
 *
 * @param config - トリガー設定情報
 */
function setupTrigger(config: TriggerConfig): void {
  deleteTriggersByHandler(config.handlerFunctionName, (uniqueId) => {
    Logger.log(`既存のトリガーを削除しました: ${uniqueId}`);
  });
  buildTimeBasedTrigger(config.handlerFunctionName, config.schedule);
  Logger.log(config.setupLogMessage);
}

/**
 * 指定ハンドラ名のトリガーを全て削除し、削除件数をログに残す。
 *
 * @param handlerFunctionName - 削除対象のハンドラ関数名
 */
function removeTrigger(handlerFunctionName: string): void {
  const deletedCount = deleteTriggersByHandler(handlerFunctionName, (uniqueId) => {
    Logger.log(`トリガーを削除しました: ${uniqueId}`);
  });

  if (deletedCount === 0) {
    Logger.log('削除対象のトリガーが見つかりませんでした。');
  } else {
    Logger.log(`${String(deletedCount)}個のトリガーを削除しました。`);
  }
}

/**
 * NAV自動取得の時間駆動トリガーを設定する。
 * この関数を1回だけ手動実行することで、毎日21:00-22:00に自動実行されるトリガーが設定される。
 * 既存のトリガーは削除してから新しいトリガーを設定する。
 */
export function setupNavFetchTrigger(): void {
  setupTrigger(NAV_FETCH_TRIGGER);
}

/**
 * 積立自動発注の時間駆動トリガーを設定する。
 * この関数を1回だけ手動実行することで、毎日22:30に自動実行されるトリガーが設定される。
 * 既存のトリガーは削除してから新しいトリガーを設定する。
 */
export function setupRecurringPurchasesTrigger(): void {
  setupTrigger(RECURRING_PURCHASES_TRIGGER);
}

/**
 * NAV自動取得の時間駆動トリガーを削除する。
 * 自動取得を停止したい場合に実行する。
 */
export function deleteNavFetchTrigger(): void {
  removeTrigger('fetchAllNavs');
}

/**
 * NavFetchResultの型ガード関数。
 */
function isNavFetchResult(value: unknown): value is NavFetchResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.totalCount === 'number' &&
    typeof obj.successCount === 'number' &&
    typeof obj.alreadyExistsCount === 'number' &&
    typeof obj.skippedCount === 'number' &&
    typeof obj.failedCount === 'number' &&
    Array.isArray(obj.items) &&
    Array.isArray(obj.performanceFailures) &&
    obj.performanceFailures.every(isPerformanceRecordFailure)
  );
}

/**
 * PerformanceRecordFailure（実績記録失敗の内訳）の型ガード関数。
 *
 * `fetchAllNavs` は実績記録失敗の内訳を運用者通知メールの本文へ整形するため、想定外の構造
 * （scope 不正・message 欠落・scope と fundId/fundName の不整合）が混入した状態で本文整形へ
 * 進むと、undefined 等の不正値を含む通知を送ってしまう。これを防ぐため、要素構造を fail fast で
 * 検証し、不正要素があれば {@link isNavFetchResult} を通じて NavFetchResult 全体を不正と判定する。
 *
 * 検証規則（{@link PerformanceRecordFailure} の不変条件に一致させる）:
 * - `scope` は 'global' または 'fund' のいずれか。
 * - `message` は空でない文字列。
 * - `scope='global'`（全体実績失敗）は銘柄に紐づかないため `fundId`・`fundName` はともに null。
 * - `scope='fund'`（ファンド別実績失敗）は銘柄に紐づくため `fundId`・`fundName` は空でない文字列。
 */
function isPerformanceRecordFailure(value: unknown): value is PerformanceRecordFailure {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (obj.scope !== 'global' && obj.scope !== 'fund') {
    return false;
  }
  if (typeof obj.message !== 'string' || obj.message === '') {
    return false;
  }
  if (obj.scope === 'global') {
    return obj.fundId === null && obj.fundName === null;
  }
  return (
    typeof obj.fundId === 'string' &&
    obj.fundId !== '' &&
    typeof obj.fundName === 'string' &&
    obj.fundName !== ''
  );
}

/**
 * executeRecurringPurchasesの結果形式を検証する。
 */
function isExecuteRecurringResult(value: unknown): value is ExecuteRecurringResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.executed) || !Array.isArray(obj.skipped)) {
    return false;
  }
  return obj.skipped.every((item) => {
    if (typeof item !== 'object' || item === null) {
      return false;
    }
    const record = item as Record<string, unknown>;
    return (
      typeof record.recurringPurchaseId === 'string' &&
      typeof record.reason === 'string' &&
      record.recurringPurchaseId !== ''
    );
  });
}

/**
 * スキップ理由の内訳を集計する。
 */
function summarizeSkippedReasons(
  skipped: ExecuteRecurringResult['skipped']
): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const item of skipped) {
    summary[item.reason] = (summary[item.reason] ?? 0) + 1;
  }
  return summary;
}

/**
 * 週次レポートをメールで送信する。
 * 毎週土曜日にトリガーから自動実行される関数。
 * ポートフォリオの全体サマリーと保有銘柄一覧をメールで送信する。
 * 週次レポート送信後、-5%ルール判定を行い、条件を満たせばアラートメールを送信する。
 */
export function sendWeeklyReport(): void {
  const response = handleApiRequest({ action: 'sendWeeklyReport' });

  if (!response.success) {
    Logger.log(`[sendWeeklyReport] 失敗: ${response.error.message} (${response.error.type})`);
    return;
  }

  Logger.log('[sendWeeklyReport] 週次レポートを送信しました。');

  // -5%ルール判定を実行
  checkAndSendMarketIndexAlert();
}

/**
 * -5%ルールアラートを判定し、条件を満たせばアラートメールを送信する。
 * S&P500またはNASDAQが前週比-5%以上下落した場合に通知を行う。
 */
function checkAndSendMarketIndexAlert(): void {
  Logger.log('[checkAndSendMarketIndexAlert] -5%ルール判定を開始します。');

  // メールアドレスを取得
  const recipientEmail = getWeeklyReportEmail();
  if (recipientEmail === null) {
    Logger.log(
      '[checkAndSendMarketIndexAlert] WEEKLY_REPORT_EMAILが設定されていないためスキップします。'
    );
    return;
  }

  // SheetRepositoryを開く
  const sheetRepositoryResult = openSheetRepository();
  if (!sheetRepositoryResult.success) {
    Logger.log(
      `[checkAndSendMarketIndexAlert] シートリポジトリの取得に失敗: ${sheetRepositoryResult.error.message}`
    );
    return;
  }

  const sheetRepository = sheetRepositoryResult.value;

  // 市場指数シートの存在確認
  const marketIndicesDefinition: SheetDefinition = {
    name: SHEET_NAMES.MARKET_INDICES,
    headers: SHEET_HEADERS[SHEET_NAMES.MARKET_INDICES],
  };
  const ensureResult = sheetRepository.ensureSheet(marketIndicesDefinition);
  if (!ensureResult.success) {
    Logger.log(
      `[checkAndSendMarketIndexAlert] 市場指数シートの確認に失敗: ${ensureResult.error.message}`
    );
    return;
  }

  // MarketIndexRepositoryとUseCaseを作成
  const marketIndexRepository = createMarketIndexRepository(sheetRepository);
  const marketIndexAlertUseCase = createMarketIndexAlertUseCase(marketIndexRepository);

  // -5%ルール判定を実行
  const alertResult = marketIndexAlertUseCase.checkAlert();
  if (!alertResult.success) {
    Logger.log(`[checkAndSendMarketIndexAlert] アラート判定に失敗: ${alertResult.error.message}`);
    return;
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
    return;
  }

  // アラートメールを送信
  const emailService = createEmailService();
  const sendResult = emailService.sendMarketIndexAlert(result, recipientEmail);
  if (!sendResult.success) {
    Logger.log(
      `[checkAndSendMarketIndexAlert] アラートメール送信に失敗: ${sendResult.error.message}`
    );
    return;
  }

  Logger.log('[checkAndSendMarketIndexAlert] アラートメールを送信しました。');

  // -5%以上下落した指数のセルを色付け
  if (result.sp500?.isTriggered) {
    const highlightResult = marketIndexRepository.highlightAlertCell(result.alertDate, 'sp500');
    if (highlightResult.success) {
      Logger.log(
        `[checkAndSendMarketIndexAlert] S&P500セルをハイライトしました: ${result.alertDate}`
      );
    } else {
      Logger.log(
        `[checkAndSendMarketIndexAlert] S&P500セルのハイライトに失敗: ${highlightResult.error.message}`
      );
    }
  }

  if (result.nasdaq?.isTriggered) {
    const highlightResult = marketIndexRepository.highlightAlertCell(result.alertDate, 'nasdaq');
    if (highlightResult.success) {
      Logger.log(
        `[checkAndSendMarketIndexAlert] NASDAQセルをハイライトしました: ${result.alertDate}`
      );
    } else {
      Logger.log(
        `[checkAndSendMarketIndexAlert] NASDAQセルのハイライトに失敗: ${highlightResult.error.message}`
      );
    }
  }
}

/**
 * 週次レポート送信トリガーを設定する。
 * この関数を1回だけ手動実行することで、毎週土曜日の9:00-10:00に自動実行されるトリガーが設定される。
 * 既存のトリガーは削除してから新しいトリガーを設定する。
 */
export function setupWeeklyReportTrigger(): void {
  setupTrigger(WEEKLY_REPORT_TRIGGER);
}

/**
 * 週次レポート送信トリガーを削除する。
 * 自動送信を停止したい場合に実行する。
 */
export function deleteWeeklyReportTrigger(): void {
  removeTrigger('sendWeeklyReport');
}

// ============================================
// 市場指数取得関連の関数
// ============================================

/**
 * 市場指数取得結果の型ガード関数。
 */
function isMarketIndexFetchResult(
  value: unknown
): value is { status: string; date: string; message: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.status === 'string' &&
    typeof obj.date === 'string' &&
    typeof obj.message === 'string'
  );
}

/**
 * S&P500およびNASDAQ Composite指数の終値を取得し、シートに記録する。
 * Google Apps Scriptのトリガーから呼び出すための関数。
 * 毎日7:00-8:00（JST）に実行することを推奨（米国市場閉場後）。
 */
export function fetchMarketIndices(): void {
  const response = handleApiRequest({ action: 'fetchMarketIndices' });

  if (!response.success) {
    Logger.log(`[fetchMarketIndices] 失敗: ${response.error.message} (${response.error.type})`);
    sendErrorNotificationEmail(
      '市場指数取得',
      `市場指数の取得に失敗しました。\n\n${formatErrorDetail(response.error)}`
    );
    return;
  }

  if (!isMarketIndexFetchResult(response.value)) {
    Logger.log('[fetchMarketIndices] 失敗: 実行結果の形式が不正です。');
    sendErrorNotificationEmail('市場指数取得', '市場指数の取得結果の形式が不正です。');
    return;
  }

  const result = response.value;
  Logger.log(`[fetchMarketIndices] ${result.status}: ${result.message}`);

  // 失敗の場合のみメール通知
  if (result.status === 'failed') {
    sendErrorNotificationEmail(
      '市場指数取得（失敗）',
      `市場指数の取得に失敗しました。\n\n${result.message}`
    );
  }
}

/**
 * 市場指数取得の時間駆動トリガーを設定する。
 * この関数を1回だけ手動実行することで、毎日7:00-8:00（JST）に自動実行されるトリガーが設定される。
 * 既存のトリガーは削除してから新しいトリガーを設定する。
 */
export function setupMarketIndexFetchTrigger(): void {
  // 市場指数は毎日7:00-8:00（JST）に取得する。
  // 米国市場は日本時間5:00-6:00に閉場するため、その後に実行する想定（夏時間/冬時間で変動）。
  setupTrigger(MARKET_INDEX_FETCH_TRIGGER);
}

/**
 * 市場指数取得の時間駆動トリガーを削除する。
 * 自動取得を停止したい場合に実行する。
 */
export function deleteMarketIndexFetchTrigger(): void {
  removeTrigger('fetchMarketIndices');
}
