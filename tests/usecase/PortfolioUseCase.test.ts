import { describe, expect, it } from 'vitest';
import { createPortfolioUseCase } from '../../src/usecase/PortfolioUseCase';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { TransactionRepository } from '../../src/repository/TransactionRepository';
import type { PerformanceRepository } from '../../src/repository/PerformanceRepository';
import type { HoldingUseCase } from '../../src/usecase/HoldingUseCase';
import type { Fund, Transaction } from '../../src/domain/types';
import { ok, fail } from '../fakes';

/**
 * 実績リポジトリを呼び出さないテスト用の最小実装です。
 * 前提: 対象テストはポートフォリオ集計だけを検証し、実績取得を行いません。
 * 検証: 想定外に実績リポジトリが呼ばれた場合は、暗黙に成功させず Result 型の失敗
 *       （unexpected）を返して直ちに失敗させます（リポジトリ規約により throw は使いません）。
 */
const unexpectedCall = () =>
  fail<never>('unexpected', 'このテストでは実績リポジトリは呼び出されない想定です');
const unusedPerformanceRepository: PerformanceRepository = {
  createPerformance: unexpectedCall,
  createGlobalPerformance: unexpectedCall,
  findByFundAndDate: unexpectedCall,
  findGlobalByDate: unexpectedCall,
  findLatestByFundId: unexpectedCall,
  listGlobalHistory: unexpectedCall,
  findGlobalByDateRange: unexpectedCall,
  findByFundAndDateRange: unexpectedCall,
};

