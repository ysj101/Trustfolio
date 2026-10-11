import { describe, expect, it } from 'vite-plus/test';
import { createHoldingUseCase } from '../../src/usecase/HoldingUseCase';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { NavRepository } from '../../src/repository/NavRepository';
import type { TransactionRepository } from '../../src/repository/TransactionRepository';
import type { Fund, Nav, Transaction } from '../../src/domain/types';
import { createEmptyTransactionRepository, ok } from '../fakes';

function createFundRepository(funds: Fund[]): FundRepository {
  return {
    listFunds: () => ok(funds),
    findByName: () => ok(null),
    findById: (id) => ok(funds.find((fund) => fund.id === id) ?? null),
    createFund: () => ok(undefined),
    updateFund: () => ok(undefined),
    updateAssetClass: () => ok(undefined),
  };
}

function createNavRepository(navs: Nav[]): NavRepository {
  return {
    listByFundId: (fundId) => ok(navs.filter((nav) => nav.fundId === fundId)),
    findByFundAndDate: () => ok(null),
    findLatestByFundId: (fundId) =>
      ok(
        navs.filter((nav) => nav.fundId === fundId).sort((a, b) => (a.date < b.date ? 1 : -1))[0] ??
          null
      ),
    findLatestByFundIds: (fundIds) => {
      const map = new Map<string, Nav | null>();
      for (const fundId of fundIds) {
        const latestNav =
          navs
            .filter((nav) => nav.fundId === fundId)
            .sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
        map.set(fundId, latestNav);
      }
      return ok(map);
    },
    createNav: () => ok(undefined),
  };
}

