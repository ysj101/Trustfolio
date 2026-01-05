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
    expect(result?.remainingInvestment).toBe(20000);
    expect(result?.currentValue).toBe(22500);
    expect(result?.unrealizedGain).toBe(2500);
    expect(result?.unrealizedGainRate).toBe(0.125);
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
    const holdings = [
      {
        fundId: 'fund-001',
        fundName: '日本株インデックス',
        totalUnits: 15000,
        averageCost: 15000,
        totalInvestment: 30000,
        totalSaleAmount: 10000,
        remainingInvestment: 20000,
        currentNavValue: 15000,
        currentNavDate: '2024-03-15',
        currentValue: 22500,
        unrealizedGain: 2500,
        unrealizedGainRate: 0.125,
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
        units: -5000,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-03-10T00:00:00.000Z',
      },
    ];
    const summary = calculatePortfolio(holdings, allTransactions);
    expect(summary.realizedGain).toBe(2500);
    expect(summary.totalUnrealizedGain).toBe(2500);
    expect(summary.totalGain).toBe(5000);
    expect(summary.totalGainRate).toBe(0.1667);
  });
});
