import { describe, expect, it } from 'vitest';
import { createTransactionUseCase } from '../../src/usecase/TransactionUseCase';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { TransactionRepository } from '../../src/repository/TransactionRepository';
import type { Fund, Transaction } from '../../src/domain/types';
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

function createTransactionRepository(seed: Transaction[]): TransactionRepository {
  const transactions = [...seed];
  return {
    listByFundId: (fundId) => ok(transactions.filter((tx) => tx.fundId === fundId)),
    listByFundIdAllowingMissingSheet: (fundId) =>
      ok(transactions.filter((tx) => tx.fundId === fundId)),
    listAll: (fundIds) => ok(transactions.filter((tx) => fundIds.includes(tx.fundId))),
    createTransaction: (transaction) => {
      transactions.push(transaction);
      return ok(undefined);
    },
    findByIdempotencyKey: () => ok(null),
    findById: (transactionId, fundId) =>
      ok(transactions.find((tx) => tx.id === transactionId && tx.fundId === fundId) ?? null),
    updateTransaction: (transaction) => {
      const index = transactions.findIndex((tx) => tx.id === transaction.id);
      if (index === -1) {
        return fail('not_found', `対象の取引履歴が見つかりません: id=${transaction.id}`);
      }
      transactions[index] = transaction;
      return ok(undefined);
    },
    deleteTransaction: (transactionId) => {
      const index = transactions.findIndex((tx) => tx.id === transactionId);
      if (index === -1) {
        return fail('not_found', `対象の取引履歴が見つかりません: id=${transactionId}`);
      }
      transactions.splice(index, 1);
      return ok(undefined);
    },
  };
}

/**
 * 保有口数検証テストで使用する、購入100口と売却10口が登録済みの
 * 「国内株式ファンド」に対するユースケースとリポジトリを用意する。
 */
