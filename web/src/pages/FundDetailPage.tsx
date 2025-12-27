/**
 * 投資信託詳細画面
 *
 * 投資信託の基本情報、保有状況、基準価額推移、取引履歴を表示する。
 */

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  useFunds,
  useNavHistory,
  useRegisterNav,
  useHolding,
  useTransactionHistory,
  useExecuteSpotPurchase,
} from "../hooks/useApi";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { MoneyDisplay } from "../components/common/MoneyDisplay";
import { PercentageDisplay } from "../components/common/PercentageDisplay";
import { formatDate, formatMoney, formatUnits } from "../utils/format";

export function FundDetailPage() {
  const { fundId } = useParams<{ fundId: string }>();
  const { data: funds } = useFunds();
  const { data: navs, isLoading: navsLoading } = useNavHistory(fundId ?? "", 30);
  const { data: holding, isLoading: holdingLoading } = useHolding(fundId ?? "");
  const { data: transactions, isLoading: txLoading } = useTransactionHistory(
    fundId ?? "",
    10
  );
  const registerNav = useRegisterNav(fundId ?? "");
  const executeSpotPurchase = useExecuteSpotPurchase(fundId ?? "");

  // NAV登録フォーム
  const [navDate, setNavDate] = useState("");
  const [navValue, setNavValue] = useState("");
  const [navError, setNavError] = useState<string | null>(null);

  // 取引フォーム
  const [txDate, setTxDate] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  const fund = funds?.find((f) => f.id === fundId);

  if (!fund) {
    return <LoadingSpinner />;
  }

  const handleNavSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNavError(null);

    if (!navDate || !navValue) {
      setNavError("日付と基準価額を入力してください");
      return;
    }

    registerNav.mutate(
      { date: navDate, value: Number(navValue) },
      {
        onSuccess: () => {
          setNavDate("");
          setNavValue("");
        },
        onError: (err) => {
          setNavError(err instanceof Error ? err.message : "登録に失敗しました");
        },
      }
    );
  };

  const handleTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);

    if (!txDate || !txAmount) {
      setTxError("日付と購入金額を入力してください");
      return;
    }

    executeSpotPurchase.mutate(
      { date: txDate, amount: Number(txAmount) },
      {
        onSuccess: () => {
          setTxDate("");
          setTxAmount("");
        },
        onError: (err) => {
          setTxError(err instanceof Error ? err.message : "購入に失敗しました");
        },
      }
    );
  };

  // グラフ用データ
  const chartData =
    navs
      ?.slice()
      .reverse()
      .map((nav) => ({
        date: formatDate(nav.date),
        value: nav.value,
      })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/funds" className="text-blue-600 hover:underline">
          ← 一覧へ戻る
        </Link>
        <h1 className="text-2xl font-bold">{fund.name}</h1>
      </div>

      {/* 保有状況 */}
      <Card title="保有状況">
        {holdingLoading ? (
          <LoadingSpinner />
        ) : holding ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">保有口数</p>
              <p className="text-lg font-semibold">
                {formatUnits(holding.totalUnits)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">平均取得単価</p>
              <p className="text-lg font-semibold">
                <MoneyDisplay value={holding.averageCost} />
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">投資総額</p>
              <p className="text-lg font-semibold">
                <MoneyDisplay value={holding.totalInvestment} />
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">評価額</p>
              <p className="text-lg font-semibold">
                {holding.currentValue !== null ? (
                  <MoneyDisplay value={holding.currentValue} />
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">含み損益</p>
              <p className="text-lg font-semibold">
                {holding.unrealizedGain !== null ? (
                  <MoneyDisplay
                    value={holding.unrealizedGain}
                    showSign
                    colorize
                  />
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">損益率</p>
              <p className="text-lg font-semibold">
                {holding.unrealizedGainRate !== null ? (
                  <PercentageDisplay value={holding.unrealizedGainRate} colorize />
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">最新基準価額</p>
              <p className="text-lg font-semibold">
                {holding.currentNavValue !== null ? (
                  <MoneyDisplay value={holding.currentNavValue} />
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">NAV日付</p>
              <p className="text-lg font-semibold">
                {holding.currentNavDate ? formatDate(holding.currentNavDate) : "-"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">取引がありません</p>
        )}
      </Card>

      {/* 基準価額推移グラフ */}
      <Card title="基準価額推移">
        {navsLoading ? (
          <LoadingSpinner />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" />
              <YAxis domain={["auto", "auto"]} />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500">基準価額が登録されていません</p>
        )}
      </Card>

      {/* 基準価額登録フォーム */}
      <Card title="基準価額登録">
        <form onSubmit={handleNavSubmit} className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-sm text-gray-600 mb-1">日付</label>
            <input
              type="date"
              value={navDate}
              onChange={(e) => setNavDate(e.target.value)}
              className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              基準価額（円）
            </label>
            <input
              type="number"
              value={navValue}
              onChange={(e) => setNavValue(e.target.value)}
              placeholder="10000"
              className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button type="submit" loading={registerNav.isPending}>
            登録
          </Button>
        </form>
        {navError && <p className="text-red-600 text-sm mt-2">{navError}</p>}
      </Card>

      {/* スポット購入フォーム */}
      <Card title="スポット購入">
        <form onSubmit={handleTxSubmit} className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-sm text-gray-600 mb-1">購入日</label>
            <input
              type="date"
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              購入金額（円）
            </label>
            <input
              type="number"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              placeholder="10000"
              className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button type="submit" loading={executeSpotPurchase.isPending}>
            購入
          </Button>
        </form>
        {txError && <p className="text-red-600 text-sm mt-2">{txError}</p>}
      </Card>

      {/* 取引履歴 */}
      <Card title="取引履歴">
        {txLoading ? (
          <LoadingSpinner />
        ) : transactions && transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">日付</th>
                  <th className="text-left py-2">種別</th>
                  <th className="text-right py-2">金額</th>
                  <th className="text-right py-2">基準価額</th>
                  <th className="text-right py-2">口数</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b">
                    <td className="py-2">{formatDate(tx.date)}</td>
                    <td className="py-2">
                      {tx.type === "SPOT_PURCHASE" ? "スポット" : "積立"}
                    </td>
                    <td className="text-right py-2">
                      <MoneyDisplay value={tx.amount} />
                    </td>
                    <td className="text-right py-2">
                      <MoneyDisplay value={tx.navValue} />
                    </td>
                    <td className="text-right py-2">{formatUnits(tx.units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">取引がありません</p>
        )}
      </Card>
    </div>
  );
}
