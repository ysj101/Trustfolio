/**
 * メインアプリケーションコンポーネント
 */

import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { PortfolioPage } from "./pages/PortfolioPage";
import { FundListPage } from "./pages/FundListPage";
import { FundDetailPage } from "./pages/FundDetailPage";
import { RecurringPage } from "./pages/RecurringPage";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* ナビゲーション */}
      <nav className="bg-white shadow mb-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center h-16 gap-8">
            <span className="font-bold text-xl text-blue-600">Trustfolio</span>
            <div className="flex gap-4">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  `px-3 py-2 rounded ${isActive ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"}`
                }
              >
                ポートフォリオ
              </NavLink>
              <NavLink
                to="/funds"
                className={({ isActive }) =>
                  `px-3 py-2 rounded ${isActive ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"}`
                }
              >
                投資信託
              </NavLink>
              <NavLink
                to="/recurring"
                className={({ isActive }) =>
                  `px-3 py-2 rounded ${isActive ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"}`
                }
              >
                積立設定
              </NavLink>
            </div>
          </div>
        </div>
      </nav>

      {/* コンテンツ */}
      <main className="max-w-7xl mx-auto px-4 pb-8">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<PortfolioPage />} />
          <Route path="/funds" element={<FundListPage />} />
          <Route path="/funds/:fundId" element={<FundDetailPage />} />
          <Route path="/recurring" element={<RecurringPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
