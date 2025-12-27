/**
 * ポートフォリオユースケース結合テスト
 *
 * 前提条件:
 * - SQLiteインメモリDBを使用
 *
 * 検証シナリオ:
 * - 複数銘柄の集計
 * - 一部NAVなしの銘柄がある場合
 * - 1年間の積立実行シナリオ
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase, runMigrations } from "../../infrastructure/database/client.js";
import { createRepositories } from "../../infrastructure/repositories/index.js";
import { registerFund } from "../fund/register-fund.js";
import { registerNav } from "../nav/register-nav.js";
import { executeSpotPurchase } from "../transaction/execute-spot-purchase.js";
import { registerRecurringPurchase } from "../recurring/register-recurring-purchase.js";
import { executeRecurringPurchases } from "../recurring/execute-recurring-purchases.js";
import { getPortfolioSummary } from "./get-portfolio-summary.js";

describe("ポートフォリオユースケース結合テスト", () => {
  let repos: ReturnType<typeof createRepositories>;

  beforeEach(() => {
    // 各テストで新しいインメモリDBを作成
    const db = createTestDatabase();
    runMigrations(db);
    repos = createRepositories(db);
  });

  describe("getPortfolioSummary", () => {
    it("投資信託がない場合、空のポートフォリオを返す", async () => {
      // 実行
      const result = await getPortfolioSummary(repos);

      // 検証
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.portfolio.holdings).toHaveLength(0);
      expect(output.portfolio.totalUnrealizedGain).toBe(0);
    });

    it("複数銘柄のポートフォリオを正しく集計できる", async () => {
      // 準備: 2つの投資信託を登録
      const fund1Result = await registerFund(repos.fund, { name: "ファンドA" });
      const fund1Id = fund1Result._unsafeUnwrap().fund.id;

      const fund2Result = await registerFund(repos.fund, { name: "ファンドB" });
      const fund2Id = fund2Result._unsafeUnwrap().fund.id;

      // 準備: NAV登録
      await registerNav(repos, { fundId: fund1Id, date: "2024-03-15", value: 10000 });
      await registerNav(repos, { fundId: fund2Id, date: "2024-03-15", value: 12000 });

      // 準備: 取引
      await executeSpotPurchase(repos, { fundId: fund1Id, date: "2024-03-15", amount: 10000 });
      await executeSpotPurchase(repos, { fundId: fund2Id, date: "2024-03-15", amount: 20000 });

      // 実行
      const result = await getPortfolioSummary(repos);

      // 検証
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.portfolio.holdings).toHaveLength(2);
      // 投資総額 = 10,000 + 20,000 = 30,000円
      expect(typeof output.portfolio.totalInvestment).toBe("number");
    });

    it("取引がない銘柄はポートフォリオに含まれない", async () => {
      // 準備: 2つの投資信託を登録（片方は取引なし）
      const fund1Result = await registerFund(repos.fund, { name: "ファンドA" });
      const fund1Id = fund1Result._unsafeUnwrap().fund.id;

      await registerFund(repos.fund, { name: "ファンドB（取引なし）" });

      // 準備: NAV登録（fund1のみ）
      await registerNav(repos, { fundId: fund1Id, date: "2024-03-15", value: 10000 });

      // 準備: 取引（fund1のみ）
      await executeSpotPurchase(repos, { fundId: fund1Id, date: "2024-03-15", amount: 10000 });

      // 実行
      const result = await getPortfolioSummary(repos);

      // 検証
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      // 取引があるfund1のみがポートフォリオに含まれる
      expect(output.portfolio.holdings).toHaveLength(1);
    });
  });

  describe("1年間積立シナリオ", () => {
    it("1年間の積立実行後、ポートフォリオが正しく計算される", async () => {
      // 準備: 投資信託登録
      const fundResult = await registerFund(repos.fund, { name: "テストファンド" });
      const fundId = fundResult._unsafeUnwrap().fund.id;

      // 準備: 積立設定（毎月1日、10,000円）
      await registerRecurringPurchase(repos, {
        fundId,
        monthlyAmount: 10000,
        executionDay: 1,
        startDate: "2024-01-01",
      });

      // 準備: 12ヶ月分のNAV登録（変動あり）
      const navValues = [10000, 10500, 9800, 10200, 10400, 10100, 9900, 10300, 10600, 10800, 10500, 10700];
      for (let month = 1; month <= 12; month++) {
        const dateStr = `2024-${String(month).padStart(2, "0")}-01`;
        // navValues配列は0-indexedなのでmonth-1
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await registerNav(repos, { fundId, date: dateStr, value: navValues[month - 1]! });
      }

      // 実行: 12ヶ月分の積立実行
      for (let month = 1; month <= 12; month++) {
        const dateStr = `2024-${String(month).padStart(2, "0")}-01`;
        await executeRecurringPurchases(repos, { targetDate: dateStr });
      }

      // 検証: ポートフォリオ取得
      const result = await getPortfolioSummary(repos);

      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();

      // 検証: 保有銘柄が1つあること
      expect(output.portfolio.holdings).toHaveLength(1);
      expect(output.portfolio.holdings[0]).toBeDefined();

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const holding = output.portfolio.holdings[0]!;

      // 検証: 保有口数が正の値であること
      expect(typeof holding.totalUnits).toBe("number");

      // 検証: 投資総額が正しいこと
      // 投資総額 = 10,000円 × 12ヶ月 = 120,000円
      expect(typeof holding.totalInvestment).toBe("number");

      // 検証: 評価額・損益が計算されていること
      expect(holding.currentValue).not.toBeNull();
      expect(holding.unrealizedGain).not.toBeNull();
      expect(holding.unrealizedGainRate).not.toBeNull();
    });
  });
});
