import { describe, expect, it, vi } from 'vite-plus/test';
import { logError, logWarn } from '../../src/utils/logger';

/**
 * ログ重要度ヘルパー（logError / logWarn）の検証。
 *
 * 前提（全テスト共通）:
 * - tests/setup.ts により `globalThis.Logger.log` は vi.fn() のモックへ差し替えられている。
 * - 本ヘルパーは内部で `Logger.log` を呼ぶため、`vi.spyOn(globalThis.Logger, 'log')` で
 *   出力内容を捕捉できる（テスト側のログ捕捉が引き続き機能することの確認も兼ねる）。
 */
describe('logError', () => {
  it('メッセージ冒頭に [ERROR] プレフィックスを付与して Logger.log へ委譲する', () => {
    // 前提: エラー相当のログメッセージを与える
    // 事前条件: Logger.log を spy で捕捉する。Logger.log はテスト間で共有される
    //   モックのため、呼び出し回数を厳密に検証できるよう本テスト開始時にクリアする。
    const logSpy = vi.spyOn(globalThis.Logger, 'log');
    logSpy.mockClear();

    logError('基準価額の自動取得に失敗しました: タイムアウト');

    // 検証: [ERROR] 付きの文字列がちょうど1回 Logger.log へ渡される
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[ERROR] 基準価額の自動取得に失敗しました: タイムアウト');
  });
});

describe('logWarn', () => {
  it('メッセージ冒頭に [WARN] プレフィックスを付与して Logger.log へ委譲する', () => {
    // 前提: 警告相当のログメッセージを与える
    // 事前条件: Logger.log を spy で捕捉する。Logger.log はテスト間で共有される
    //   モックのため、呼び出し回数を厳密に検証できるよう本テスト開始時にクリアする。
    const logSpy = vi.spyOn(globalThis.Logger, 'log');
    logSpy.mockClear();

    logWarn('全体実績記録に失敗: シート書き込みエラー');

    // 検証: [WARN] 付きの文字列がちょうど1回 Logger.log へ渡される
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[WARN] 全体実績記録に失敗: シート書き込みエラー');
  });
});
