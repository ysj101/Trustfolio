/**
 * TransactionUseCaseとHoldingCalculatorの統合テスト
 *
 * 目的: TransactionUseCaseで作成した売却取引が、HoldingCalculatorで正しく計算されることを検証する
 * 背景: 過去に売却時のunitsの正負に関する不整合により、保有口数が誤って計算されるバグがあった
 */
import { describe, expect, it } from 'vitest';
import { createTransactionUseCase } from '../../src/usecase/TransactionUseCase';
import { calculateHolding, calculatePortfolio } from '../../src/domain/HoldingCalculator';
import type { Fund, Nav, Transaction } from '../../src/domain/types';

// モックリポジトリ: Fundリポジトリ
const createFundRepository = (funds: Fund[]) => ({
  listAll: () => ({ success: true as const, value: funds }),
  findById: (id: string) => ({
    success: true as const,
    value: funds.find((f) => f.id === id) || null,
  }),
  createFund: (fund: Fund) => ({ success: true as const, value: fund }),
  updateFund: (fund: Fund) => ({ success: true as const, value: fund }),
  updateAssetClass: () => ({ success: true as const, value: undefined }),
  deleteFund: (id: string) => ({ success: true as const, value: undefined }),
});

// モックリポジトリ: Transactionリポジトリ
const createTransactionRepository = (initialTransactions: Transaction[]) => {
  let transactionStore = [...initialTransactions];
  return {
    listByFundId: (fundId: string) => ({
      success: true as const,
      value: transactionStore.filter((t) => t.fundId === fundId),
    }),
    findById: (id: string, fundId: string) => ({
      success: true as const,
      value: transactionStore.find((t) => t.id === id && t.fundId === fundId) || null,
    }),
    createTransaction: (transaction: Transaction) => {
      transactionStore.push(transaction);
      return { success: true as const, value: transaction };
    },
    updateTransaction: (transaction: Transaction) => {
      const index = transactionStore.findIndex((t) => t.id === transaction.id);
      if (index >= 0) {
        transactionStore[index] = transaction;
      }
      return { success: true as const, value: transaction };
    },
    deleteTransaction: (id: string) => {
      transactionStore = transactionStore.filter((t) => t.id !== id);
      return { success: true as const, value: undefined };
    },
  };
};

