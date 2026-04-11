import { describe, expect, it } from 'vitest';
import { calculateHolding, calculatePortfolio } from '../../src/domain/HoldingCalculator';
import type { Fund, Nav, Transaction } from '../../src/domain/types';

const fund: Fund = {
  id: 'fund-001',
  name: '日本株インデックス',
  rakutenFundId: 'ABCD1234EFGH',
  settlementBusinessDays: 2,
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
    // 検証: currentValueなどがnullになる
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2024-01-10',
        amount: 20000,
        navValue: 10000,
        units: 20000,
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
  });

  it('評価額と損益を最新基準価額から計算する', () => {
    // 前提: 購入と売却が混在する
    // 事前条件: 最新基準価額を設定する
    // 検証: 評価額と損益が残存投資額基準で計算される
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2024-01-10',
        amount: 10000,
        navValue: 10000,
        units: 10000,
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
});

describe('PortfolioCalculator', () => {
  it('評価額が欠損している場合はポートフォリオ評価額をnullで返す', () => {
    // 前提: 保有情報にcurrentValueがnullの銘柄が含まれる
    // 事前条件: 取引履歴は空でも良い
    // 検証: totalCurrentValueと損益関連がnullになる
    const holdings = [
      {
        fundId: 'fund-001',
        fundName: '日本株インデックス',
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

  it('実現損益と未実現損益を合算して総損益を計算する', () => {
    // 前提: 実現損益と未実現損益が発生している
    // 事前条件: 購入と売却の取引履歴を用意する
    // 検証: totalGainとtotalGainRateが計算される
    // 移動平均法でのholdings: remainingInvestment=22,500（簿価ベース）
    const holdings = [
      {
        fundId: 'fund-001',
        fundName: '日本株インデックス',
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
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-03-10T00:00:00.000Z',
      },
    ];
    const summary = calculatePortfolio(holdings, allTransactions);
    // 移動平均法: 売却原価=5,000×(30,000/20,000)=7,500、実現損益=10,000-7,500=2,500
    expect(summary.realizedGain).toBe(2500);
    // remainingInvestment=22,500（holdings合算）、currentValue=22,500 → 未実現損益=0
    expect(summary.totalUnrealizedGain).toBe(0);
    // 総損益 = 実現損益2,500 + 未実現損益0 = 2,500
    expect(summary.totalGain).toBe(2500);
    expect(summary.totalGainRate).toBe(0.0833);
  });
});