function createTransactionRepository(transactions: Transaction[]): TransactionRepository {
  return {
    listByFundId: (fundId) => ok(transactions.filter((tx) => tx.fundId === fundId)),
    listAll: () => ok([...transactions]),
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
}

describe('HoldingUseCase', () => {
  it('銘柄IDが空の場合はバリデーションエラーになる', () => {
    // 前提: 銘柄IDが空である
    // 事前条件: リポジトリは正常応答する
    // 検証: fundIdフィールドのエラーが返る
    const useCase = createHoldingUseCase(
      createFundRepository([]),
      createNavRepository([]),
      createTransactionRepository([])
    );
    const result = useCase.getHolding('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('fundId');
    }
  });

  it('保有情報が存在する場合は計算結果を返す', () => {
    // 前提: 銘柄・取引・基準価額が存在する
    // 事前条件: 取引が1件以上ある
    // 検証: 保有情報が返る
    const funds: Fund[] = [
      {
        id: 'fund-001',
        name: '国内株式',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: 2,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const navs: Nav[] = [
      {
        fundId: 'fund-001',
        date: '2024-04-01',
        value: 15000,
        createdAt: '2024-04-01T00:00:00.000Z',
      },
    ];
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: 'fund-001',
        type: 'SPOT_PURCHASE',
        date: '2024-03-01',
        amount: 15000,
        navValue: 15000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-03-01T00:00:00.000Z',
      },
    ];
    const useCase = createHoldingUseCase(
      createFundRepository(funds),
      createNavRepository(navs),
      createTransactionRepository(transactions)
    );
    const result = useCase.getHolding('fund-001');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value?.currentValue).toBe(15000);
    }
  });

  it('取引シート未作成の銘柄は基準価額を読まずに保有なしとして成功する', () => {
    // 前提: 銘柄は登録済みだが、取引シートは作成されていない。
    // 事前条件: インメモリシートリポジトリに取引シートを作成せず、本物のTransactionRepositoryを使用する。
    // 検証: getHoldingは内部エラーを返さず保有なしのnullを返し、
    //       かつ結果に使われない基準価額シートの読取を一度も行わない。
    const fund: Fund = {
      id: '国内株式ファンド',
      name: '国内株式インデックス',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
      assetClass: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    let 基準価額の読取回数 = 0;
    const navRepository: NavRepository = {
      ...createNavRepository([]),
      findLatestByFundId: () => {
        基準価額の読取回数 += 1;
        return ok(null);
      },
    };
    const useCase = createHoldingUseCase(
      createFundRepository([fund]),
      navRepository,
      createEmptyTransactionRepository()
    );

    expect(useCase.getHolding(fund.id)).toEqual({ success: true, value: null });
    expect(基準価額の読取回数).toBe(0);
  });

  it('listHoldingsは保有がある銘柄のみ返す', () => {
    // 前提: 取引がない銘柄と取引がある銘柄が混在する
    // 事前条件: 基準価額は片方のみ用意する
    // 検証: 保有がある銘柄のみが返る
    const funds: Fund[] = [
      {
        id: 'fund-001',
        name: '国内株式',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-002',
        name: '海外株式',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-02T00:00:00.000Z',
      },
    ];
    const navs: Nav[] = [
      {
        fundId: 'fund-001',
        date: '2024-04-01',
        value: 14000,
        createdAt: '2024-04-01T00:00:00.000Z',
      },
    ];
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        fundId: 'fund-001',
        type: 'SPOT_PURCHASE',
        date: '2024-03-01',
        amount: 14000,
        navValue: 14000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2024-03-01T00:00:00.000Z',
      },
    ];
    const useCase = createHoldingUseCase(
      createFundRepository(funds),
      createNavRepository(navs),
      createTransactionRepository(transactions)
    );
    const result = useCase.listHoldings();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.fundId).toBe('fund-001');
    }
  });

  it('取引取得に失敗した場合はエラーを返す', () => {
    // 前提: 取引履歴の取得が失敗する
    // 事前条件: fundRepositoryが銘柄を返す
    // 検証: 失敗結果が返る
    const funds: Fund[] = [
      {
        id: 'fund-001',
        name: '国内株式',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const transactionRepository: TransactionRepository = {
      listByFundId: () => ({ success: false, error: { type: 'unexpected', message: '取得失敗' } }),
      listAll: () => ok([]),
      listByFundIdsGrouped: () => ({
        success: false,
        error: { type: 'unexpected', message: '取得失敗' },
      }),
      createTransaction: () => ok(undefined),
      findByIdempotencyKey: () => ok(null),
      findById: () => ok(null),
      updateTransaction: () => ok(undefined),
      deleteTransaction: () => ok(undefined),
    };
    const useCase = createHoldingUseCase(
      createFundRepository(funds),
      createNavRepository([]),
      transactionRepository
    );
    const result = useCase.listHoldings();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('取得失敗');
    }
  });

  it('listHoldingsは取引Mapの銘柄キー欠落をunexpected失敗として返す', () => {
    // 前提: 銘柄一覧に対して取引Mapが対象銘柄のキーを返さない。
    // 事前条件: 一括取得Result自体は成功しているが、Mapの契約を満たさない。
    // 検証: listHoldingsは暗黙に空配列へ補完せずunexpected失敗を返す。
    const fund: Fund = {
      id: '取引Map欠落ファンド',
      name: '取引Map欠落ファンド',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
      assetClass: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const repository = createTransactionRepository([]);
    repository.listByFundIdsGrouped = () => ok(new Map());
    const result = createHoldingUseCase(
      createFundRepository([fund]),
      createNavRepository([]),
      repository
    ).listHoldings();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('unexpected');
  });

  it('listHoldingsは基準価額Mapの銘柄キー欠落をunexpected失敗として返す', () => {
    // 前提: 銘柄一覧と取引Mapは揃っているが、基準価額Mapが対象銘柄のキーを返さない。
    // 事前条件: 基準価額の一括取得Result自体は成功しているが、Mapの契約を満たさない。
    // 検証: listHoldingsは基準価額欠落をunexpected失敗として返す。
    const fund: Fund = {
      id: '基準価額Map欠落ファンド',
      name: '基準価額Map欠落ファンド',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
      assetClass: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const navRepository = createNavRepository([]);
    navRepository.findLatestByFundIds = () => ok(new Map());
    const result = createHoldingUseCase(
      createFundRepository([fund]),
      navRepository,
      createTransactionRepository([])
    ).listHoldings();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('unexpected');
  });
});
