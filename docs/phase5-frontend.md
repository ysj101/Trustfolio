# Phase 5: フロントエンド

## 概要

React + Viteでフロントエンドを構築する。投資信託の管理、取引登録、ポートフォリオ表示を実現する。

## 実装項目

### 1. プロジェクト設定

#### 1.1 Vite + React セットアップ

```bash
# webディレクトリにフロントエンドプロジェクト作成
pnpm create vite web --template react-ts
cd web
pnpm install
```

**追加パッケージ:**
```bash
pnpm add @tanstack/react-query axios
pnpm add -D @types/node
```

| パッケージ | 用途 |
|-----------|------|
| @tanstack/react-query | サーバー状態管理 |
| axios | HTTPクライアント |

#### 1.2 ディレクトリ構造

```
web/
├── src/
│   ├── api/
│   │   ├── client.ts         # axios設定
│   │   ├── funds.ts          # Fund API
│   │   ├── navs.ts           # NAV API
│   │   ├── transactions.ts   # Transaction API
│   │   ├── recurring.ts      # RecurringPurchase API
│   │   └── portfolio.ts      # Portfolio API
│   ├── components/
│   │   ├── common/           # 共通コンポーネント
│   │   ├── fund/             # 投資信託関連
│   │   ├── transaction/      # 取引関連
│   │   └── portfolio/        # ポートフォリオ関連
│   ├── pages/
│   │   ├── FundListPage.tsx
│   │   ├── FundDetailPage.tsx
│   │   ├── TransactionPage.tsx
│   │   ├── RecurringPage.tsx
│   │   └── PortfolioPage.tsx
│   ├── hooks/
│   │   └── useApi.ts         # React Query hooks
│   ├── types/
│   │   └── api.ts            # API型定義
│   ├── utils/
│   │   └── format.ts         # 金額・日付フォーマット
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── vite.config.ts
└── package.json
```

### 2. APIクライアント

#### 2.1 axios設定 (`src/api/client.ts`)

```typescript
import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// エラーハンドリング
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // エラーレスポンスの統一処理
    return Promise.reject(error);
  }
);
```

#### 2.2 API関数例 (`src/api/funds.ts`)

```typescript
import { apiClient } from "./client";
import type { Fund, RegisterFundInput } from "../types/api";

export const fundsApi = {
  list: async (): Promise<Fund[]> => {
    const response = await apiClient.get<{ funds: Fund[] }>("/funds");
    return response.data.funds;
  },

  register: async (input: RegisterFundInput): Promise<Fund> => {
    const response = await apiClient.post<Fund>("/funds", input);
    return response.data;
  },
};
```

#### 2.3 React Query hooks (`src/hooks/useApi.ts`)

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fundsApi } from "../api/funds";

export function useFunds() {
  return useQuery({
    queryKey: ["funds"],
    queryFn: fundsApi.list,
  });
}

