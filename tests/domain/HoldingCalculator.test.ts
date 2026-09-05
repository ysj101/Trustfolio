import { describe, expect, it } from 'vitest';
import { calculateHolding, calculatePortfolio } from '../../src/domain/HoldingCalculator';
import type { Fund, Nav, Transaction } from '../../src/domain/types';

const fund: Fund = {
  id: 'fund-001',
  name: '日本株インデックス',
  rakutenFundId: 'ABCD1234EFGH',
  settlementBusinessDays: 2,
  navSource: null,
  navSourceCode: null,
  assetClass: 'equity',
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('HoldingCalculator', () => {
  it('取引が存在しない場合はnullを返す', () => {
    // 前提: 取引が1件も存在しない
    // 事前条件: 最新基準価額は未設定でも良い
    // 検証: 保有情報がnullで返る
    const result = calculateHolding(fund, [], null);
    expect(result).toBeNull();
  });

  it('全口数売却済みの場合はnullを返す', () => {
    // 前提: 購入と売却で口数が0以下になる
    // 事前条件: 取引履歴に売却を含める
    // 検証: 保有情報がnullで返る
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2024-01-10',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
      {
        id: 'tx-2',
        fundId: fund.id,
        type: 'REDEMPTION',
        date: '2024-01-20',
        amount: 11000,
        navValue: 11000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-01-20T00:00:00.000Z',
      },
    ];
    const result = calculateHolding(fund, transactions, null);
    expect(result).toBeNull();
  });

  it('最新基準価額がない場合は現在値をnullで返す', () => {
    // 前提: 購入のみで保有が存在する
    // 事前条件: 最新基準価額をnullとする
    // 検証: currentValueなどがnullになり、資産クラスは銘柄から転記される
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2024-01-10',
        amount: 20000,
        navValue: 10000,
        units: 20000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
    ];
    const result = calculateHolding(fund, transactions, null);
    expect(result).not.toBeNull();
    expect(result?.currentValue).toBeNull();
    expect(result?.currentNavValue).toBeNull();
    expect(result?.unrealizedGain).toBeNull();
    expect(result?.assetClass).toBe('equity');
  });

  it('評価額と損益を最新基準価額から計算する', () => {
    // 前提: 購入と売却が混在する
    // 事前条件: 最新基準価額を設定する
    // 検証: 評価額と損益が残存投資額基準で計算され、資産クラスは銘柄から転記される
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2024-01-10',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
      {
        id: 'tx-2',
        fundId: fund.id,
        type: 'RECURRING_PURCHASE',
        date: '2024-02-10',
        amount: 20000,
        navValue: 20000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: 'rec-1',
        idempotencyKey: 'rec-1_2024-02-10',
        createdAt: '2024-02-10T00:00:00.000Z',
      },
      {
        id: 'tx-3',
        fundId: fund.id,
        type: 'REDEMPTION',
        date: '2024-03-10',
        amount: 10000,
        navValue: 20000,
        units: 5000,
        incomeTax: 306,
        residentTax: 100,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-03-10T00:00:00.000Z',
      },
    ];
    const latestNav: Nav = {
      fundId: fund.id,
      date: '2024-03-15',
      value: 15000,
      createdAt: '2024-03-15T00:00:00.000Z',
    };
    const result = calculateHolding(fund, transactions, latestNav);
    expect(result).not.toBeNull();
    expect(result?.totalUnits).toBe(15000);
    // 移動平均法: 簿価30,000、売却5,000口の原価=5,000×(30,000/20,000)=7,500、残存簿価=22,500
    expect(result?.remainingInvestment).toBe(22500);
    expect(result?.currentValue).toBe(22500);
    // NAV 15,000 = 平均取得単価 15,000 なので未実現損益は0
    expect(result?.unrealizedGain).toBe(0);
    expect(result?.unrealizedGainRate).toBe(0);
    expect(result?.assetClass).toBe('equity');
  });

  it('売却後の再購入で移動平均原価が正しく更新される', () => {
    // 前提: 購入→売却→再購入の取引パターン
    // 事前条件: 売却後に異なるNAVで再購入する
    // 検証: 移動平均原価が再購入を反映した値になる
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2024-01-10',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
      {
        id: 'tx-2',
        fundId: fund.id,
        type: 'REDEMPTION',
        date: '2024-02-10',
        amount: 10000,
        navValue: 20000,
        units: 5000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-02-10T00:00:00.000Z',
      },
      {
        id: 'tx-3',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2024-03-10',
        amount: 10000,
        navValue: 20000,
        units: 5000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-03-10T00:00:00.000Z',
      },
    ];
    const latestNav: Nav = {
      fundId: fund.id,
      date: '2024-03-15',
      value: 20000,
      createdAt: '2024-03-15T00:00:00.000Z',
    };
    const result = calculateHolding(fund, transactions, latestNav);
    expect(result).not.toBeNull();
    // 移動平均法:
    // 1. 購入: 簿価=10,000, 口数=10,000, 平均原価=10,000/万口
    // 2. 売却5,000口: 売却原価=5,000×(10,000/10,000)=5,000, 簿価=5,000, 口数=5,000
    // 3. 再購入: 簿価=5,000+10,000=15,000, 口数=10,000, 平均原価=15,000/万口
    expect(result?.totalUnits).toBe(10000);
    expect(result?.averageCost).toBe(15000);
    expect(result?.remainingInvestment).toBe(15000);
    // 評価額: 10,000口 × 20,000 / 10,000 = 20,000
    expect(result?.currentValue).toBe(20000);
    // 未実現損益: 20,000 - 15,000 = 5,000
    expect(result?.unrealizedGain).toBe(5000);
    expect(result?.unrealizedGainRate).toBe(0.3333);
  });

  it('複数回売却で簿価が段階的に減少する', () => {
    // 前提: 1回購入、2回売却
    // 事前条件: 売却ごとに異なるNAVで売却する
    // 検証: 移動平均法による簿価が各売却で正しく減少する
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2024-01-10',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
      {
        id: 'tx-2',
        fundId: fund.id,
        type: 'REDEMPTION',
        date: '2024-02-10',
        amount: 3600,
        navValue: 12000,
        units: 3000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-02-10T00:00:00.000Z',
      },
      {
        id: 'tx-3',
        fundId: fund.id,
        type: 'REDEMPTION',
        date: '2024-03-10',
        amount: 2800,
        navValue: 14000,
        units: 2000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-03-10T00:00:00.000Z',
      },
    ];
    const latestNav: Nav = {
      fundId: fund.id,
      date: '2024-03-15',
      value: 15000,
      createdAt: '2024-03-15T00:00:00.000Z',
    };
    const result = calculateHolding(fund, transactions, latestNav);
    expect(result).not.toBeNull();
    // 移動平均法:
    // 1. 購入: 簿価=10,000, 口数=10,000, 平均原価=1.0円/口
    // 2. 売却3,000口: 売却原価=3,000×1.0=3,000, 簿価=7,000, 口数=7,000
    // 3. 売却2,000口: 売却原価=2,000×1.0=2,000, 簿価=5,000, 口数=5,000
    expect(result?.totalUnits).toBe(5000);
    expect(result?.remainingInvestment).toBe(5000);
    expect(result?.totalSaleAmount).toBe(6400);
    // 評価額: 5,000口 × 15,000 / 10,000 = 7,500
    expect(result?.currentValue).toBe(7500);
    // 未実現損益: 7,500 - 5,000 = 2,500
    expect(result?.unrealizedGain).toBe(2500);
  });

  it('端数が生じる場合にMath.roundで正しく丸められる', () => {
    // 前提: 3口の購入で割り切れない平均取得単価が発生する
    // 事前条件: 異なるNAVでの購入3回 + 売却
    // 検証: remainingInvestmentとaverageCostがMath.roundで丸められる
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2024-01-10',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
      {
        id: 'tx-2',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2024-02-10',
        amount: 10000,
        navValue: 15000,
        units: 6667,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-02-10T00:00:00.000Z',
      },
      {
        id: 'tx-3',
        fundId: fund.id,
        type: 'REDEMPTION',
        date: '2024-03-10',
        amount: 6000,
        navValue: 12000,
        units: 5000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-03-10T00:00:00.000Z',
      },
    ];
    const latestNav: Nav = {
      fundId: fund.id,
      date: '2024-03-15',
      value: 12000,
      createdAt: '2024-03-15T00:00:00.000Z',
    };
    const result = calculateHolding(fund, transactions, latestNav);
    expect(result).not.toBeNull();
    // 移動平均法:
    // 1. 購入: 簿価=10,000, 口数=10,000
    // 2. 購入: 簿価=20,000, 口数=16,667, 平均原価=20,000/16,667≈1.19999...円/口
    // 3. 売却5,000口: 売却原価=5,000×(20,000/16,667)≈5,999.88, 簿価≈14,000.12, 口数=11,667
    // averageCost = Math.round((14000.12/11667) * 10000) = Math.round(11999.8...) = 12000
    // remainingInvestment = Math.round(14000.12) = 14000
    expect(result?.totalUnits).toBe(11667);
    expect(result?.remainingInvestment).toBe(14000);
    expect(result?.averageCost).toBe(12000);
  });

  it('記録済み税額だけを集計してポートフォリオの税引後実現損益を計算する', () => {
    // 前提: 税額記録済みと税額未記録の売却取引が混在する
    // 事前条件: nullは税額未記録であり、明示的な0円へ変換しない
    // 検証: 記録済み税額だけがtotalTaxへ加算され、実現損益から控除される
    const transactions: Transaction[] = [
      {
        id: '購入-税計算',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2026-01-01',
        amount: 100000,
        navValue: 10000,
        units: 100000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '売却-税記録済み',
        fundId: fund.id,
        type: 'REDEMPTION',
        date: '2026-02-01',
        amount: 12000,
        navValue: 12000,
        units: 10000,
        incomeTax: 306,
        residentTax: 100,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
      {
        id: '売却-税未記録',
        fundId: fund.id,
        type: 'REDEMPTION',
        date: '2026-03-01',
        amount: 13000,
        navValue: 13000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ];
    const summary = calculatePortfolio([], transactions);

    expect(summary.totalTax).toBe(406);
    // 実現損益は (12,000 - 10,000) + (13,000 - 10,000) = 5,000円。
    expect(summary.realizedGainAfterTax).toBe(4594);
    // 税額未記録の売却1件がカウントされ、税引後実現損益が参考値であると判別できる
    expect(summary.taxUnrecordedSaleCount).toBe(1);
  });

  it('全売却の税額が記録済みの場合は税未記録件数が0になる', () => {
    // 前提: 売却取引の税額（0円を含む）がすべて記録されている
    // 事前条件: 明示的に記録された0円は「未記録」と区別される
    // 検証: taxUnrecordedSaleCountが0になり、税引後実現損益が完全な値として扱える
    const transactions: Transaction[] = [
      {
        id: '購入-税0円検証',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2026-01-01',
        amount: 100000,
        navValue: 10000,
        units: 100000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '売却-税0円記録済み',
        fundId: fund.id,
        type: 'REDEMPTION',
        date: '2026-02-01',
        amount: 12000,
        navValue: 12000,
        units: 10000,
        incomeTax: 0,
        residentTax: 0,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ];
    const summary = calculatePortfolio([], transactions);

    expect(summary.totalTax).toBe(0);
    expect(summary.taxUnrecordedSaleCount).toBe(0);
    // 実現損益 2,000円 - 税0円 = 2,000円
    expect(summary.realizedGainAfterTax).toBe(2000);
  });

  it('小数の税額でも税引後実現損益は丸め後の税額合計との差で計算される', () => {
    // 前提: 小数の税額（0.25円 + 0.25円 = 0.5円）が記録された売却がある
    // 事前条件: 税額は「0以上の有限数」であり小数も許容される
    // 検証: totalTaxは四捨五入（0.5→1円）され、realizedGainAfterTax = realizedGain - totalTax が厳密に成立する
    const transactions: Transaction[] = [
      {
        id: '購入-小数税額検証',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2026-01-01',
        amount: 100000,
        navValue: 10000,
        units: 100000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '売却-小数税額',
        fundId: fund.id,
        type: 'REDEMPTION',
        date: '2026-02-01',
        amount: 12000,
        navValue: 12000,
        units: 10000,
        incomeTax: 0.25,
        residentTax: 0.25,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ];
    const summary = calculatePortfolio([], transactions);

    // 0.25 + 0.25 = 0.5円 → 四捨五入で1円
    expect(summary.totalTax).toBe(1);
    // 実現損益2,000円 - 丸め後税額1円 = 1,999円（丸め前0.5円を控除した1,999.5円ではない）
    expect(summary.realizedGainAfterTax).toBe(1999);
    expect(summary.realizedGainAfterTax).toBe(summary.realizedGain - summary.totalTax);
  });

  it('片方の税額だけが未記録の売却も税未記録件数に数える', () => {
    // 前提: incomeTaxのみnull（未記録）でresidentTaxは記録済みの売却がある
    // 事前条件: 片側でも未記録なら「税引後実現損益が完全な値でない」と判定する
    // 検証: taxUnrecordedSaleCountが1になり、記録済み側の税額だけがtotalTaxへ加算される
    const transactions: Transaction[] = [
      {
        id: '購入-片側未記録検証',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2026-01-01',
        amount: 100000,
        navValue: 10000,
        units: 100000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '売却-住民税のみ記録',
        fundId: fund.id,
        type: 'REDEMPTION',
        date: '2026-02-01',
        amount: 12000,
        navValue: 12000,
        units: 10000,
        incomeTax: null,
        residentTax: 500,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ];
    const summary = calculatePortfolio([], transactions);

    // 記録済みの住民税500円だけが合算される
    expect(summary.totalTax).toBe(500);
    expect(summary.taxUnrecordedSaleCount).toBe(1);
    // 実現損益 2,000円 - 記録済み税額500円 = 1,500円（参考値）
    expect(summary.realizedGainAfterTax).toBe(1500);
  });
});

describe('PortfolioCalculator', () => {
  it('保有情報と取引が空の場合は実現損益0・売却金額0を返す', () => {
    // 前提: holdingsとallTransactionsが両方とも空
    // 事前条件: なし
    // 検証: 境界条件としてrealizedGain=0, totalSaleAmount=0が返る
    const summary = calculatePortfolio([], []);
    expect(summary.realizedGain).toBe(0);
    expect(summary.totalSaleAmount).toBe(0);
    expect(summary.remainingInvestment).toBe(0);
    expect(summary.totalInvestment).toBe(0);
  });

  it('評価額が欠損している場合はポートフォリオ評価額をnullで返す', () => {
    // 前提: 保有情報にcurrentValueがnullの銘柄が含まれる
    // 事前条件: 取引履歴は空でも良い
    // 検証: totalCurrentValueと損益関連がnullになる
    const holdings = [
      {
        fundId: 'fund-001',
        fundName: '日本株インデックス',
        assetClass: null,
        totalUnits: 10000,
        averageCost: 10000,
        totalInvestment: 10000,
        totalSaleAmount: 0,
        remainingInvestment: 10000,
        currentNavValue: null,
        currentNavDate: null,
        currentValue: null,
        unrealizedGain: null,
        unrealizedGainRate: null,
      },
    ];
    const summary = calculatePortfolio(holdings, []);
    expect(summary.totalCurrentValue).toBeNull();
    expect(summary.totalUnrealizedGain).toBeNull();
    expect(summary.totalGain).toBeNull();
  });

  it('税引後実現損益と未実現損益を合算して総損益を計算する', () => {
    // 前提: 実現損益と未実現損益が発生している
    // 事前条件: 購入と売却の取引履歴を用意する
    // 検証: totalGainとtotalGainRateが計算される
    // 移動平均法でのholdings: remainingInvestment=22,500（簿価ベース）
    const holdings = [
      {
        fundId: 'fund-001',
        fundName: '日本株インデックス',
        assetClass: null,
        totalUnits: 15000,
        averageCost: 15000,
        totalInvestment: 30000,
        totalSaleAmount: 10000,
        remainingInvestment: 22500,
        currentNavValue: 15000,
        currentNavDate: '2024-03-15',
        currentValue: 22500,
        unrealizedGain: 0,
        unrealizedGainRate: 0,
      },
    ];
    const allTransactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: 'fund-001',
        type: 'SPOT_PURCHASE',
        date: '2024-01-10',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
      {
        id: 'tx-2',
        fundId: 'fund-001',
        type: 'RECURRING_PURCHASE',
        date: '2024-02-10',
        amount: 20000,
        navValue: 20000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: 'rec-1',
        idempotencyKey: 'rec-1_2024-02-10',
        createdAt: '2024-02-10T00:00:00.000Z',
      },
      {
        id: 'tx-3',
        fundId: 'fund-001',
        type: 'REDEMPTION',
        date: '2024-03-10',
        amount: 10000,
        navValue: 20000,
        units: 5000,
        incomeTax: 306,
        residentTax: 100,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-03-10T00:00:00.000Z',
      },
    ];
    const summary = calculatePortfolio(holdings, allTransactions);
    // 移動平均法: 売却原価=5,000×(30,000/20,000)=7,500、実現損益=10,000-7,500=2,500
    expect(summary.realizedGain).toBe(2500);
    expect(summary.totalTax).toBe(406);
    expect(summary.realizedGainAfterTax).toBe(2094);
    // remainingInvestment=22,500（holdings合算）、currentValue=22,500 → 未実現損益=0
    expect(summary.totalUnrealizedGain).toBe(0);
    // 総損益 = 税引後実現損益2,094 + 未実現損益0 = 2,094（記録済み税額406円を控除）
    expect(summary.totalGain).toBe(2094);
    expect(summary.totalGainRate).toBe(0.0698);
  });

  it('複数ファンドを保有している場合の実現損益が各ファンド独立で計算される', () => {
    // 前提: ファンドAを安値、ファンドBを高値で購入後、ファンドAを売却
    // 事前条件: calculateRealizedGainがファンドIDで取引を分離している
    // 検証: ファンドAの実現損益にファンドBの高値平均が混入しない
    //
    // 取引内容:
    //   ファンドA: 10,000口 を 10,000円で購入（原価1.0円/口）
    //   ファンドB: 10,000口 を 20,000円で購入（原価2.0円/口）
    //   ファンドA: 5,000口 を 7,500円で売却（NAV=15,000）
    //
    // ファンドAの実現損益（独立計算）:
    //   売却原価 = 5,000 × 1.0 = 5,000
    //   実現損益 = 7,500 - 5,000 = 2,500
    //
    // もしファンドID分離がされていないと（混在計算される誤った挙動）:
    //   混在簿価 = 30,000, 混在口数 = 20,000, 混在平均 = 1.5円/口
    //   売却原価 = 5,000 × 1.5 = 7,500
    //   実現損益 = 7,500 - 7,500 = 0
    const holdings = [
      {
        fundId: 'fund-001',
        fundName: 'ファンドA',
        assetClass: null,
        totalUnits: 5000,
        averageCost: 10000,
        totalInvestment: 10000,
        totalSaleAmount: 7500,
        remainingInvestment: 5000,
        currentNavValue: 15000,
        currentNavDate: '2024-03-15',
        currentValue: 7500,
        unrealizedGain: 2500,
        unrealizedGainRate: 0.5,
      },
      {
        fundId: 'fund-002',
        fundName: 'ファンドB',
        assetClass: null,
        totalUnits: 10000,
        averageCost: 20000,
        totalInvestment: 20000,
        totalSaleAmount: 0,
        remainingInvestment: 20000,
        currentNavValue: 20000,
        currentNavDate: '2024-03-15',
        currentValue: 20000,
        unrealizedGain: 0,
        unrealizedGainRate: 0,
      },
    ];
    const allTransactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: 'fund-001',
        type: 'SPOT_PURCHASE',
        date: '2024-01-10',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-01-10T00:00:00.000Z',
      },
      {
        id: 'tx-2',
        fundId: 'fund-002',
        type: 'SPOT_PURCHASE',
        date: '2024-01-15',
        amount: 20000,
        navValue: 20000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-01-15T00:00:00.000Z',
      },
      {
        id: 'tx-3',
        fundId: 'fund-001',
        type: 'REDEMPTION',
        date: '2024-02-10',
        amount: 7500,
        navValue: 15000,
        units: 5000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-02-10T00:00:00.000Z',
      },
    ];
    const summary = calculatePortfolio(holdings, allTransactions);
    // ファンドAの実現損益が2,500円になる（ファンドBの高値平均が混入しない）
    expect(summary.realizedGain).toBe(2500);
    expect(summary.totalSaleAmount).toBe(7500);
  });
});
