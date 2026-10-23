import { describe, expect, it } from 'vite-plus/test';
import { createRecurringUseCase } from '../../src/usecase/RecurringUseCase';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { NavRepository } from '../../src/repository/NavRepository';
import type { RecurringPurchaseRepository } from '../../src/repository/RecurringPurchaseRepository';
import type { TransactionRepository } from '../../src/repository/TransactionRepository';
import type { Fund, Nav, RecurringPurchase, Transaction } from '../../src/domain/types';
import { ok, fail } from '../fakes';

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
    findLatestByFundId: () => ok(null),
    createNav: () => ok(undefined),
  };
}

function createRecurringRepository(seed: RecurringPurchase[]): RecurringPurchaseRepository {
  const recurrings = [...seed];
  return {
    listAll: () => ok([...recurrings]),
    listActive: () => ok(recurrings.filter((item) => item.isActive)),
    createRecurringPurchase: (recurring) => {
      recurrings.push(recurring);
      return ok(undefined);
    },
    findById: (recurringId) => ok(recurrings.find((item) => item.id === recurringId) ?? null),
    updateRecurringPurchase: (recurring) => {
      const index = recurrings.findIndex((item) => item.id === recurring.id);
      if (index === -1) {
        return fail('not_found', `対象の積立設定が見つかりません: id=${recurring.id}`);
      }
      recurrings[index] = recurring;
      return ok(undefined);
    },
    deleteRecurringPurchase: (recurringId) => {
      const index = recurrings.findIndex((item) => item.id === recurringId);
      if (index === -1) {
        return fail('not_found', `対象の積立設定が見つかりません: id=${recurringId}`);
      }
      recurrings.splice(index, 1);
      return ok(undefined);
    },
  };
}

function createTransactionRepository(seed: Transaction[]): TransactionRepository {
  const transactions = [...seed];
  return {
    listByFundId: (fundId) => ok(transactions.filter((tx) => tx.fundId === fundId)),
    listAll: (fundIds) => ok(transactions.filter((tx) => fundIds.includes(tx.fundId))),
    createTransaction: (transaction) => {
      transactions.push(transaction);
      return ok(undefined);
    },
    findByIdempotencyKey: (idempotencyKey) =>
      ok(transactions.find((tx) => tx.idempotencyKey === idempotencyKey) ?? null),
    findById: () => ok(null),
    updateTransaction: () => ok(undefined),
    deleteTransaction: () => ok(undefined),
  };
}

