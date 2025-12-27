/**
 * フォーマットユーティリティ
 */

/**
 * 金額をフォーマットする
 * @param value - 金額（円）
 * @returns フォーマット済み文字列（例: ¥1,234,567）
 */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(value);
}

/**
 * 金額を符号付きでフォーマットする
 * @param value - 金額（円）
 * @returns フォーマット済み文字列（例: +¥1,234 or -¥5,678）
 */
export function formatMoneyWithSign(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return sign + formatMoney(value);
}

/**
 * パーセンテージをフォーマットする
 * @param value - パーセント値（例: 12.34）
 * @returns フォーマット済み文字列（例: +12.34%）
 */
export function formatPercentage(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * 日付をフォーマットする
 * @param dateStr - 日付文字列（YYYY-MM-DD）
 * @returns フォーマット済み文字列（例: 2024/03/15）
 */
export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${year}/${month}/${day}`;
}

/**
 * 口数をフォーマットする
 * @param units - 口数
 * @returns フォーマット済み文字列（例: 12,345口）
 */
export function formatUnits(units: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(units)}口`;
}

/**
 * 数値をカンマ区切りでフォーマットする
 * @param value - 数値
 * @returns フォーマット済み文字列（例: 1,234,567）
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value);
}
