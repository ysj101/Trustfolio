/**
 * 積立設定画面
 *
 * 積立設定の一覧と新規登録、一括実行機能を提供する。
 */

import { useState } from "react";
import {
  useFunds,
  useRecurringPurchases,
  useRegisterRecurringPurchase,
  useExecuteRecurringPurchases,
} from "../hooks/useApi";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorMessage } from "../components/common/ErrorMessage";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { MoneyDisplay } from "../components/common/MoneyDisplay";
import { formatDate } from "../utils/format";

export function RecurringPage() {
  const { data: funds } = useFunds();
  const {
    data: recurringPurchases,
    isLoading,
    error,
    refetch,
  } = useRecurringPurchases();
  const registerRecurring = useRegisterRecurringPurchase();
  const executeRecurring = useExecuteRecurringPurchases();

  // 登録フォーム
  const [fundId, setFundId] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [executionDay, setExecutionDay] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // 実行フォーム
  const [targetDate, setTargetDate] = useState("");
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [executeResult, setExecuteResult] = useState<{
    executed: number;
    skipped: number;
  } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fundId || !monthlyAmount || !startDate) {
      setFormError("必須項目を入力してください");
      return;
    }

    registerRecurring.mutate(
      {
        fundId,
        monthlyAmount: Number(monthlyAmount),
        executionDay: Number(executionDay),
        startDate,
        ...(endDate && { endDate }),
      },
      {
        onSuccess: () => {
          setFundId("");
          setMonthlyAmount("");
          setExecutionDay("1");
          setStartDate("");
          setEndDate("");
        },
        onError: (err) => {
          setFormError(err instanceof Error ? err.message : "登録に失敗しました");
        },
      }
    );
  };

  const handleExecute = () => {
    setExecuteError(null);
    setExecuteResult(null);

    if (!targetDate) {
      setExecuteError("実行日を入力してください");
      return;
    }

    executeRecurring.mutate(
      { targetDate },
      {
        onSuccess: (result) => {
          setExecuteResult(result);
        },
        onError: (err) => {
          setExecuteError(err instanceof Error ? err.message : "実行に失敗しました");
        },
      }
    );
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <ErrorMessage
        message="積立設定の取得に失敗しました"
        onRetry={() => void refetch()}
      />
    );
  }

  // 日付選択用の配列（1-28）
  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">積立設定</h1>

      {/* 一括実行 */}
      <Card title="積立一括実行">
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-sm text-gray-600 mb-1">実行日</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button onClick={handleExecute} loading={executeRecurring.isPending}>
            実行
          </Button>
        </div>
        {executeError && (
          <p className="text-red-600 text-sm mt-2">{executeError}</p>
        )}
        {executeResult && (
          <p className="text-green-600 text-sm mt-2">
            実行完了: {executeResult.executed}件実行、{executeResult.skipped}件スキップ
          </p>
        )}
      </Card>

      {/* 新規登録フォーム */}
      <Card title="新規登録">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                投資信託 <span className="text-red-500">*</span>
              </label>
              <select
                value={fundId}
                onChange={(e) => setFundId(e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">選択してください</option>
                {funds?.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                月額（円） <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(e.target.value)}
                placeholder="10000"
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                実行日 <span className="text-red-500">*</span>
              </label>
              <select
                value={executionDay}
                onChange={(e) => setExecutionDay(e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {days.map((day) => (
                  <option key={day} value={day}>
                    毎月{day}日
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                開始日 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                終了日（任意）
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <Button type="submit" loading={registerRecurring.isPending}>
            登録
          </Button>
        </form>
        {formError && <p className="text-red-600 text-sm mt-2">{formError}</p>}
      </Card>

      {/* 積立設定一覧 */}
      <Card title="積立設定一覧">
        {!recurringPurchases || recurringPurchases.length === 0 ? (
          <p className="text-gray-500">積立設定がありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">投資信託</th>
                  <th className="text-right py-2">月額</th>
                  <th className="text-center py-2">実行日</th>
                  <th className="text-center py-2">開始日</th>
                  <th className="text-center py-2">終了日</th>
                  <th className="text-center py-2">状態</th>
                </tr>
              </thead>
              <tbody>
                {recurringPurchases.map((rp) => {
                  const fund = funds?.find((f) => f.id === rp.fundId);
                  return (
                    <tr key={rp.id} className="border-b">
                      <td className="py-2">{fund?.name ?? rp.fundId}</td>
                      <td className="text-right py-2">
                        <MoneyDisplay value={rp.monthlyAmount} />
                      </td>
                      <td className="text-center py-2">毎月{rp.executionDay}日</td>
                      <td className="text-center py-2">
                        {formatDate(rp.startDate)}
                      </td>
                      <td className="text-center py-2">
                        {rp.endDate ? formatDate(rp.endDate) : "無期限"}
                      </td>
                      <td className="text-center py-2">
                        {rp.isActive ? (
                          <span className="text-green-600">アクティブ</span>
                        ) : (
                          <span className="text-gray-400">停止中</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
