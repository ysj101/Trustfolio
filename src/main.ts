import type { ApiRequest } from './api/router';
import { handleApiRequest } from './api/router';

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
      error: { type: 'validation', message: 'POSTデータが空です。JSONリクエストを送信してください。' }
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
  ui.createMenu('Trustfolio')
    .addItem('シート初期化', 'initializeSheets')
    .addToUi();
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