describe('RecurringUseCase', () => {
  it('終了日が開始日より前の場合はバリデーションエラーになる', () => {
    // 前提: 終了日が開始日より前である
    // 事前条件: 銘柄IDは有効である
    // 検証: endDateフィールドのエラーが返る
    const useCase = createRecurringUseCase(
      createFundRepository([]),
      createNavRepository([]),
      createRecurringRepository([]),
      createTransactionRepository([])
    );
    const result = useCase.createRecurringPurchase({
      fundId: 'fund-001',
      monthlyAmount: 10000,
      executionDay: 10,
      startDate: '2024-03-10',
      endDate: '2024-03-01',
      isActive: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('endDate');
    }
  });

  it('積立実行時に成功・スキップ理由が集計される', () => {
    // 前提: 実行対象・非アクティブ・重複・非対象日の積立が混在する
    // 事前条件: 3/1, 3/4が営業日、executionDay=1で3/1注文→3/4約定
    // 検証: 3/4に実行すると成功1件と各スキップ理由が返る
    const funds: Fund[] = [
      {
        id: 'fund-001',
        name: '国内株式',
        rakutenFundId: null,
        settlementBusinessDays: 1,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const navs: Nav[] = [
      {
        fundId: 'fund-001',
        date: '2024-03-01',
        value: 10000,
        createdAt: '2024-03-01T00:00:00.000Z',
      },
      {
        fundId: 'fund-001',
        date: '2024-03-04',
        value: 10500,
        createdAt: '2024-03-04T00:00:00.000Z',
      },
    ];
    const recurrings: RecurringPurchase[] = [
      {
        id: 'rec-success',
        fundId: 'fund-001',
        monthlyAmount: 10000,
        executionDay: 1,
        startDate: '2024-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'rec-inactive',
        fundId: 'fund-001',
        monthlyAmount: 10000,
        executionDay: 1,
        startDate: '2024-01-01',
        endDate: null,
        isActive: false,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'rec-duplicate',
        fundId: 'fund-001',
        monthlyAmount: 10000,
        executionDay: 1,
        startDate: '2024-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'rec-not-target',
        fundId: 'fund-001',
        monthlyAmount: 10000,
        executionDay: 20,
        startDate: '2024-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const existingTransactions: Transaction[] = [
      {
        id: 'tx-dup',
        fundId: 'fund-001',
        type: 'RECURRING_PURCHASE',
        date: '2024-03-04',
        amount: 10000,
        navValue: 10500,
        units: 9524,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: 'rec-duplicate',
        idempotencyKey: 'rec-duplicate_2024-03-01',
        createdAt: '2024-03-04T00:00:00.000Z',
      },
    ];

    const useCase = createRecurringUseCase(
      createFundRepository(funds),
      createNavRepository(navs),
      createRecurringRepository(recurrings),
      createTransactionRepository(existingTransactions)
    );
    const result = useCase.executeRecurringPurchases('2024-03-04');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.executed).toHaveLength(1);
      expect(result.value.skipped).toEqual(
        expect.arrayContaining([
          { recurringPurchaseId: 'rec-inactive', reason: 'INACTIVE' },
          { recurringPurchaseId: 'rec-duplicate', reason: 'ALREADY_EXECUTED' },
          { recurringPurchaseId: 'rec-not-target', reason: 'NOT_TARGET_DATE' },
        ])
      );
    }
  });

  it('約定日が不正な形式の場合はバリデーションエラーになる', () => {
    // 前提: 約定日がYYYY-MM-DD形式ではない
    // 事前条件: 依存リポジトリは正常応答する
    // 検証: targetDateフィールドのエラーが返る
    const useCase = createRecurringUseCase(
      createFundRepository([]),
      createNavRepository([]),
      createRecurringRepository([]),
      createTransactionRepository([])
    );
    const result = useCase.executeRecurringPurchases('2024/03/05');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('targetDate');
    }
  });

  it('約定までの営業日数が未設定の場合はエラーになる', () => {
    // 前提: settlementBusinessDaysが未設定である
    // 事前条件: 積立設定が存在する
    // 検証: settlementBusinessDaysフィールドのエラーが返る
    const funds: Fund[] = [
      {
        id: 'fund-001',
        name: '国内株式',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const recurrings: RecurringPurchase[] = [
      {
        id: 'rec-1',
        fundId: 'fund-001',
        monthlyAmount: 10000,
        executionDay: 5,
        startDate: '2024-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const useCase = createRecurringUseCase(
      createFundRepository(funds),
      createNavRepository([]),
      createRecurringRepository(recurrings),
      createTransactionRepository([])
    );
    const result = useCase.executeRecurringPurchases('2024-03-05');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('settlementBusinessDays');
    }
  });

  it('約定までの営業日数が負の場合はエラーになる', () => {
    // 前提: settlementBusinessDaysが負の値である
    // 事前条件: 積立設定が存在する
    // 検証: settlementBusinessDaysフィールドのエラーが返る
    const funds: Fund[] = [
      {
        id: 'fund-002',
        name: '海外株式',
        rakutenFundId: null,
        settlementBusinessDays: -1,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const recurrings: RecurringPurchase[] = [
      {
        id: 'rec-2',
        fundId: 'fund-002',
        monthlyAmount: 10000,
        executionDay: 5,
        startDate: '2024-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const useCase = createRecurringUseCase(
      createFundRepository(funds),
      createNavRepository([]),
      createRecurringRepository(recurrings),
      createTransactionRepository([])
    );
    const result = useCase.executeRecurringPurchases('2024-03-05');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('settlementBusinessDays');
    }
  });

  it('積立設定の更新対象が存在しない場合はnot_foundになる', () => {
    // 前提: 更新対象の積立設定が存在しない
    // 事前条件: リポジトリが空である
    // 検証: not_foundエラーが返る
    const useCase = createRecurringUseCase(
      createFundRepository([
        {
          id: 'fund-010',
          name: '国内株式',
          rakutenFundId: null,
          settlementBusinessDays: 1,
          navSource: null,
          navSourceCode: null,
          assetClass: null,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ]),
      createNavRepository([]),
      createRecurringRepository([]),
      createTransactionRepository([])
    );
    const result = useCase.updateRecurringPurchase({
      id: 'missing-id',
      fundId: 'fund-010',
      monthlyAmount: 10000,
      executionDay: 5,
      startDate: '2024-01-01',
      endDate: null,
      isActive: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('積立設定の削除対象が存在しない場合はnot_foundになる', () => {
    // 前提: 削除対象の積立設定が存在しない
    // 事前条件: リポジトリが空である
    // 検証: not_foundエラーが返る
    const useCase = createRecurringUseCase(
      createFundRepository([]),
      createNavRepository([]),
      createRecurringRepository([]),
      createTransactionRepository([])
    );
    const result = useCase.deleteRecurringPurchase('missing-id');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('毎月1日注文設定で1/1-4が休日の場合、1/6に約定する', () => {
    // 前提: executionDay=1（毎月1日に注文）、settlementBusinessDays=1
    // 事前条件: 1/5が最初の営業日（NAV存在）、1/6にもNAVが存在
    // 検証: 1/6実行（約定日）で購入処理され、Transaction.date=1/6となる
    const funds: Fund[] = [
      {
        id: 'fund-001',
        name: 'テストファンド',
        rakutenFundId: null,
        settlementBusinessDays: 1,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const navs: Nav[] = [
      {
        fundId: 'fund-001',
        date: '2025-01-05',
        value: 10000,
        createdAt: '2025-01-05T00:00:00.000Z',
      },
      {
        fundId: 'fund-001',
        date: '2025-01-06',
        value: 10100,
        createdAt: '2025-01-06T00:00:00.000Z',
      },
    ];
    const recurrings: RecurringPurchase[] = [
      {
        id: 'rec-001',
        fundId: 'fund-001',
        monthlyAmount: 10000,
        executionDay: 1,
        startDate: '2025-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];

    const useCase = createRecurringUseCase(
      createFundRepository(funds),
      createNavRepository(navs),
      createRecurringRepository(recurrings),
      createTransactionRepository([])
    );

    // 1/6に実行（約定日）
    const result = useCase.executeRecurringPurchases('2025-01-06');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.executed).toHaveLength(1);
      const transaction = result.value.executed[0];
      expect(transaction.date).toBe('2025-01-06'); // 約定日
      expect(transaction.navValue).toBe(10100); // 1/6のNAV
      expect(transaction.idempotencyKey).toBe('rec-001_2025-01-05'); // 注文日ベースのキー
    }
  });

  it('月額購入金額が整数でない積立設定は登録できない', () => {
    // 前提: 口数の計算（calculateUnits）は円単位の整数を前提にしている（issue #260）
    // 事前条件: 1円未満の端数を含む月額購入金額（5,000.5円）で積立設定を登録する
    // 検証: monthlyAmount の validation エラーが返る
    const useCase = createRecurringUseCase(
      createFundRepository([]),
      createNavRepository([]),
      createRecurringRepository([]),
      createTransactionRepository([])
    );
    const result = useCase.createRecurringPurchase({
      fundId: 'fund-001',
      monthlyAmount: 5000.5,
      executionDay: 10,
      startDate: '2024-03-10',
      endDate: null,
      isActive: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('monthlyAmount');
      expect(result.error.message).toContain('整数');
    }
  });

  it('口数を計算できない積立設定があっても他の積立設定は記録し、最後に失敗として報告する', () => {
    // 前提: navs シートの手修正などで、2 つの銘柄の約定日の基準価額に1円未満の端数が入っている
    // 事前条件: 4 つの積立設定（いずれも 1/1 注文・1/2 約定）を、次の順に処理する
    //   - rec-001: 端数のある基準価額の銘柄（fund-001）
    //   - rec-002: 正常な銘柄（fund-002。10,000円・基準価額 20,000円）
    //   - rec-003: 端数のある基準価額の銘柄（fund-003）
    //   - rec-004: 非アクティブな積立設定（fund-002）
    // 検証:
    //   - 端数のある 2 件は NO_NAV でスキップせず、両方の積立設定 ID と約定日を含む validation エラーで報告される
    //   - 失敗のメッセージに、処理済みの件数（記録: 1件、スキップ: 1件）が含まれる
    //   - 後続の正常な積立購入は記録される（毎日のトリガーは当日分しか処理しないため、中断すると二度と記録されない）
    const funds: Fund[] = ['fund-001', 'fund-002', 'fund-003'].map((id) => ({
      id,
      name: id === 'fund-002' ? '正常な銘柄' : '端数のある基準価額の銘柄',
      rakutenFundId: null,
      settlementBusinessDays: 1,
      navSource: null,
      navSourceCode: null,
      assetClass: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    }));
    const navs: Nav[] = [
      {
        fundId: 'fund-001',
        date: '2025-01-01',
        value: 10000,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        fundId: 'fund-001',
        date: '2025-01-02',
        value: 10100.5,
        createdAt: '2025-01-02T00:00:00.000Z',
      },
      {
        fundId: 'fund-002',
        date: '2025-01-01',
        value: 20000,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        fundId: 'fund-002',
        date: '2025-01-02',
        value: 20000,
        createdAt: '2025-01-02T00:00:00.000Z',
      },
      {
        fundId: 'fund-003',
        date: '2025-01-01',
        value: 30000,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        fundId: 'fund-003',
        date: '2025-01-02',
        value: 30000.5,
        createdAt: '2025-01-02T00:00:00.000Z',
      },
    ];
    const 積立設定 = (id: string, fundId: string, isActive: boolean): RecurringPurchase => ({
      id,
      fundId,
      monthlyAmount: 10000,
      executionDay: 1,
      startDate: '2025-01-01',
      endDate: null,
      isActive,
      createdAt: '2025-01-01T00:00:00.000Z',
    });
    const recurrings: RecurringPurchase[] = [
      積立設定('rec-001', 'fund-001', true),
      積立設定('rec-002', 'fund-002', true),
      積立設定('rec-003', 'fund-003', true),
      積立設定('rec-004', 'fund-002', false),
    ];
    const transactionRepository = createTransactionRepository([]);
    const useCase = createRecurringUseCase(
      createFundRepository(funds),
      createNavRepository(navs),
      createRecurringRepository(recurrings),
      transactionRepository
    );

    const result = useCase.executeRecurringPurchases('2025-01-02');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.message).toContain('記録: 1件、スキップ: 1件');
      expect(result.error.message).toContain('積立設定（ID: rec-001）の約定日 2025-01-02');
      expect(result.error.message).toContain('積立設定（ID: rec-003）の約定日 2025-01-02');
    }
    // 正常な銘柄の積立購入は 10,000円・基準価額 20,000円 で 5,000口 として記録されている
    const recorded = transactionRepository.listByFundId('fund-002');
    expect(
      recorded.success && recorded.value.map((tx) => [tx.recurringPurchaseId, tx.units])
    ).toEqual([['rec-002', 5000]]);
    expect(transactionRepository.listByFundId('fund-001')).toEqual(ok([]));
    expect(transactionRepository.listByFundId('fund-003')).toEqual(ok([]));
  });

  it('毎月1日注文設定で1/1が営業日の場合、1/2に約定する', () => {
    // 前提: executionDay=1（毎月1日に注文）、settlementBusinessDays=1
    // 事前条件: 1/1が営業日（NAV存在）、1/2にもNAVが存在
    // 検証: 1/2実行（約定日）で購入処理され、Transaction.date=1/2となる
    const funds: Fund[] = [
      {
        id: 'fund-001',
        name: 'テストファンド',
        rakutenFundId: null,
        settlementBusinessDays: 1,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const navs: Nav[] = [
      {
        fundId: 'fund-001',
        date: '2025-01-01',
        value: 10000,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        fundId: 'fund-001',
        date: '2025-01-02',
        value: 10100,
        createdAt: '2025-01-02T00:00:00.000Z',
      },
    ];
    const recurrings: RecurringPurchase[] = [
      {
        id: 'rec-001',
        fundId: 'fund-001',
        monthlyAmount: 10000,
        executionDay: 1,
        startDate: '2025-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];

    const useCase = createRecurringUseCase(
      createFundRepository(funds),
      createNavRepository(navs),
      createRecurringRepository(recurrings),
      createTransactionRepository([])
    );

    // 1/2に実行（約定日）
    const result = useCase.executeRecurringPurchases('2025-01-02');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.executed).toHaveLength(1);
      const transaction = result.value.executed[0];
      expect(transaction.date).toBe('2025-01-02'); // 約定日
      expect(transaction.navValue).toBe(10100); // 1/2のNAV
      expect(transaction.idempotencyKey).toBe('rec-001_2025-01-01'); // 注文日ベースのキー
    }
  });

  it('約定日でない日に実行してもスキップされる', () => {
    // 前提: executionDay=1（毎月1日に注文）
    // 事前条件: 1/5, 1/6, 1/7が営業日
    // 検証: 1/7に実行してもNOT_TARGET_DATEでスキップされる（約定日は1/6）
    const funds: Fund[] = [
      {
        id: 'fund-001',
        name: 'テストファンド',
        rakutenFundId: null,
        settlementBusinessDays: 1,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const navs: Nav[] = [
      {
        fundId: 'fund-001',
        date: '2025-01-05',
        value: 10000,
        createdAt: '2025-01-05T00:00:00.000Z',
      },
      {
        fundId: 'fund-001',
        date: '2025-01-06',
        value: 10100,
        createdAt: '2025-01-06T00:00:00.000Z',
      },
      {
        fundId: 'fund-001',
        date: '2025-01-07',
        value: 10200,
        createdAt: '2025-01-07T00:00:00.000Z',
      },
    ];
    const recurrings: RecurringPurchase[] = [
      {
        id: 'rec-001',
        fundId: 'fund-001',
        monthlyAmount: 10000,
        executionDay: 1,
        startDate: '2025-01-01',
        endDate: null,
        isActive: true,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];

    const useCase = createRecurringUseCase(
      createFundRepository(funds),
      createNavRepository(navs),
      createRecurringRepository(recurrings),
      createTransactionRepository([])
    );

    // 1/7に実行（約定日ではない）
    const result = useCase.executeRecurringPurchases('2025-01-07');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.executed).toHaveLength(0);
      expect(result.value.skipped).toHaveLength(1);
      expect(result.value.skipped[0].reason).toBe('NOT_TARGET_DATE');
    }
  });
});
