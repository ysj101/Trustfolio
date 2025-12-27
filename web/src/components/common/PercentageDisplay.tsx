/**
 * パーセンテージ表示コンポーネント
 */

import { formatPercentage } from "../../utils/format";

type Props = {
  value: number;
  colorize?: boolean;
};

export function PercentageDisplay({ value, colorize = false }: Props) {
  const formatted = formatPercentage(value);

  const colorClass = colorize
    ? value >= 0
      ? "text-green-600"
      : "text-red-600"
    : "";

  return <span className={colorClass}>{formatted}</span>;
}
