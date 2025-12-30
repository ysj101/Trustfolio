import type { ApiRequest } from './api/router';
import { handleApiRequest } from './api/router';
export { handleApiRequest } from './api/router';
export { runRakutenIntegrationTest } from './integration/RakutenIntegrationTest';
export type { NavFetchResult } from './usecase/NavFetchUseCase';

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
 * 全銘柄の基準価額を自動取得する。
 * Google Apps Scriptのトリガーから呼び出すための関数。
 * 毎日21:00〜22:00頃に実行することを推奨（投資信託協会の基準価額公開後）。
 */
export function fetchAllNavs(): void {
  const response = handleApiRequest({ action: 'fetchAllNavs' });
  if (!response.success) {
    console.error('基準価額の自動取得に失敗しました:', response.error.message);
    return;
  }

  const result = response.value as {
    totalCount: number;
    successCount: number;
    skippedCount: number;
    alreadyExistsCount: number;
    failedCount: number;
  };

  console.log(
    `基準価額の自動取得が完了しました。` +
      `総数: ${String(result.totalCount)}, ` +
      `成功: ${String(result.successCount)}, ` +
      `既存: ${String(result.alreadyExistsCount)}, ` +
      `スキップ: ${String(result.skippedCount)}, ` +
      `失敗: ${String(result.failedCount)}`
  );
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
