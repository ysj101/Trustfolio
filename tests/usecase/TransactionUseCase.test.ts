import { describe, expect, it, vi } from 'vite-plus/test';
import { createTransactionUseCase } from '../../src/usecase/TransactionUseCase';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { TransactionRepository } from '../../src/repository/TransactionRepository';
import type { Fund, Transaction } from '../../src/domain/types';
import { createEmptyTransactionRepository, ok, fail } from '../fakes';

const 国内株式ファンド: Fund = {
  id: '国内株式ファンド',
  name: '国内株式インデックス',
  rakutenFundId: null,
  settlementBusinessDays: null,
  navSource: null,
  navSourceCode: null,
  assetClass: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

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
  const fundRepository = createFundRepository([国内株式ファンド]);
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

  it('取引シート未作成の銘柄の取引履歴は空配列を返す', () => {
    // 前提: 銘柄は登録済みだが、取引シートは作成されていない。
    // 事前条件: インメモリシートリポジトリに取引シートを作成せず、本物のTransactionRepositoryを使用する。
    // 検証: 取引履歴取得は内部エラーではなく成功した空配列を返す。
    const fundRepository = createFundRepository([
      {
        ...国内株式ファンド,
      },
    ]);
    const useCase = createTransactionUseCase(fundRepository, createEmptyTransactionRepository());
    const result = useCase.getHistory('国内株式ファンド');
    expect(result).toEqual({ success: true, value: [] });
  });

  it('取引シート未作成の銘柄を売却すると保有口数不足の業務エラーになる', () => {
    // 前提: 銘柄は登録済みだが、取引シートは作成されていない。
    // 事前条件: 取引0件に対して100口の売却を検証する。
    // 検証: シート不存在エラーではなく、保有口数不足を示すvalidationエラーになる。
    const fundRepository = createFundRepository([
      {
        ...国内株式ファンド,
      },
    ]);
    const useCase = createTransactionUseCase(fundRepository, createEmptyTransactionRepository());
    const result = useCase.executeSaleTransaction({
      fundId: '国内株式ファンド',
      date: '2026-01-02',
      units: 100,
      amount: 10000,
      navValue: 10000,
      incomeTax: 0,
      residentTax: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.message).not.toContain('シートが存在しません');
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
        ...国内株式ファンド,
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

/**
 * 購入取引の口数の訂正（correctPurchaseUnits、issue #260）のテスト。
 *
 * 前提:
 * - 購入時に記録する口数は calculateUnits の推定値であり、SBI証券の実際の約定口数と 1 口ずれることがある。
 * - 利用者は取引報告書の約定口数を見て、記録済みの口数だけを訂正する。
 *
 * 検証項目:
 * - 積立購入・スポット購入の口数を訂正でき、口数以外（日付・金額・基準価額・積立設定ID・冪等キー・作成日時）は変わらない。
 * - 口数が変わらない訂正は、シートへ書き込まない。
 * - 売却取引・存在しない取引・存在しない銘柄・不正な口数は拒否する。
 * - 口数を減らす訂正で全期間の保有口数がマイナスになる場合は拒否し、口数を増やす訂正は既存のマイナス保有に妨げられない。
 * - 訂正したスポット購入を編集した場合、金額と基準価額が変わらなければ訂正した口数を保持し、変われば計算し直す。
 */
describe('TransactionUseCase の口数の訂正', () => {
  /** ゴールドファンドの銘柄（issue #260 の実データの銘柄）。 */
  const ゴールドファンド: Fund = {
    ...国内株式ファンド,
    id: 'ゴールドファンド',
    name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
  };

  /** 2026-10-02 に 5,000円・基準価額 23,562円 で積立購入し、切り上げで 2,123口と記録された取引。 */
  const 積立購入_切り上げで記録: Transaction = {
    id: '積立購入-2026-10-02',
    fundId: 'ゴールドファンド',
    type: 'RECURRING_PURCHASE',
    date: '2026-10-02',
    amount: 5000,
    navValue: 23562,
    units: 2123,
    incomeTax: null,
    residentTax: null,
    recurringPurchaseId: '積立設定-ゴールド',
    idempotencyKey: '積立設定-ゴールド_2026-10-02',
    createdAt: '2026-10-02T00:00:00.000Z',
  };

  /** 2026-09-15 に 5,000円・基準価額 23,562円 で購入し、口数を約定口数 2,121口 へ訂正済みのスポット購入。 */
  const 訂正済みスポット購入: Transaction = スポット購入を作る({
    id: 'スポット購入-2026-09-15',
    date: '2026-09-15',
    units: 2121,
  });

  /**
   * ゴールドファンドのスポット購入を作る（積立設定ID・冪等キーは持たない）。
   *
   * @param overrides 既定値（5,000円・基準価額 23,562円）から変える項目
   */
  function スポット購入を作る(overrides: Partial<Transaction>): Transaction {
    return {
      ...積立購入_切り上げで記録,
      type: 'SPOT_PURCHASE',
      recurringPurchaseId: null,
      idempotencyKey: null,
      ...overrides,
    };
  }

  /**
   * ゴールドファンドの売却を作る（税額は 0円、積立設定ID・冪等キーは持たない）。
   *
   * @param overrides 既定値から変える項目（id・date・units は必ず指定する）
   */
  function 売却を作る(overrides: Partial<Transaction>): Transaction {
    return {
      ...積立購入_切り上げで記録,
      type: 'REDEMPTION',
      incomeTax: 0,
      residentTax: 0,
      recurringPurchaseId: null,
      idempotencyKey: null,
      ...overrides,
    };
  }

  /**
   * 指定した取引が登録済みのユースケースとリポジトリを用意する。
   *
   * @param transactions 登録済みの取引
   * @param funds 登録済みの銘柄（既定はゴールドファンドだけ）
   */
  function createUseCase(transactions: Transaction[], funds: Fund[] = [ゴールドファンド]) {
    const transactionRepository = createTransactionRepository(transactions);
    const useCase = createTransactionUseCase(createFundRepository(funds), transactionRepository);
    return { useCase, transactionRepository };
  }

  it('積立購入の口数を約定口数へ訂正でき、口数以外の値は変わらない', () => {
    // 前提: 積立購入の取引が切り上げで 2,123口と記録されている
    // 事前条件: 取引報告書の約定口数は 2,122口である
    // 検証: 口数だけが 2,122口になり、冪等キー等はそのまま保存される
    const { useCase, transactionRepository } = createUseCase([積立購入_切り上げで記録]);

    const result = useCase.correctPurchaseUnits({
      id: '積立購入-2026-10-02',
      fundId: 'ゴールドファンド',
      units: 2122,
    });

    expect(result.success).toBe(true);
    expect(transactionRepository.findById('積立購入-2026-10-02', 'ゴールドファンド')).toEqual(
      ok({ ...積立購入_切り上げで記録, units: 2122 })
    );
  });

  it('スポット購入の口数も訂正できる', () => {
    // 前提: スポット購入の取引が 10,000口と記録されている
    // 事前条件: 取引報告書の約定口数は 9,999口である
    // 検証: 口数だけが 9,999口になる
    const スポット購入 = スポット購入を作る({ id: 'スポット購入-2026-09-15', units: 10000 });
    const { useCase } = createUseCase([スポット購入]);

    const result = useCase.correctPurchaseUnits({
      id: 'スポット購入-2026-09-15',
      fundId: 'ゴールドファンド',
      units: 9999,
    });

    expect(result).toEqual(ok({ ...スポット購入, units: 9999 }));
  });

  it('口数が変わらない訂正は、シートへ書き込まずに成功する', () => {
    // 前提: 入力ダイアログの初期値（現在の口数 2,123口）のまま確定した
    // 検証: 記録済みの取引がそのまま返り、取引の更新（シートへの書き込み）は呼ばれない
    const { useCase, transactionRepository } = createUseCase([積立購入_切り上げで記録]);
    const updateSpy = vi.spyOn(transactionRepository, 'updateTransaction');

    const result = useCase.correctPurchaseUnits({
      id: '積立購入-2026-10-02',
      fundId: 'ゴールドファンド',
      units: 2123,
    });

    expect(result).toEqual(ok(積立購入_切り上げで記録));
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('売却取引の口数は訂正できない', () => {
    // 前提: 売却取引の口数は、売却取引の「編集」で変更する
    // 事前条件: 購入と売却の取引が登録済み
    // 検証: validation エラーが返り、売却取引は変わらない
    const 売却 = 売却を作る({ id: '売却-2026-10-10', date: '2026-10-10', units: 1000 });
    const { useCase, transactionRepository } = createUseCase([積立購入_切り上げで記録, 売却]);

    const result = useCase.correctPurchaseUnits({
      id: '売却-2026-10-10',
      fundId: 'ゴールドファンド',
      units: 999,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.message).toContain('購入取引');
    }
    expect(transactionRepository.findById('売却-2026-10-10', 'ゴールドファンド')).toEqual(ok(売却));
  });

  it('1以上の整数でない口数は拒否する', () => {
    // 前提: 口数は取引報告書の約定口数（1口単位）である
    // 事前条件: 0、負の値、小数、NaN を順に渡す
    // 検証: いずれも units の validation エラーが返り、取引は変わらない
    const { useCase, transactionRepository } = createUseCase([積立購入_切り上げで記録]);

    for (const units of [0, -1, 2122.5, Number.NaN]) {
      const result = useCase.correctPurchaseUnits({
        id: '積立購入-2026-10-02',
        fundId: 'ゴールドファンド',
        units,
      });
      expect(result.success, `口数 ${units}`).toBe(false);
      if (!result.success) {
        expect(result.error.field, `口数 ${units}`).toBe('units');
      }
    }
    expect(transactionRepository.findById('積立購入-2026-10-02', 'ゴールドファンド')).toEqual(
      ok(積立購入_切り上げで記録)
    );
  });

  it('存在しない取引を訂正しようとした場合は not_found になる', () => {
    // 前提: 指定した取引IDの取引が銘柄の取引シートに存在しない
    // 事前条件: 取引が 1 件も登録されていない
    // 検証: not_found エラーが返る
    const { useCase } = createUseCase([]);

    const result = useCase.correctPurchaseUnits({
      id: '存在しない取引',
      fundId: 'ゴールドファンド',
      units: 2122,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
      expect(result.error.message).toContain('取引履歴');
    }
  });

  it('存在しない銘柄を指定した場合は、取引ではなく銘柄が見つからないことを報告する', () => {
    // 前提: 銘柄の存在確認は、取引の存在確認より先に行う
    // 事前条件: 銘柄が 1 件も登録されていない
    // 検証: not_found エラーが返り、メッセージは銘柄に関するものである
    const { useCase } = createUseCase([積立購入_切り上げで記録], []);

    const result = useCase.correctPurchaseUnits({
      id: '積立購入-2026-10-02',
      fundId: 'ゴールドファンド',
      units: 2122,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
      expect(result.error.message).toContain('銘柄');
    }
  });

  it('訂正によって後日の売却時点の保有口数がマイナスになる場合は拒否する', () => {
    // 前提: 2,123口の積立購入の後に、2,123口すべてを売却した取引がある
    // 事前条件: 積立購入の口数を 2,122口へ減らすと、売却時点の保有口数が -1口になる
    // 検証: validation エラーが返り、メッセージで訂正後の口数の見直しを案内し、取引は変わらない
    const 全口売却 = 売却を作る({
      id: '売却-2026-10-20',
      date: '2026-10-20',
      units: 2123,
      createdAt: '2026-10-20T00:00:00.000Z',
    });
    const { useCase, transactionRepository } = createUseCase([積立購入_切り上げで記録, 全口売却]);

    const result = useCase.correctPurchaseUnits({
      id: '積立購入-2026-10-02',
      fundId: 'ゴールドファンド',
      units: 2122,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.message).toBe(
        '口数の訂正により、2026-10-20時点で保有口数がマイナス（-1口）になります。訂正後の口数を見直してください。'
      );
    }
    expect(transactionRepository.findById('積立購入-2026-10-02', 'ゴールドファンド')).toEqual(
      ok(積立購入_切り上げで記録)
    );
  });

  it('最終時点の保有口数が正でも、途中の時点でマイナスになる訂正は拒否する', () => {
    // 前提: 2,123口の積立購入 → 2,123口すべての売却 → 後日の 1,000口の追加購入、の順に記録されている
    // 事前条件: 最初の積立購入を 2,122口へ減らすと、売却時点だけ -1口になり、最終時点は 999口で正である
    // 検証: 最終時点ではなく全期間を検証し、売却時点の -1口を理由に拒否する
    const 全口売却 = 売却を作る({
      id: '売却-2026-10-20',
      date: '2026-10-20',
      units: 2123,
      createdAt: '2026-10-20T00:00:00.000Z',
    });
    const 追加購入 = スポット購入を作る({
      id: 'スポット購入-2026-11-02',
      date: '2026-11-02',
      units: 1000,
      createdAt: '2026-11-02T00:00:00.000Z',
    });
    const { useCase } = createUseCase([積立購入_切り上げで記録, 全口売却, 追加購入]);

    const result = useCase.correctPurchaseUnits({
      id: '積立購入-2026-10-02',
      fundId: 'ゴールドファンド',
      units: 2122,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('2026-10-20時点で保有口数がマイナス（-1口）');
    }
  });

  it('口数を増やす訂正は、訂正と無関係な既存のマイナス保有があっても成功する', () => {
    // 前提: 別の経路（スポット購入の削除など）で、2026-10-20 時点の保有口数がすでにマイナスになっている
    //   （購入 2,123口 に対して 3,000口 の売却が記録されている）
    // 事前条件: 積立購入の口数を 2,123口 から 2,124口 へ増やす（どの時点の保有口数も減らさない訂正）
    // 検証: 訂正は拒否されず、口数が 2,124口 になる
    const 過大な売却 = 売却を作る({
      id: '売却-2026-10-20',
      date: '2026-10-20',
      units: 3000,
      createdAt: '2026-10-20T00:00:00.000Z',
    });
    const { useCase } = createUseCase([積立購入_切り上げで記録, 過大な売却]);

    const result = useCase.correctPurchaseUnits({
      id: '積立購入-2026-10-02',
      fundId: 'ゴールドファンド',
      units: 2124,
    });

    expect(result).toEqual(ok({ ...積立購入_切り上げで記録, units: 2124 }));
  });

  it('訂正したスポット購入を、金額と基準価額を変えずに編集した場合は訂正した口数を保持する', () => {
    // 前提: スポット購入の口数を、推定値 2,122口 から約定口数 2,121口 へ訂正済みである
    // 事前条件: 日付を 2026-09-15 から 2026-09-16 へ直し、金額・基準価額は記録値と同じ値で保存する
    //   （画面では日付を変えると基準価額が取り直されるため、取り直した値が記録値と同じ場合にあたる）
    // 検証: 口数は計算し直されず、訂正した 2,121口 のまま保存される
    const { useCase } = createUseCase([訂正済みスポット購入]);

    const result = useCase.updateSpotPurchase({
      id: 'スポット購入-2026-09-15',
      fundId: 'ゴールドファンド',
      date: '2026-09-16',
      amount: 5000,
      navValue: 23562,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.date).toBe('2026-09-16');
      expect(result.value.units).toBe(2121);
    }
  });

  it('訂正したスポット購入の基準価額だけを変えた場合も、口数を計算し直す', () => {
    // 前提: スポット購入の口数を 2,121口 へ訂正済みである
    // 事前条件: 日付の変更で基準価額が 23,562円 から 23,508円 に取り直された（購入金額 5,000円は同じ）
    // 検証: 口数は新しい基準価額から計算し直され、2,127口 になる（5,000円・23,508円 の推定値）
    const { useCase } = createUseCase([訂正済みスポット購入]);

    const result = useCase.updateSpotPurchase({
      id: 'スポット購入-2026-09-15',
      fundId: 'ゴールドファンド',
      date: '2026-09-16',
      amount: 5000,
      navValue: 23508,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.units).toBe(2127);
    }
  });

  it('計算途中の値が安全な整数の範囲を超える金額でも、金額と基準価額を変えない編集は記録済みの口数を保持する', () => {
    // 前提: 金額と基準価額が変わらない編集では calculateUnits を呼ばない（画面のプレビューも同じ規則で表示する）
    // 事前条件: 購入金額 900,719,925,474円（× 10,000 + 4,999 が安全な整数の範囲を超える）の記録を、日付だけ直す
    // 検証: 計算できないとはせず、記録済みの口数のまま保存される
    const 大きい購入 = スポット購入を作る({
      id: 'スポット購入-大きい金額',
      amount: 900_719_925_474,
      navValue: 10_000,
      units: 900_719_925_474,
    });
    const { useCase } = createUseCase([大きい購入]);

    const result = useCase.updateSpotPurchase({
      id: 'スポット購入-大きい金額',
      fundId: 'ゴールドファンド',
      date: '2026-10-03',
      amount: 900_719_925_474,
      navValue: 10_000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.units).toBe(900_719_925_474);
    }
  });

  it('以前に保存された整数でない購入金額の記録は、金額を変えない編集でも入力検証で拒否する', () => {
    // 前提: 入力検証は、記録値と同じ値でも購入金額が1円以上の整数であることを求める（口数を保持する分岐でも検証が抜けない）
    // 事前条件: 以前の版で保存された、1円未満の端数を含む購入金額（5,000.5円）の記録を、金額を変えずに編集する
    // 検証: amount の validation エラーが返る
    const 端数のある記録 = スポット購入を作る({ id: 'スポット購入-端数', amount: 5000.5 });
    const { useCase } = createUseCase([端数のある記録]);

    const result = useCase.updateSpotPurchase({
      id: 'スポット購入-端数',
      fundId: 'ゴールドファンド',
      date: '2026-10-02',
      amount: 5000.5,
      navValue: 23562,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('amount');
    }
  });

  it('訂正したスポット購入の金額を変えた場合は、口数を計算し直す', () => {
    // 前提: スポット購入の口数を 2,121口 へ訂正済みである
    // 事前条件: 購入金額を 5,000円 から 10,000円 へ変える編集を行う（基準価額 23,562円）
    // 検証: 口数は新しい金額から計算し直され、4,244口 になる（10,000円・23,562円 の推定値）
    const { useCase } = createUseCase([訂正済みスポット購入]);

    const result = useCase.updateSpotPurchase({
      id: 'スポット購入-2026-09-15',
      fundId: 'ゴールドファンド',
      date: '2026-09-15',
      amount: 10000,
      navValue: 23562,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.units).toBe(4244);
    }
  });
});

/**
 * スポット購入の購入金額・基準価額の整数検証（issue #260）のテスト。
 *
 * 前提: 口数の計算（calculateUnits）は円単位の整数を前提にしているため、入力の時点で1円以上の整数に限る。
 */
describe('TransactionUseCase のスポット購入の整数検証', () => {
  it('スポット購入の購入金額が整数でない場合は、入力の時点で拒否する', () => {
    // 事前条件: 1円未満の端数を含む購入金額（5,000.5円）でスポット購入を登録する
    // 検証: amount の validation エラーが返る
    const useCase = createTransactionUseCase(
      createFundRepository([国内株式ファンド]),
      createTransactionRepository([])
    );

    const result = useCase.executeSpotPurchase({
      fundId: '国内株式ファンド',
      date: '2026-10-02',
      amount: 5000.5,
      navValue: 23562,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('amount');
      expect(result.error.message).toBe('購入金額は1円以上の整数で入力してください。');
    }
  });
});