const fund: Fund = {
  id: 'fund-001',
  name: 'テストファンド',
  rakutenFundId: null,
  settlementBusinessDays: 2,
  navSource: null,
  navSourceCode: null,
  assetClass: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const latestNav: Nav = {
  fundId: 'fund-001',
  date: '2024-03-15',
  value: 15000,
  createdAt: '2024-03-15T00:00:00.000Z',
};

describe('TransactionUseCase + HoldingCalculator 統合テスト', () => {
  it('売却取引後の保有口数が正しく計算される', () => {
    // 前提: 購入取引が1件存在する
    // 事前条件: TransactionUseCaseで売却取引を登録する
    // 検証: HoldingCalculatorで保有口数が正しく計算される（売却で減少する）
    const fundRepository = createFundRepository([fund]);
    const transactionRepository = createTransactionRepository([
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
    ]);

    const useCase = createTransactionUseCase(fundRepository, transactionRepository);

    // 売却取引を登録
    const saleResult = useCase.executeSaleTransaction({
      fundId: 'fund-001',
      date: '2024-01-20',
      units: 5000, // ユーザー入力は正の値
      amount: 6000,
      navValue: 12000,
      incomeTax: 150,
      residentTax: 50,
    });

    expect(saleResult.success).toBe(true);
    if (!saleResult.success) return;

    // 売却取引のunitsは正の値で保存される
    expect(saleResult.value.units).toBe(5000);
    expect(saleResult.value.type).toBe('REDEMPTION');

    // HoldingCalculatorで保有情報を計算
    const transactions = transactionRepository.listByFundId('fund-001').value;
    const holding = calculateHolding(fund, transactions, latestNav);

    // 保有口数が正しく計算される（10000口 - 5000口 = 5000口）
    expect(holding).not.toBeNull();
    expect(holding?.totalUnits).toBe(5000);

    // 評価額も正しく計算される（5000口 × 15000 / 10000 = 7500円）
    expect(holding?.currentValue).toBe(7500);

    // 累計投資額と売却額も正しい
    expect(holding?.totalInvestment).toBe(10000);
    expect(holding?.totalSaleAmount).toBe(6000);
    // 税額はポートフォリオ集計で反映される（記録済み税額200円を税引前実現損益1,000円から控除）。
    const summary = calculatePortfolio([], transactions);
    expect(summary.totalTax).toBe(200);
    expect(summary.realizedGainAfterTax).toBe(800);
    // 移動平均法: 購入10,000円/10,000口、売却5,000口の原価=5,000×(10,000/10,000)=5,000
    // 残存簿価 = 10,000 - 5,000 = 5,000
    expect(holding?.remainingInvestment).toBe(5000);
  });

  it('複数回の売却で保有口数が正しく減少する', () => {
    // 前提: 購入取引が1件存在する
    // 事前条件: 2回の売却取引を登録する
    // 検証: 保有口数が売却のたびに減少し、最終的に正しい口数になる
    const fundRepository = createFundRepository([fund]);
    const transactionRepository = createTransactionRepository([
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
    ]);

    const useCase = createTransactionUseCase(fundRepository, transactionRepository);

    // 1回目の売却: 3000口
    const sale1Result = useCase.executeSaleTransaction({
      fundId: 'fund-001',
      date: '2024-01-20',
      units: 3000,
      amount: 3600,
      navValue: 12000,
      incomeTax: 60,
      residentTax: 20,
    });
    expect(sale1Result.success).toBe(true);

    // 2回目の売却: 2000口
    const sale2Result = useCase.executeSaleTransaction({
      fundId: 'fund-001',
      date: '2024-01-25',
      units: 2000,
      amount: 2800,
      navValue: 14000,
      incomeTax: 30,
      residentTax: 10,
    });
    expect(sale2Result.success).toBe(true);

    // HoldingCalculatorで保有情報を計算
    const transactions = transactionRepository.listByFundId('fund-001').value;
    const holding = calculateHolding(fund, transactions, latestNav);

    // 保有口数が正しく計算される（10000口 - 3000口 - 2000口 = 5000口）
    expect(holding).not.toBeNull();
    expect(holding?.totalUnits).toBe(5000);

    // 累計売却額も正しい（3600 + 2800 = 6400円）
    expect(holding?.totalSaleAmount).toBe(6400);
    // 2回の売却で記録した税額（100円 + 20円）がポートフォリオ集計へ反映される。
    expect(calculatePortfolio([], transactions).totalTax).toBe(120);
  });

  it('全口数売却後はnullが返る', () => {
    // 前提: 購入取引が1件存在する
    // 事前条件: 全口数を売却する
    // 検証: HoldingCalculatorがnullを返す（保有なし）
    const fundRepository = createFundRepository([fund]);
    const transactionRepository = createTransactionRepository([
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
    ]);

    const useCase = createTransactionUseCase(fundRepository, transactionRepository);

    // 全口数を売却
    const saleResult = useCase.executeSaleTransaction({
      fundId: 'fund-001',
      date: '2024-01-20',
      units: 10000,
      amount: 12000,
      navValue: 12000,
      incomeTax: 300,
      residentTax: 100,
    });
    expect(saleResult.success).toBe(true);

    // HoldingCalculatorで保有情報を計算
    const transactions = transactionRepository.listByFundId('fund-001').value;
    const holding = calculateHolding(fund, transactions, latestNav);

    // 全口数売却済みなのでnullが返る
    expect(holding).toBeNull();
  });
});
