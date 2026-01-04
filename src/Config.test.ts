import { describe, expect, it, vi } from 'vitest';
import {
  getFundIdSuffix,
  getPerformanceSheetName,
  getTransactionSheetName,
  getWeeklyReportEmail,
} from './Config';

describe('Config', () => {
  it('ファンドIDから取引シート名を生成する', () => {
    // 前提: ファンドIDが指定される
    // 事前条件: 変換ルールは固定である
    // 検証: 取引シート名が生成される
    const name = getTransactionSheetName('fund-001');
    expect(name).toBe('_tx_001');
  });

  it('ファンドIDから実績シート名を生成する', () => {
    // 前提: ファンドIDが指定される
    // 事前条件: 変換ルールは固定である
    // 検証: 実績シート名が生成される
    const name = getPerformanceSheetName('fund-002');
    expect(name).toBe('_perf_002');
  });

  it('ファンドIDの末尾3文字を取得する', () => {
    // 前提: ファンドIDが指定される
    // 事前条件: 末尾3文字のルールが適用される
    // 検証: 末尾3文字が返る
    const suffix = getFundIdSuffix('fund-12345');
    expect(suffix).toBe('345');
  });

  it('スクリプトプロパティが未設定の場合はnullを返す', () => {
    // 前提: WEEKLY_REPORT_EMAILが未設定である
    // 事前条件: getPropertyがnullを返す
    // 検証: nullが返る
    const getPropertyMock = vi.fn(() => null);
    vi.spyOn(globalThis.PropertiesService, 'getScriptProperties').mockReturnValue({
      getProperty: getPropertyMock,
    });
    const email = getWeeklyReportEmail();
    expect(email).toBeNull();
  });
});