describe('PortfolioUseCase', () => {
  it('保有情報と取引履歴からポートフォリオサマリーを返す', () => {
    // 前提: 銘柄、保有、取引が存在する
    // 事前条件: 保有情報が1件ある
    // 検証: holdingsが返却値に含まれ、assetClassSummariesでnull資産クラスが未設定区分になる
    const funds: Fund[] = [
      {
        id: 'fund-001',
        name: '日本株インデックス',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
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
        incomeTax: null,
        residentTax: null,
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
      updateAssetClass: () => ok(undefined),
    };
    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listByFundIdAllowingMissingSheet: () => ok([]),
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
            assetClass: null,
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

    const useCase = createPortfolioUseCase(
      fundRepository,
      transactionRepository,
      holdingUseCase,
      unusedPerformanceRepository
    );
    const result = useCase.getPortfolioSummary();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.holdings).toHaveLength(1);
      expect(result.value.totalInvestment).toBe(10000);
      // 未設定の銘柄が未設定区分として集計されることを検証する。
      expect(result.value.assetClassSummaries).toHaveLength(1);
      expect(result.value.assetClassSummaries[0]).toMatchObject({
        assetClass: null,
        remainingInvestment: 10000,
        holdingCount: 1,
      });
    }
  });

  it('銘柄の資産クラス別にポートフォリオサマリーを返す', () => {
    // 前提: 株式、金、未設定の銘柄と、それぞれの保有情報・取引履歴が存在する
    // 事前条件: 各銘柄にSPOT_PURCHASEが1件あり、評価額は順に10,000円、20,000円、30,000円である
    // 検証: FundRepositoryのassetClassを経由した区分順とAssetClassSummaryの全フィールドが正しい。
    const funds: Fund[] = [
      {
        id: 'fund-equity',
        name: 'eMAXIS Slim 全世界株式',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: 'equity',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-gold',
        name: 'SBI・iシェアーズ・ゴールドファンド',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: 'gold',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-unset',
        name: 'たわらノーロード先進国株式',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const transactions: Transaction[] = funds.map((fund, index) => {
      const amount = (index + 1) * 10000;
      return {
        id: `tx-${fund.id}`,
        fundId: fund.id,
        type: 'SPOT_PURCHASE',
        date: '2024-01-10',
        amount,
        navValue: amount,
        units: amount,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-01-10T00:00:00.000Z',
      };
    });
    const fundRepository: FundRepository = {
      listFunds: () => ok(funds),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
      updateAssetClass: () => ok(undefined),
    };
    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listByFundIdAllowingMissingSheet: () => ok([]),
      listAll: () => ok(transactions),
      listByFundIdsGrouped: (fundIds) => {
        const map = new Map<string, Transaction[]>();
        for (const fundId of fundIds) {
          map.set(
            fundId,
            transactions.filter((transaction) => transaction.fundId === fundId)
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
        ok(
          funds.map((fund, index) => {
            const value = (index + 1) * 10000;
            return {
              fundId: fund.id,
              fundName: fund.name,
              assetClass: fund.assetClass,
              totalUnits: value,
              averageCost: value,
              totalInvestment: value,
              totalSaleAmount: 0,
              remainingInvestment: value,
              currentNavValue: value,
              currentNavDate: '2024-01-10',
              currentValue: value,
              unrealizedGain: 0,
              unrealizedGainRate: 0,
            };
          })
        ),
    };

    const useCase = createPortfolioUseCase(
      fundRepository,
      transactionRepository,
      holdingUseCase,
      unusedPerformanceRepository
    );
    const result = useCase.getPortfolioSummary();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.assetClassSummaries).toHaveLength(3);
      expect(result.value.assetClassSummaries.map((summary) => summary.assetClass)).toEqual([
        'equity',
        'gold',
        null,
      ]);
      // 各銘柄の投入額・評価額は1万円、2万円、3万円で損益は0円。
      // 構成比は評価額合計6万円に対する各評価額の比率を小数第4位まで丸めた値です。
      expect(result.value.assetClassSummaries).toEqual([
        {
          assetClass: 'equity',
          totalInvestment: 10000,
          totalSaleAmount: 0,
          realizedGain: 0,
          totalTax: 0,
          realizedGainAfterTax: 0,
          taxUnrecordedSaleCount: 0,
          remainingInvestment: 10000,
          totalCurrentValue: 10000,
          totalUnrealizedGain: 0,
          totalUnrealizedGainRate: 0,
          totalGain: 0,
          totalGainRate: 0,
          holdingCount: 1,
          allocationRate: 0.1667,
        },
        {
          assetClass: 'gold',
          totalInvestment: 20000,
          totalSaleAmount: 0,
          realizedGain: 0,
          totalTax: 0,
          realizedGainAfterTax: 0,
          taxUnrecordedSaleCount: 0,
          remainingInvestment: 20000,
          totalCurrentValue: 20000,
          totalUnrealizedGain: 0,
          totalUnrealizedGainRate: 0,
          totalGain: 0,
          totalGainRate: 0,
          holdingCount: 1,
          allocationRate: 0.3333,
        },
        {
          assetClass: null,
          totalInvestment: 30000,
          totalSaleAmount: 0,
          realizedGain: 0,
          totalTax: 0,
          realizedGainAfterTax: 0,
          taxUnrecordedSaleCount: 0,
          remainingInvestment: 30000,
          totalCurrentValue: 30000,
          totalUnrealizedGain: 0,
          totalUnrealizedGainRate: 0,
          totalGain: 0,
          totalGainRate: 0,
          holdingCount: 1,
          allocationRate: 0.5,
        },
      ]);
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
      updateAssetClass: () => ok(undefined),
    };
    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listByFundIdAllowingMissingSheet: () => ok([]),
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

    const useCase = createPortfolioUseCase(
      fundRepository,
      transactionRepository,
      holdingUseCase,
      unusedPerformanceRepository
    );
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
            navSource: null,
            navSourceCode: null,
            assetClass: null,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ]),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
      updateAssetClass: () => ok(undefined),
    };
    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listByFundIdAllowingMissingSheet: () => ok([]),
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

    const useCase = createPortfolioUseCase(
      fundRepository,
      transactionRepository,
      holdingUseCase,
      unusedPerformanceRepository
    );
    const result = useCase.getPortfolioSummary();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('失敗');
    }
  });
});
