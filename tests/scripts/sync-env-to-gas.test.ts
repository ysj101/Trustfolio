/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { describe, expect, it } from 'vitest';
import { parseEnvContent, main } from '../../scripts/sync-env-to-gas.mjs';

describe('scripts/sync-env-to-gas', () => {
  it('環境変数の内容を正しく解析する', () => {
    // 前提: .env形式の文字列が渡される
    // 事前条件: コメント行とGAS_SCRIPT_IDを含む
    // 検証: 必要な環境変数のみが抽出される
    const content = `
# comment
WEEKLY_REPORT_EMAIL=test@example.com
GAS_SCRIPT_ID=ignored
NAV_FETCH_HOUR=21
`;
    const result = parseEnvContent(content);
    expect(result).toEqual({
      WEEKLY_REPORT_EMAIL: 'test@example.com',
      NAV_FETCH_HOUR: '21',
    });
  });

  it('同期対象がない場合は注意ログを出力する', () => {
    // 前提: 環境変数が空である
    // 事前条件: loadEnvが空オブジェクトを返す
    // 検証: 注意メッセージが出力される
    const logs: string[] = [];
    const logger = { log: (message: string) => logs.push(message) };
    main({ loadEnv: () => ({}), logger });
    expect(logs.some((message) => message.includes('同期する環境変数が見つかりませんでした'))).toBe(
      true
    );
  });

  it('同期対象がある場合は設定手順が出力される', () => {
    // 前提: 環境変数が1件以上ある
    // 事前条件: loadEnvが値を返す
    // 検証: 設定手順のログが出力される
    const logs: string[] = [];
    const logger = { log: (message: string) => logs.push(message) };
    main({ loadEnv: () => ({ WEEKLY_REPORT_EMAIL: 'notify@example.com' }), logger });
    expect(logs.some((message) => message.includes('GASエディタでの設定手順'))).toBe(true);
    expect(logs.some((message) => message.includes('WEEKLY_REPORT_EMAIL=notify@example.com'))).toBe(
      true
    );
  });
});
