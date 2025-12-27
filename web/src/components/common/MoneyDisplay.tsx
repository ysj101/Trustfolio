/**
 * 金額表示コンポーネント
 */

import { formatMoney, formatMoneyWithSign } from "../../utils/format";

type Props = {
  value: number;
  showSign?: boolean;
  colorize?: boolean;
};

export function MoneyDisplay({ value, showSign = false, colorize = false }: Props) {
  const formatted = showSign ? formatMoneyWithSign(value) : formatMoney(value);

  const colorClass = colorize
    ? value >= 0
      ? "text-green-600"
      : "text-red-600"
    : "";

  return <span className={colorClass}>{formatted}</span>;
}
