/**
 * 投資信託一覧画面
 *
 * 登録済み投資信託の一覧と新規登録フォームを表示する。
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useFunds, useRegisterFund } from "../hooks/useApi";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorMessage } from "../components/common/ErrorMessage";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { formatDate } from "../utils/format";

export function FundListPage() {
  const { data: funds, isLoading, error, refetch } = useFunds();
  const registerFund = useRegisterFund();

  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("銘柄名を入力してください");
      return;
    }

    registerFund.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          setName("");
        },
        onError: (err) => {
          setFormError(err instanceof Error ? err.message : "登録に失敗しました");
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
        message="投資信託の取得に失敗しました"
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">投資信託</h1>

      {/* 新規登録フォーム */}
      <Card title="新規登録">
        <form onSubmit={handleSubmit} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">銘柄名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: eMAXIS Slim 全世界株式"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button type="submit" loading={registerFund.isPending}>
            登録
          </Button>
        </form>
        {formError && (
          <p className="text-red-600 text-sm mt-2">{formError}</p>
        )}
      </Card>

      {/* 投資信託一覧 */}
      <Card title="登録済み銘柄">
        {!funds || funds.length === 0 ? (
          <p className="text-gray-500">投資信託が登録されていません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">銘柄名</th>
                  <th className="text-right py-2">登録日</th>
                </tr>
              </thead>
              <tbody>
                {funds.map((fund) => (
                  <tr key={fund.id} className="border-b hover:bg-gray-50">
                    <td className="py-2">
                      <Link
                        to={`/funds/${fund.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {fund.name}
                      </Link>
                    </td>
                    <td className="text-right py-2">
                      {formatDate(fund.createdAt.split("T")[0] ?? fund.createdAt)}
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