export function useRegisterFund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fundsApi.register,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funds"] });
    },
  });
}
```

### 3. 画面実装

#### 3.1 投資信託一覧画面 (`FundListPage.tsx`)

**機能:**
- 登録済み投資信託の一覧表示
- 新規登録フォーム
- 詳細画面へのリンク

**表示項目:**
| 項目 | 形式 |
|------|------|
| 銘柄名 | テキスト |
| 登録日 | YYYY/MM/DD |
| 最新基準価額 | ¥XX,XXX |
| 最新NAV日付 | YYYY/MM/DD |

#### 3.2 投資信託詳細画面 (`FundDetailPage.tsx`)

**機能:**
- 基本情報表示
- 基準価額履歴（テーブル + グラフ）
- 取引履歴
- 保有情報

**セクション:**
1. **基本情報**: 銘柄名、登録日
2. **保有状況**: 保有口数、平均取得単価、評価額、損益
3. **基準価額推移**: 折れ線グラフ
4. **取引履歴**: テーブル

#### 3.3 取引登録画面 (`TransactionPage.tsx`)

**機能:**
- スポット購入フォーム
- 取引履歴表示

**フォーム項目:**
| 項目 | 入力形式 | バリデーション |
|------|---------|---------------|
| 投資信託 | セレクト | 必須 |
| 購入日 | 日付ピッカー | 必須、NAV登録済み |
| 購入金額 | 数値入力 | 必須、正の整数 |
| 手数料 | 数値入力 | 任意、0以上 |

#### 3.4 積立設定画面 (`RecurringPage.tsx`)

**機能:**
- 積立設定一覧
- 新規設定フォーム
- 一括実行ボタン

**フォーム項目:**
| 項目 | 入力形式 | バリデーション |
|------|---------|---------------|
| 投資信託 | セレクト | 必須 |
| 月額 | 数値入力 | 必須、正の整数 |
| 実行日 | セレクト(1-28) | 必須 |
| 開始日 | 日付ピッカー | 必須 |
| 終了日 | 日付ピッカー | 任意 |

#### 3.5 ポートフォリオ画面 (`PortfolioPage.tsx`)

**機能:**
- 保有銘柄一覧
- 全体サマリー
- 評価額推移グラフ（オプション）

**表示項目:**
| 項目 | 形式 |
|------|------|
| 銘柄名 | テキスト |
| 保有口数 | XX,XXX口 |
| 平均取得単価 | ¥XX,XXX |
| 評価額 | ¥XX,XXX |
| 損益 | ±¥XX,XXX（色分け） |
| 損益率 | ±XX.XX%（色分け） |

### 4. 共通コンポーネント

#### 4.1 金額表示 (`MoneyDisplay.tsx`)

```typescript
type Props = {
  value: number;
  showSign?: boolean;  // +/-表示
  colorize?: boolean;  // 損益色分け
};

function MoneyDisplay({ value, showSign, colorize }: Props) {
  const formatted = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(Math.abs(value));

  const sign = value >= 0 ? "+" : "-";
  const color = colorize
    ? value >= 0 ? "text-green-600" : "text-red-600"
    : "";

  return (
    <span className={color}>
      {showSign && sign}{formatted}
    </span>
  );
}
```

#### 4.2 ローディング状態 (`LoadingSpinner.tsx`)

```typescript
function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center p-4">
      <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent" />
    </div>
  );
}
```

#### 4.3 エラー表示 (`ErrorMessage.tsx`)

```typescript
type Props = {
  message: string;
  onRetry?: () => void;
};

function ErrorMessage({ message, onRetry }: Props) {
  return (
    <div className="bg-red-50 border border-red-200 rounded p-4">
      <p className="text-red-700">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-red-600 underline">
          再試行
        </button>
      )}
    </div>
  );
}
```

### 5. グラフ表示

#### 5.1 基準価額推移グラフ

**ライブラリ候補:**
- Recharts（推奨）
- Chart.js + react-chartjs-2
- Visx

```bash
pnpm add recharts
```

**実装例:**
```typescript
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type NavChartProps = {
  data: { date: string; value: number }[];
};

function NavChart({ data }: NavChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <XAxis dataKey="date" />
        <YAxis domain={["auto", "auto"]} />
        <Tooltip formatter={(value) => `¥${value.toLocaleString()}`} />
        <Line type="monotone" dataKey="value" stroke="#3b82f6" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### 6. Vite設定

#### 6.1 プロキシ設定 (`vite.config.ts`)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
```

### 7. スタイリング

**選択肢:**
1. **Tailwind CSS**（推奨）
2. CSS Modules
3. styled-components

```bash
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

## 完了条件

- [ ] `pnpm dev` でフロントエンド開発サーバー起動
- [ ] 投資信託一覧・詳細画面が表示される
- [ ] 取引登録が動作する
- [ ] ポートフォリオ画面で保有情報が表示される
- [ ] 基準価額グラフが表示される
- [ ] ローディング・エラー状態が適切に表示される
