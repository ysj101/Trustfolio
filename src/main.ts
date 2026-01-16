import type { ApiRequest } from './api/router';
import { handleApiRequest } from './api/router';
export { handleApiRequest } from './api/router';
export { runRakutenIntegrationTest } from './integration/RakutenIntegrationTest';
export type { NavFetchResult } from './usecase/NavFetchUseCase';
import type { Result } from './domain/types';
import type { NavFetchResult, NavFetchResultItem } from './usecase/NavFetchUseCase';
import type { ExecuteRecurringResult } from './usecase/RecurringUseCase';
import { getWeeklyReportEmail } from './Config';
import { createEmailService } from './service/EmailService';

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
 * 全銘柄の基準価額を自動取得する。
 * Google Apps Scriptのトリガーから呼び出すための関数。
 * 毎日21:00〜22:00頃に実行することを推奨（投資信託協会の基準価額公開後）。
 */
export function fetchAllNavs(): void {
  const response = handleApiRequest({ action: 'fetchAllNavs' });
  if (!response.success) {
    console.error('基準価額の自動取得に失敗しました:', response.error.message);
    // エラー通知メールを送信
    sendErrorNotificationEmail(
      '基準価額自動取得',
      `基準価額の自動取得に失敗しました。\n\nエラー: ${response.error.message}\nタイプ: ${response.error.type}`
    );
    return;
  }

  const result = response.value;
  if (!isNavFetchResult(result)) {
    console.error('基準価額の自動取得結果の形式が不正です');
    // エラー通知メールを送信
    sendErrorNotificationEmail(
      '基準価額自動取得',
      '基準価額の自動取得結果の形式が不正です。\n\nレスポンス形式が期待通りではありません。'
    );
    return;
  }

  console.log(
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
      `積立の自動実行に失敗しました。\n\n` +
        `約定日: ${today}\n` +
        `エラー: ${response.error.message}\n` +
        `タイプ: ${response.error.type}`
    );
    return response as Result<ExecuteRecurringResult>;
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
    console.error(
      `基準価額取得に失敗しました: fundId=${item.fundId}, fundName=${item.fundName}, reason=${
        item.message ?? '不明なエラー'
      }`
    );
  }
}

/**
 * NAV自動取得の時間駆動トリガーを設定する。
 * この関数を1回だけ手動実行することで、毎日21:00-22:00に自動実行されるトリガーが設定される。
 * 既存のトリガーは削除してから新しいトリガーを設定する。
 */
export function setupNavFetchTrigger(): void {
  // 既存のfetchAllNavsトリガーを削除
  const existingTriggers = ScriptApp.getProjectTriggers();
  for (const trigger of existingTriggers) {
    if (trigger.getHandlerFunction() === 'fetchAllNavs') {
      ScriptApp.deleteTrigger(trigger);
      console.log(`既存のトリガーを削除しました: ${trigger.getUniqueId()}`);
    }
  }

  // 新しいトリガーを設定（毎日21:00-22:00に実行）
  ScriptApp.newTrigger('fetchAllNavs').timeBased().everyDays(1).atHour(21).create();

  console.log('NAV自動取得トリガーを設定しました（毎日21:00-22:00実行）');
}

/**
 * 積立自動発注の時間駆動トリガーを設定する。
 * この関数を1回だけ手動実行することで、毎日22:30に自動実行されるトリガーが設定される。
 * 既存のトリガーは削除してから新しいトリガーを設定する。
 */
export function setupRecurringPurchasesTrigger(): void {
  const existingTriggers = ScriptApp.getProjectTriggers();
  for (const trigger of existingTriggers) {
    if (trigger.getHandlerFunction() === 'executeRecurringPurchasesDaily') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log(`既存のトリガーを削除しました: ${trigger.getUniqueId()}`);
    }
  }

  ScriptApp.newTrigger('executeRecurringPurchasesDaily')
    .timeBased()
    .everyDays(1)
    .atHour(22)
    .nearMinute(30)
    .create();

  Logger.log('積立自動発注トリガーを設定しました（毎日22:30実行）');
}

/**
 * NAV自動取得の時間駆動トリガーを削除する。
 * 自動取得を停止したい場合に実行する。
 */
export function deleteNavFetchTrigger(): void {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;

  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'fetchAllNavs') {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
      console.log(`トリガーを削除しました: ${trigger.getUniqueId()}`);
    }
  }

  if (deletedCount === 0) {
    console.log('削除対象のトリガーが見つかりませんでした。');
  } else {
    console.log(`${String(deletedCount)}個のトリガーを削除しました。`);
  }
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
    Array.isArray(obj.items)
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
 */
export function sendWeeklyReport(): void {
  const response = handleApiRequest({ action: 'sendWeeklyReport' });

  if (!response.success) {
    Logger.log(`[sendWeeklyReport] 失敗: ${response.error.message} (${response.error.type})`);
    return;
  }

  Logger.log('[sendWeeklyReport] 週次レポートを送信しました。');
}

/**
 * 週次レポート送信トリガーを設定する。
 * この関数を1回だけ手動実行することで、毎週土曜日の9:00-10:00に自動実行されるトリガーが設定される。
 * 既存のトリガーは削除してから新しいトリガーを設定する。
 */
export function setupWeeklyReportTrigger(): void {
  const existingTriggers = ScriptApp.getProjectTriggers();
  for (const trigger of existingTriggers) {
    if (trigger.getHandlerFunction() === 'sendWeeklyReport') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log(`既存のトリガーを削除しました: ${trigger.getUniqueId()}`);
    }
  }

  ScriptApp.newTrigger('sendWeeklyReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(7)
    .create();

  Logger.log('週次レポート送信トリガーを設定しました（毎週土曜日7:00-8:00実行）');
}

/**
 * 週次レポート送信トリガーを削除する。
 * 自動送信を停止したい場合に実行する。
 */
export function deleteWeeklyReportTrigger(): void {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;

  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'sendWeeklyReport') {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
      Logger.log(`トリガーを削除しました: ${trigger.getUniqueId()}`);
    }
  }

  if (deletedCount === 0) {
    Logger.log('削除対象のトリガーが見つかりませんでした。');
  } else {
    Logger.log(`${String(deletedCount)}個のトリガーを削除しました。`);
  }
}
