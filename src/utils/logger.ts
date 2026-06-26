/**
 * サーバ側ログに重要度（severity）プレフィックスを付与する小さなログヘルパー。
 *
 * 背景・目的:
 * - G1（#109 / PR #120）で、サーバ側のログ出力を `console.warn` / `console.error` から
 *   GAS 公式の `Logger.log` へ統一した。出力先は一本化されたが、`Logger` には
 *   重要度（severity）の概念が無いため、従来 `console.warn` / `console.error` で
 *   区別できていたエラー・警告の重要度情報が失われた。
 * - 本ヘルパーは、ログメッセージ冒頭に `[ERROR]` / `[WARN]` のプレフィックスを付与し、
 *   grep や目視確認で重要度を判別できるようにして可観測性を回復する（#121）。
 *
 * 設計上の注意:
 * - 内部では GAS 公式の `Logger.log` をそのまま呼び出す。これにより出力先は従来どおりであり、
 *   テスト側の `Logger.log` スパイ（`vi.spyOn(globalThis.Logger, 'log')`）も引き続き機能する。
 * - 本ヘルパーは重要度プレフィックスの付与のみを担い、メール送信・シート書き込み等の
 *   外部挙動は一切変更しない（変更はログ文言のみ）。
 * - 現状スコープで判別可能な重要度は ERROR / WARN の2種のため、この2関数のみを提供する。
 *   INFO 等を新設する場合は、実際に利用する箇所と同時に追加すること（未使用関数を作らない）。
 */

/** エラー（致命的・要対応）を示すログプレフィックス。 */
const ERROR_PREFIX = '[ERROR]';

/** 警告（処理は継続するが注意が必要）を示すログプレフィックス。 */
const WARN_PREFIX = '[WARN]';

/**
 * 指定した重要度プレフィックスをメッセージ冒頭へ付与し、`Logger.log` へ出力する内部共通処理。
 *
 * 出力書式（`<prefix> <message>`）を1箇所に集約することで、将来プレフィックスの
 * 区切り文字や書式を変更する際の修正漏れ（重要度ごとの書式不整合）を防ぐ。
 *
 * @param prefix - 重要度を示すプレフィックス（例: `[ERROR]` / `[WARN]`）。
 * @param message - 出力するログメッセージ（プレフィックスは付与済みでないこと）。
 */
function logWithPrefix(prefix: string, message: string): void {
  Logger.log(`${prefix} ${message}`);
}

/**
 * エラー重要度のログを出力する。
 *
 * 従来 `console.error` で出力していた「致命的・要対応」のログに用いる。
 * メッセージ冒頭に `[ERROR]` を付与して `Logger.log` へ委譲する。
 *
 * @param message - 出力するログメッセージ（プレフィックスは付与済みでないこと）。
 */
export function logError(message: string): void {
  logWithPrefix(ERROR_PREFIX, message);
}

/**
 * 警告重要度のログを出力する。
 *
 * 従来 `console.warn` で出力していた「処理は継続するが注意が必要」のログに用いる。
 * メッセージ冒頭に `[WARN]` を付与して `Logger.log` へ委譲する。
 *
 * @param message - 出力するログメッセージ（プレフィックスは付与済みでないこと）。
 */
export function logWarn(message: string): void {
  logWithPrefix(WARN_PREFIX, message);
}