function createUseCaseForSaleUpdate() {
  const fundRepository = createFundRepository([
    {
      id: '国内株式ファンド',
      name: '国内株式インデックス',
      rakutenFundId: null,
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
      assetClass: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ]);
  const transactionRepository = createTransactionRepository([
    {
      id: '購入-保有口数検証用',
      fundId: '国内株式ファンド',
      type: 'SPOT_PURCHASE',
      date: '2026-01-01',
      amount: 100000,
      navValue: 10000,
      units: 100,
      incomeTax: null,
      residentTax: null,
      recurringPurchaseId: null,
      idempotencyKey: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: '売却-保有口数検証用',
      fundId: '国内株式ファンド',
      type: 'REDEMPTION',
      date: '2026-01-02',
      amount: 10000,
      navValue: 10000,
      units: 10,
      incomeTax: 0,
      residentTax: 0,
      recurringPurchaseId: null,
      idempotencyKey: null,
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ]);
  return {
    useCase: createTransactionUseCase(fundRepository, transactionRepository),
    transactionRepository,
  };
}

/** 保有口数検証テストで共通に用いる、売却取引更新の入力です。 */
const saleUpdateCommonInput = {
  id: '売却-保有口数検証用',
  fundId: '国内株式ファンド',
  date: '2026-01-02',
  navValue: 10000,
  incomeTax: 0,
  residentTax: 0,
};

describe('TransactionUseCase', () => {
  it('スポット購入で日付形式が不正な場合はバリデーションエラーになる', () => {
    // 前提: 日付がYYYY-MM-DD形式ではない
    // 事前条件: 銘柄は存在する
    // 検証: dateフィールドのエラーが返る
    const fundRepository = createFundRepository([
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
    ]);
    const transactionRepository = createTransactionRepository([]);
    const useCase = createTransactionUseCase(fundRepository, transactionRepository);
    const result = useCase.executeSpotPurchase({
      fundId: 'fund-001',
      date: '2024/01/01',
      amount: 10000,
      navValue: 10000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('date');
    }
  });

  it('スポット購入が成功すると取引が作成される', () => {
    // 前提: 銘柄が存在する
    // 事前条件: 金額と基準価額が有効である
    // 検証: 取引が作成される
    const fundRepository = createFundRepository([
      {
        id: 'fund-002',
        name: '海外株式',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    const transactionRepository = createTransactionRepository([]);
    const useCase = createTransactionUseCase(fundRepository, transactionRepository);
    const result = useCase.executeSpotPurchase({
      fundId: 'fund-002',
      date: '2024-03-01',
      amount: 10000,
      navValue: 20000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.type).toBe('SPOT_PURCHASE');
      expect(result.value.units).toBeGreaterThan(0);
    }
  });

  it('取引履歴の取得で銘柄IDが空の場合はバリデーションエラーになる', () => {
    // 前提: 銘柄IDが空である
    // 事前条件: リポジトリは正常応答する
    // 検証: fundIdフィールドのエラーが返る
    const fundRepository = createFundRepository([]);
    const transactionRepository = createTransactionRepository([]);
    const useCase = createTransactionUseCase(fundRepository, transactionRepository);
    const result = useCase.getHistory('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('fundId');
    }
  });

  it('売却で保有口数がマイナスになる場合はエラーになる', () => {
    // 前提: 売却口数が保有口数を上回る
    // 事前条件: 既存の購入取引が1件ある
    // 検証: unitsフィールドのバリデーションエラーが返る
    const fundRepository = createFundRepository([
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
    ]);
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
    const result = useCase.executeSaleTransaction({
      fundId: 'fund-001',
      date: '2024-01-20',
      units: 15000,
      amount: 15000,
      navValue: 10000,
      incomeTax: 0,
      residentTax: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('units');
    }
  });

  it('売却対象の銘柄が存在しない場合はnot_foundになる', () => {
    // 前提: 銘柄が存在しない
    // 事前条件: fundRepositoryが空である
    // 検証: not_foundエラーが返る
    const fundRepository = createFundRepository([]);
    const transactionRepository = createTransactionRepository([]);
    const useCase = createTransactionUseCase(fundRepository, transactionRepository);
    const result = useCase.executeSaleTransaction({
      fundId: 'fund-unknown',
      date: '2024-01-20',
      units: 1000,
      amount: 1000,
      navValue: 1000,
      incomeTax: 0,
      residentTax: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('売却取引は口数を正の値で保存する', () => {
    // 前提: 売却口数が保有口数以下である
    // 事前条件: 既存の購入取引がある
    // 検証: 登録された取引のunitsが正の値で保存される（計算時にtypeで判別して減算）
    const fundRepository = createFundRepository([
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
    ]);
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
    const result = useCase.executeSaleTransaction({
      fundId: 'fund-001',
      date: '2024-01-20',
      units: 5000,
      amount: 6000,
      navValue: 12000,
      incomeTax: 150,
      residentTax: 50,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.units).toBe(5000);
      expect(result.value.amount).toBe(6000);
      expect(result.value.incomeTax).toBe(150);
      expect(result.value.residentTax).toBe(50);
    }
  });

  it('売却登録では所得税・住民税の0円を許容する', () => {
    // 前提: 税額が発生しなかった売却を登録する
    // 事前条件: 売却口数を上回る購入取引が存在する
    // 検証: 両税額が0のまま売却取引へ保存される
    const fundRepository = createFundRepository([
      {
        id: '国内株式ファンド',
        name: '国内株式インデックス',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const transactionRepository = createTransactionRepository([
      {
        id: '購入-001',
        fundId: '国内株式ファンド',
        type: 'SPOT_PURCHASE',
        date: '2026-01-10',
        amount: 100000,
        navValue: 10000,
        units: 100000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2026-01-10T00:00:00.000Z',
      },
    ]);
    const result = createTransactionUseCase(
      fundRepository,
      transactionRepository
    ).executeSaleTransaction({
      fundId: '国内株式ファンド',
      date: '2026-02-01',
      units: 10000,
      amount: 12000,
      navValue: 12000,
      incomeTax: 0,
      residentTax: 0,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.incomeTax).toBe(0);
      expect(result.value.residentTax).toBe(0);
    }
  });

  it('売却登録では所得税・住民税の負値を拒否する', () => {
    // 前提: いずれかの税額に負値が入力される
    // 事前条件: 税額以外の売却入力は妥当である
    // 検証: 該当する税額フィールドのvalidationエラーを返す
    const fundRepository = createFundRepository([]);
    const useCase = createTransactionUseCase(fundRepository, createTransactionRepository([]));
    const inputs = [
      { incomeTax: -1, residentTax: 0, expectedField: 'incomeTax' },
      { incomeTax: 0, residentTax: -1, expectedField: 'residentTax' },
    ];

    inputs.forEach(({ incomeTax, residentTax, expectedField }) => {
      const result = useCase.executeSaleTransaction({
        fundId: '国内株式ファンド',
        date: '2026-02-01',
        units: 10000,
        amount: 12000,
        navValue: 12000,
        incomeTax,
        residentTax,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('validation');
        expect(result.error.field).toBe(expectedField);
      }
    });
  });

  it('売却更新では所得税・住民税を新しい値に更新する', () => {
    // 前提: 税額未記録の売却取引が存在する
    // 事前条件: 同じ銘柄に十分な購入口数が存在する
    // 検証: 更新後の売却取引に所得税と住民税が別々に保存される
    const fundRepository = createFundRepository([
      {
        id: '先進国株式ファンド',
        name: '先進国株式インデックス',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const transactionRepository = createTransactionRepository([
      {
        id: '購入-更新用',
        fundId: '先進国株式ファンド',
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
        id: '売却-更新用',
        fundId: '先進国株式ファンド',
        type: 'REDEMPTION',
        date: '2026-02-01',
        amount: 12000,
        navValue: 12000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: null,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
    const result = createTransactionUseCase(
      fundRepository,
      transactionRepository
    ).updateSaleTransaction({
      id: '売却-更新用',
      fundId: '先進国株式ファンド',
      date: '2026-02-01',
      units: 10000,
      amount: 12000,
      navValue: 12000,
      incomeTax: 1532,
      residentTax: 500,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.incomeTax).toBe(1532);
      expect(result.value.residentTax).toBe(500);
    }
  });

  it('保有口数を超える売却口数への更新は拒否される', () => {
    // 前提: 購入100口（2026-01-01）と売却10口（2026-01-02）が登録済み
    // 事前条件: 売却取引を保有口数を超える1,000口へ更新する
    // 検証: validationエラーになり、リポジトリ上の売却口数は10口のまま変更されない
    const { useCase, transactionRepository } = createUseCaseForSaleUpdate();
    const result = useCase.updateSaleTransaction({
      ...saleUpdateCommonInput,
      units: 1000,
      amount: 1000000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.message).toContain('保有口数がマイナス');
    }
    const unchangedTransaction = transactionRepository.findById(
      saleUpdateCommonInput.id,
      saleUpdateCommonInput.fundId
    );
    expect(unchangedTransaction.success).toBe(true);
    if (unchangedTransaction.success) {
      expect(unchangedTransaction.value?.units).toBe(10);
    }
  });

  it('保有口数の範囲内への売却更新は成功する', () => {
    // 前提: 購入100口（2026-01-01）と売却10口（2026-01-02）が登録済み
    // 事前条件: 売却取引を保有口数の範囲内である50口へ更新する
    // 検証: 更新が成功し、戻り値とリポジトリ上の売却口数が50口になる
    const { useCase, transactionRepository } = createUseCaseForSaleUpdate();
    const result = useCase.updateSaleTransaction({
      ...saleUpdateCommonInput,
      units: 50,
      amount: 50000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.units).toBe(50);
    }
    const updatedTransaction = transactionRepository.findById(
      saleUpdateCommonInput.id,
      saleUpdateCommonInput.fundId
    );
    expect(updatedTransaction.success).toBe(true);
    if (updatedTransaction.success) {
      expect(updatedTransaction.value?.units).toBe(50);
    }
  });

  it('保有口数ちょうどの売却口数への更新は成功する', () => {
    // 前提: 購入100口（2026-01-01）と売却10口（2026-01-02）が登録済み
    // 事前条件: 売却取引を保有口数ちょうどである100口へ更新する
    // 検証: 累積保有口数が0ちょうどのため許容され、戻り値とリポジトリ上の売却口数が100口になる
    const { useCase, transactionRepository } = createUseCaseForSaleUpdate();
    const result = useCase.updateSaleTransaction({
      ...saleUpdateCommonInput,
      units: 100,
      amount: 1000000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.units).toBe(100);
    }
    const updatedTransaction = transactionRepository.findById(
      saleUpdateCommonInput.id,
      saleUpdateCommonInput.fundId
    );
    expect(updatedTransaction.success).toBe(true);
    if (updatedTransaction.success) {
      expect(updatedTransaction.value?.units).toBe(100);
    }
  });

  it('保有口数を1口だけ超える売却口数への更新は拒否される', () => {
    // 前提: 購入100口（2026-01-01）と売却10口（2026-01-02）が登録済み
    // 事前条件: 売却取引を保有口数を1口だけ超える101口へ更新する
    // 検証: 累積保有口数が-1になるため拒否され、リポジトリ上の売却口数は10口のまま変更されない
    const { useCase, transactionRepository } = createUseCaseForSaleUpdate();
    const result = useCase.updateSaleTransaction({
      ...saleUpdateCommonInput,
      units: 101,
      amount: 1010000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.message).toContain('保有口数がマイナス');
    }
    const unchangedTransaction = transactionRepository.findById(
      saleUpdateCommonInput.id,
      saleUpdateCommonInput.fundId
    );
    expect(unchangedTransaction.success).toBe(true);
    if (unchangedTransaction.success) {
      expect(unchangedTransaction.value?.units).toBe(10);
    }
  });

  it('積立購入の取引はスポット購入更新で編集できない', () => {
    // 前提: 対象取引が積立購入である
    // 事前条件: 積立購入の取引を登録済み
    // 検証: validationエラーが返る
    const fundRepository = createFundRepository([
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
    ]);
    const transactionRepository = createTransactionRepository([
      {
        id: 'tx-1',
        fundId: 'fund-001',
        type: 'RECURRING_PURCHASE',
        date: '2024-01-10',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: 'rec-1',
        idempotencyKey: 'rec-1_2024-01-10',
        createdAt: '2024-01-10T00:00:00.000Z',
      },
    ]);
    const useCase = createTransactionUseCase(fundRepository, transactionRepository);
    const result = useCase.updateSpotPurchase({
      id: 'tx-1',
      fundId: 'fund-001',
      date: '2024-01-10',
      amount: 10000,
      navValue: 10000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('積立購入');
    }
  });

  it('積立購入の取引は削除できない', () => {
    // 前提: 対象取引が積立購入である
    // 事前条件: 積立購入の取引を登録済み
    // 検証: validationエラーが返る
    const fundRepository = createFundRepository([
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
    ]);
    const transactionRepository = createTransactionRepository([
      {
        id: 'tx-1',
        fundId: 'fund-001',
        type: 'RECURRING_PURCHASE',
        date: '2024-01-10',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: 'rec-1',
        idempotencyKey: 'rec-1_2024-01-10',
        createdAt: '2024-01-10T00:00:00.000Z',
      },
    ]);
    const useCase = createTransactionUseCase(fundRepository, transactionRepository);
    const result = useCase.deleteSpotPurchase('tx-1', 'fund-001');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('削除できません');
    }
  });

  it('スポット購入の更新で対象が存在しない場合はnot_foundになる', () => {
    // 前提: 対象取引が存在しない
    // 事前条件: 取引履歴が空である
    // 検証: not_foundエラーが返る
    const fundRepository = createFundRepository([
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
    ]);
    const transactionRepository = createTransactionRepository([]);
    const useCase = createTransactionUseCase(fundRepository, transactionRepository);
    const result = useCase.updateSpotPurchase({
      id: 'missing-id',
      fundId: 'fund-001',
      date: '2024-03-01',
      amount: 10000,
      navValue: 10000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('スポット購入の更新が成功する', () => {
    // 前提: 対象取引がスポット購入で存在する
    // 事前条件: fundRepositoryに銘柄が存在する
    // 検証: 更新結果が返る
    const fundRepository = createFundRepository([
      {
        id: 'fund-010',
        name: '国内株式',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    const transactionRepository = createTransactionRepository([
      {
        id: 'tx-10',
        fundId: 'fund-010',
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
    const result = useCase.updateSpotPurchase({
      id: 'tx-10',
      fundId: 'fund-010',
      date: '2024-01-10',
      amount: 20000,
      navValue: 10000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.amount).toBe(20000);
    }
  });

  it('売却取引の更新で対象が存在しない場合はnot_foundになる', () => {
    // 前提: 更新対象が存在しない
    // 事前条件: 取引履歴が空である
    // 検証: not_foundエラーが返る
    const fundRepository = createFundRepository([
      {
        id: 'fund-011',
        name: '国内株式',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    const transactionRepository = createTransactionRepository([]);
    const useCase = createTransactionUseCase(fundRepository, transactionRepository);
    const result = useCase.updateSaleTransaction({
      id: 'missing-id',
      fundId: 'fund-011',
      date: '2024-01-10',
      units: 10000,
      amount: 10000,
      navValue: 10000,
      incomeTax: 0,
      residentTax: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('売却取引以外の取引は売却更新できない', () => {
    // 前提: 更新対象がスポット購入である
    // 事前条件: 対象取引がSPOT_PURCHASEで登録済み
    // 検証: validationエラーが返る
    const fundRepository = createFundRepository([
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
    ]);
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
    const result = useCase.updateSaleTransaction({
      id: 'tx-1',
      fundId: 'fund-001',
      date: '2024-01-10',
      units: 10000,
      amount: 10000,
      navValue: 10000,
      incomeTax: 0,
      residentTax: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('id');
    }
  });

  it('スポット購入を削除できる', () => {
    // 前提: スポット購入が存在する
    // 事前条件: 対象取引がスポット購入である
    // 検証: 削除が成功する
    const fundRepository = createFundRepository([
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
    ]);
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
    const result = useCase.deleteSpotPurchase('tx-1', 'fund-001');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.id).toBe('tx-1');
    }
  });

  it('取引履歴の取得で銘柄が存在しない場合はnot_foundになる', () => {
    // 前提: 銘柄が存在しない
    // 事前条件: fundRepositoryが空である
    // 検証: not_foundエラーが返る
    const fundRepository = createFundRepository([]);
    const transactionRepository = createTransactionRepository([]);
    const useCase = createTransactionUseCase(fundRepository, transactionRepository);
    const result = useCase.getHistory('fund-missing');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('全取引取得で銘柄一覧取得が失敗した場合はエラーになる', () => {
    // 前提: 銘柄一覧の取得が失敗する
    // 事前条件: fundRepositoryがエラーを返す
    // 検証: 失敗結果が返る
    const fundRepository: FundRepository = {
      listFunds: () => fail('unexpected', '銘柄一覧の取得に失敗しました。'),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
      updateAssetClass: () => ok(undefined),
    };
    const transactionRepository = createTransactionRepository([]);
    const useCase = createTransactionUseCase(fundRepository, transactionRepository);
    const result = useCase.listAll();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('失敗');
    }
  });
});
