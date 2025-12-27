/**
 * ポートフォリオ画面
 *
 * 全保有銘柄の一覧と全体サマリーを表示する。
 */

import { Link } from "react-router-dom";
import { usePortfolio } from "../hooks/useApi";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorMessage } from "../components/common/ErrorMessage";
import { Card } from "../components/common/Card";
import { MoneyDisplay } from "../components/common/MoneyDisplay";
import { PercentageDisplay } from "../components/common/PercentageDisplay";
import { formatUnits } from "../utils/format";

export function PortfolioPage() {
  const { data: portfolio, isLoading, error, refetch } = usePortfolio();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <ErrorMessage
        message="ポートフォリオの取得に失敗しました"
        onRetry={() => void refetch()}
      />
    );
  }

  if (!portfolio) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ポートフォリオ</h1>

      {/* サマリーカード */}
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">投資総額</p>
            <p className="text-xl font-semibold">
              <MoneyDisplay value={portfolio.summary.totalInvestment} />
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">評価額</p>
            <p className="text-xl font-semibold">
              {portfolio.summary.totalCurrentValue !== null ? (
                <MoneyDisplay value={portfolio.summary.totalCurrentValue} />
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">含み損益</p>
            <p className="text-xl font-semibold">
              {portfolio.summary.totalUnrealizedGain !== null ? (
                <MoneyDisplay
                  value={portfolio.summary.totalUnrealizedGain}
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
            <p className="text-xl font-semibold">
              {portfolio.summary.totalUnrealizedGainRate !== null ? (
                <PercentageDisplay
                  value={portfolio.summary.totalUnrealizedGainRate}
                  colorize
                />
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </p>
          </div>
        </div>
      </Card>

      {/* 保有銘柄一覧 */}
      <Card title="保有銘柄">
        {portfolio.holdings.length === 0 ? (
          <p className="text-gray-500">保有銘柄がありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">銘柄名</th>
                  <th className="text-right py-2">保有口数</th>
                  <th className="text-right py-2">平均取得単価</th>
                  <th className="text-right py-2">投資総額</th>
                  <th className="text-right py-2">評価額</th>
                  <th className="text-right py-2">損益</th>
                  <th className="text-right py-2">損益率</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.map((holding) => (
                  <tr key={holding.fundId} className="border-b hover:bg-gray-50">
                    <td className="py-2">
                      <Link
                        to={`/funds/${holding.fundId}`}
                        className="text-blue-600 hover:underline"
                      >
                        {holding.fundName}
                      </Link>
                    </td>
                    <td className="text-right py-2">
                      {formatUnits(holding.totalUnits)}
                    </td>
                    <td className="text-right py-2">
                      <MoneyDisplay value={holding.averageCost} />
                    </td>
                    <td className="text-right py-2">
                      <MoneyDisplay value={holding.totalInvestment} />
                    </td>
                    <td className="text-right py-2">
                      {holding.currentValue !== null ? (
                        <MoneyDisplay value={holding.currentValue} />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="text-right py-2">
                      {holding.unrealizedGain !== null ? (
                        <MoneyDisplay
                          value={holding.unrealizedGain}
                          showSign
                          colorize
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="text-right py-2">
                      {holding.unrealizedGainRate !== null ? (
                        <PercentageDisplay
                          value={holding.unrealizedGainRate}
                          colorize
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
