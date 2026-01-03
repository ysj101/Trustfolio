import { describe, expect, it } from 'vitest';
import { createPortfolioUseCase } from './PortfolioUseCase';
import type { FundRepository } from '../repository/FundRepository';
import type { TransactionRepository } from '../repository/TransactionRepository';
import type { HoldingUseCase } from './HoldingUseCase';
import type { Fund, Transaction } from '../domain/types';
import { ok, fail } from '../test/fakes';

describe('PortfolioUseCase', () => {
  it('保有情報と取引履歴からポートフォリオサマリーを返す', () => {
    // 前提: 銘柄、保有、取引が存在する
    // 事前条件: 保有情報が1件ある
    // 検証: holdingsが返却値に含まれる
    const funds: Fund[] = [
      {
        id: 'fund-001',
        name: '日本株インデックス',
        rakutenFundId: null,
        settlementBusinessDays: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const transactions: Transaction[] = [
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
    ];
    const fundRepository: FundRepository = {
      listFunds: () => ok(funds),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
    };
    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok(transactions),
      listByFundIdsGrouped: (fundIds) => {
        const map = new Map<string, Transaction[]>();
        for (const fundId of fundIds) {
          map.set(
            fundId,
            transactions.filter((tx) => tx.fundId === fundId)
          );
        }
        return ok(map);
      },
      createTransaction: () => ok(undefined),
      findByIdempotencyKey: () => ok(null),
      findById: () => ok(null),
      updateTransaction: () => ok(undefined),
      deleteTransaction: () => ok(undefined),
    };
    const holdingUseCase: HoldingUseCase = {
      getHolding: () => ok(null),
      listHoldings: () =>
        ok([
          {
            fundId: 'fund-001',
            fundName: '日本株インデックス',
            totalUnits: 10000,
            averageCost: 10000,
            totalInvestment: 10000,
            totalSaleAmount: 0,
            remainingInvestment: 10000,
            currentNavValue: 10000,
            currentNavDate: '2024-01-10',
            currentValue: 10000,
            unrealizedGain: 0,
            unrealizedGainRate: 0,
          },
        ]),
    };

    const useCase = createPortfolioUseCase(fundRepository, transactionRepository, holdingUseCase);
    const result = useCase.getPortfolioSummary();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.holdings).toHaveLength(1);
      expect(result.value.totalInvestment).toBe(10000);
    }
  });

  it('銘柄一覧取得に失敗した場合はエラーを返す', () => {
    // 前提: 銘柄一覧の取得が失敗する
    // 事前条件: fundRepositoryがエラーを返す
    // 検証: 失敗結果がそのまま返る
    const fundRepository: FundRepository = {
      listFunds: () => fail('unexpected', '銘柄一覧の取得に失敗しました。'),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
    };
    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      listByFundIdsGrouped: () => ok(new Map()),
      createTransaction: () => ok(undefined),
      findByIdempotencyKey: () => ok(null),
      findById: () => ok(null),
      updateTransaction: () => ok(undefined),
      deleteTransaction: () => ok(undefined),
    };
    const holdingUseCase: HoldingUseCase = {
      getHolding: () => ok(null),
      listHoldings: () => ok([]),
    };

    const useCase = createPortfolioUseCase(fundRepository, transactionRepository, holdingUseCase);
    const result = useCase.getPortfolioSummary();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('失敗');
    }
  });

  it('保有取得に失敗した場合はエラーを返す', () => {
    // 前提: 保有情報の取得が失敗する
    // 事前条件: fundRepositoryは成功する
    // 検証: 失敗結果が返る
    const fundRepository: FundRepository = {
      listFunds: () =>
        ok([
          {
            id: 'fund-1',
            name: '国内株式',
            rakutenFundId: null,
            settlementBusinessDays: null,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ]),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
    };
    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      listByFundIdsGrouped: () => ok(new Map()),
      createTransaction: () => ok(undefined),
      findByIdempotencyKey: () => ok(null),
      findById: () => ok(null),
      updateTransaction: () => ok(undefined),
      deleteTransaction: () => ok(undefined),
    };
    const holdingUseCase: HoldingUseCase = {
      getHolding: () => ok(null),
      listHoldings: () => fail('unexpected', '保有取得に失敗しました。'),
    };

    const useCase = createPortfolioUseCase(fundRepository, transactionRepository, holdingUseCase);
    const result = useCase.getPortfolioSummary();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('失敗');
    }
  });
});
