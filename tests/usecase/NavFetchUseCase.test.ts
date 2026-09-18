import { describe, expect, it, vi } from 'vitest';
import { createNavFetchUseCase } from '../../src/usecase/NavFetchUseCase';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { NavRepository } from '../../src/repository/NavRepository';
import type { TransactionRepository } from '../../src/repository/TransactionRepository';
import type { PerformanceRepository } from '../../src/repository/PerformanceRepository';
import type { RakutenService } from '../../src/service/RakutenService';
import type { WealthAdvisorService } from '../../src/service/WealthAdvisorService';
import type { Fund, PerformanceRecord, Transaction } from '../../src/domain/types';
import { createEmptyTransactionRepository, ok, fail } from '../fakes';

const wealthAdvisorService: WealthAdvisorService = {
  fetchLatestNav: (navSourceCode) =>
    ok({ navSourceCode, nav: { date: '2026-09-01', value: 26093 } }),
};

describe('NavFetchUseCase', () => {
  it('ステータス別に結果が集計される', () => {
    // 前提: 成功/失敗/スキップ/既存が混在する
    // 事前条件: 楽天ファンドIDが設定された銘柄を含む
    // 検証: 件数と各アイテムのステータスが正しく返る
    const funds: Fund[] = [
      {
        id: 'fund-skip',
        name: '未設定ファンド',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-success',
        name: '成功ファンド',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-exists',
        name: '既存ファンド',
        rakutenFundId: 'IJKL1234MNOP',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-fail',
        name: '失敗ファンド',
        rakutenFundId: 'QRST1234UVWX',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
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

    const navRepository: NavRepository = {
      listByFundId: () => ok([]),
      findByFundAndDate: (fundId) => {
        if (fundId === 'fund-exists') {
          return ok({
            fundId,
            date: '2024-03-05',
            value: 10000,
            createdAt: '2024-03-05T00:00:00.000Z',
          });
        }
        return ok(null);
      },
      findLatestByFundId: () => ok(null),
      createNav: () => ok(undefined),
    };

    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      createTransaction: () => ok(undefined),
      findByIdempotencyKey: () => ok(null),
      findById: () => ok(null),
      updateTransaction: () => ok(undefined),
      deleteTransaction: () => ok(undefined),
    };

    const performanceRepository: PerformanceRepository = {
      createPerformance: () => ok(undefined),
      createGlobalPerformance: () => ok(undefined),
      findByFundAndDate: () => ok(null),
      findGlobalByDate: () => ok(null),
      findLatestByFundId: () => ok(null),
    };

    const rakutenService: RakutenService = {
      fetchLatestNav: (rakutenFundId) => {
        if (rakutenFundId === 'QRST1234UVWX') {
          return fail('unexpected', '楽天証券の取得に失敗しました。');
        }
        return ok({
          rakutenFundId,
          nav: { date: '2024-03-05', value: 10000 },
        });
      },
    };

    const useCase = createNavFetchUseCase(
      fundRepository,
      navRepository,
      transactionRepository,
      performanceRepository,
      rakutenService,
      wealthAdvisorService
    );

    const result = useCase.fetchAndRegisterAllNavs();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.totalCount).toBe(4);
      expect(result.value.successCount).toBe(1);
      expect(result.value.skippedCount).toBe(1);
      expect(result.value.alreadyExistsCount).toBe(1);
      expect(result.value.failedCount).toBe(1);
    }
  });

  it('基準価額が登録された場合に全体実績が記録される', () => {
    // 前提: 成功が1件以上ある
    // 事前条件: 全体実績が未登録である
    // 検証: 全体実績の作成が呼び出される
    const funds: Fund[] = [
      {
        id: 'fund-success',
        name: '成功ファンド',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
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

    const navRepository: NavRepository = {
      listByFundId: () => ok([]),
      findByFundAndDate: () => ok(null),
      findLatestByFundId: () => ok(null),
      createNav: () => ok(undefined),
    };

    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      createTransaction: () => ok(undefined),
      findByIdempotencyKey: () => ok(null),
      findById: () => ok(null),
      updateTransaction: () => ok(undefined),
      deleteTransaction: () => ok(undefined),
    };

    let globalRecorded = false;
    const performanceRepository: PerformanceRepository = {
      createPerformance: () => ok(undefined),
      createGlobalPerformance: (performance: PerformanceRecord) => {
        globalRecorded = true;
        expect(performance.date).toBe('2024-03-05');
        return ok(undefined);
      },
      findByFundAndDate: () => ok(null),
      findGlobalByDate: () => ok(null),
      findLatestByFundId: () => ok(null),
    };

    const rakutenService: RakutenService = {
      fetchLatestNav: () =>
        ok({
          rakutenFundId: 'ABCD1234EFGH',
          nav: { date: '2024-03-05', value: 10000 },
        }),
    };

    const useCase = createNavFetchUseCase(
      fundRepository,
      navRepository,
      transactionRepository,
      performanceRepository,
      rakutenService,
      wealthAdvisorService
    );

    const result = useCase.fetchAndRegisterAllNavs();
    expect(result.success).toBe(true);
    expect(globalRecorded).toBe(true);
  });

  it('ポートフォリオの評価損益率が欠損する場合は全体実績が記録されない', () => {
    // 前提: 複数ファンドを保有しており、そのうち1ファンドは基準価額取得元未設定のため
    //   基準価額の取得がスキップされ、最新の基準価額が一度も登録されていない（現在値が欠損する）。
    // 事前条件: 各ファンドに購入取引が存在し、全体実績は未登録で、楽天ファンドID設定済みの
    //   ファンドは基準価額の取得・登録に成功する（successCount > 0 となり全体実績記録が実行される）。
    // 検証: calculatePortfolio が評価損益率を null にした場合、全体実績の作成が呼び出されない。
    const funds: Fund[] = [
      {
        id: 'fund-with-nav',
        name: '基準価額ありファンド',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-without-nav',
        name: '基準価額欠損ファンド',
        // 基準価額取得元未設定 → processFund がスキップし createNav が呼ばれないため、
        // findLatestByFundId が null を返す（= 現在値欠損）状態が実リポジトリの挙動と整合する。
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
        id: 'transaction-with-nav',
        fundId: 'fund-with-nav',
        type: 'SPOT_PURCHASE',
        date: '2024-02-01',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: 'purchase-with-nav',
        createdAt: '2024-02-01T00:00:00.000Z',
      },
      {
        id: 'transaction-without-nav',
        fundId: 'fund-without-nav',
        type: 'SPOT_PURCHASE',
        date: '2024-02-01',
        amount: 20000,
        navValue: 10000,
        units: 20000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: 'purchase-without-nav',
        createdAt: '2024-02-01T00:00:00.000Z',
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

    const navRepository: NavRepository = {
      listByFundId: () => ok([]),
      findByFundAndDate: () => ok(null),
      findLatestByFundId: (fundId) =>
        fundId === 'fund-without-nav'
          ? ok(null)
          : ok({
              fundId,
              date: '2024-03-05',
              value: 11000,
              createdAt: '2024-03-05T00:00:00.000Z',
            }),
      createNav: () => ok(undefined),
    };

    const transactionRepository: TransactionRepository = {
      listByFundId: (fundId) =>
        ok(transactions.filter((transaction) => transaction.fundId === fundId)),
      listAll: () => ok(transactions),
      createTransaction: () => ok(undefined),
      findByIdempotencyKey: () => ok(null),
      findById: () => ok(null),
      updateTransaction: () => ok(undefined),
      deleteTransaction: () => ok(undefined),
    };

    const createGlobalPerformance = vi.fn(() => ok(undefined));
    const performanceRepository: PerformanceRepository = {
      createPerformance: () => ok(undefined),
      createGlobalPerformance,
      findByFundAndDate: () => ok(null),
      findGlobalByDate: () => ok(null),
      findLatestByFundId: () => ok(null),
    };

    const rakutenService: RakutenService = {
      fetchLatestNav: (rakutenFundId) =>
        ok({
          rakutenFundId,
          nav: { date: '2024-03-05', value: 11000 },
        }),
    };

    const useCase = createNavFetchUseCase(
      fundRepository,
      navRepository,
      transactionRepository,
      performanceRepository,
      rakutenService,
      wealthAdvisorService
    );

    const result = useCase.fetchAndRegisterAllNavs();

    expect(result.success).toBe(true);
    expect(createGlobalPerformance).not.toHaveBeenCalled();
  });

  it('ファンド別実績記録に失敗した場合は [ERROR] 重要度でログ出力される', () => {
    // 前提: 基準価額の取得・登録は成功するが、ファンド別実績シートへの永続化に失敗する。
    //   このケースは「取得成功・保存失敗 = データロスト」であり、同一日付の再実行では
    //   NAV が既存と判定され実績記録が再試行されず自動回復しない。気付きにくい静かな欠落を
    //   検知できるよう [ERROR] で記録することを固定する（#137、severity 引き上げの回帰防止）。
    // 事前条件: recordFundPerformance の重複チェック（findByFundAndDate）自体を失敗させることで
    //   実績記録処理を失敗パスへ導く。全体実績は「既存」を返して早期成功させ、ログを分離する。
    // 検証: Logger.log が [ERROR] プレフィックス付きのファンド別実績失敗メッセージで呼ばれる。
    const funds: Fund[] = [
      {
        id: 'fund-success',
        name: '成功ファンド',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
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

    const navRepository: NavRepository = {
      listByFundId: () => ok([]),
      findByFundAndDate: () => ok(null),
      findLatestByFundId: () => ok(null),
      createNav: () => ok(undefined),
    };

    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      createTransaction: () => ok(undefined),
      findByIdempotencyKey: () => ok(null),
      findById: () => ok(null),
      updateTransaction: () => ok(undefined),
      deleteTransaction: () => ok(undefined),
    };

    // 既存の全体実績（重複扱いにして全体実績記録を早期成功させ、ファンド別失敗ログのみを分離する）。
    const 既存全体実績: PerformanceRecord = {
      fundId: '',
      date: '2024-03-05',
      totalUnits: 0,
      remainingInvestment: 0,
      currentValue: 0,
      totalGain: 0,
      unrealizedGainRate: 0,
      createdAt: '2024-03-05T00:00:00.000Z',
    };

    const performanceRepository: PerformanceRepository = {
      createPerformance: () => ok(undefined),
      createGlobalPerformance: () => ok(undefined),
      // ファンド別実績の重複チェックを失敗させ、recordFundPerformance を失敗パスへ導く。
      findByFundAndDate: () => fail('unexpected', 'ファンド別実績シートの読み取りに失敗しました。'),
      // 全体実績は既存扱いで早期成功させる（全体実績失敗ログを混入させない）。
      findGlobalByDate: () => ok(既存全体実績),
      findLatestByFundId: () => ok(null),
    };

    const rakutenService: RakutenService = {
      fetchLatestNav: () =>
        ok({
          rakutenFundId: 'ABCD1234EFGH',
          nav: { date: '2024-03-05', value: 10000 },
        }),
    };

    const logSpy = vi.spyOn(globalThis.Logger, 'log');
    logSpy.mockClear();

    const useCase = createNavFetchUseCase(
      fundRepository,
      navRepository,
      transactionRepository,
      performanceRepository,
      rakutenService,
      wealthAdvisorService
    );

    const result = useCase.fetchAndRegisterAllNavs();

    // NAV 取得・登録自体は成功し、ユースケース全体は成功で返る（実績記録失敗はエラーにしない）。
    expect(result.success).toBe(true);
    // ファンド別実績失敗が [ERROR] 重要度でログ出力される（[WARN] ではない）。
    expect(logSpy).toHaveBeenCalledWith(
      '[ERROR] [成功ファンド] ファンド別実績記録に失敗: ファンド別実績シートの読み取りに失敗しました。'
    );
    // 実績記録失敗が結果の performanceFailures に scope='fund' として集約される（#144、通知連携用）。
    if (result.success) {
      expect(result.value.performanceFailures).toEqual([
        {
          scope: 'fund',
          fundId: 'fund-success',
          fundName: '成功ファンド',
          message: 'ファンド別実績シートの読み取りに失敗しました。',
        },
      ]);
    }
  });

  it('全体実績記録に失敗した場合は [ERROR] 重要度でログ出力される', () => {
    // 前提: 基準価額の取得・登録は成功するが、全体実績シートへの永続化に失敗する。
    //   このケースも「取得成功・保存失敗 = データロスト」であり、失敗した日付が再び最新日付に
    //   なることはなく自動回復しない。気付きにくい静かな欠落を検知できるよう [ERROR] で記録する
    //   ことを固定する（#137、severity 引き上げの回帰防止）。
    // 事前条件: 全体実績の重複チェック（findGlobalByDate）を失敗させ、recordGlobalPerformance を
    //   失敗パスへ導く。ファンド別実績は「既存」を返して早期成功させ、ログを分離する。
    // 検証: Logger.log が [ERROR] プレフィックス付きの全体実績失敗メッセージで呼ばれる。
    const funds: Fund[] = [
      {
        id: 'fund-success',
        name: '成功ファンド',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
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

    const navRepository: NavRepository = {
      listByFundId: () => ok([]),
      findByFundAndDate: () => ok(null),
      findLatestByFundId: () => ok(null),
      createNav: () => ok(undefined),
    };

    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      createTransaction: () => ok(undefined),
      findByIdempotencyKey: () => ok(null),
      findById: () => ok(null),
      updateTransaction: () => ok(undefined),
      deleteTransaction: () => ok(undefined),
    };

    // 既存のファンド別実績（重複扱いにしてファンド別実績記録を早期成功させ、全体実績失敗ログのみを分離する）。
    const 既存ファンド別実績: PerformanceRecord = {
      fundId: 'fund-success',
      date: '2024-03-05',
      totalUnits: 0,
      remainingInvestment: 0,
      currentValue: 0,
      totalGain: 0,
      unrealizedGainRate: 0,
      createdAt: '2024-03-05T00:00:00.000Z',
    };

    const performanceRepository: PerformanceRepository = {
      createPerformance: () => ok(undefined),
      createGlobalPerformance: () => ok(undefined),
      // ファンド別実績は既存扱いで早期成功させる（ファンド別失敗ログを混入させない）。
      findByFundAndDate: () => ok(既存ファンド別実績),
      // 全体実績の重複チェックを失敗させ、recordGlobalPerformance を失敗パスへ導く。
      findGlobalByDate: () => fail('unexpected', '全体実績シートの読み取りに失敗しました。'),
      findLatestByFundId: () => ok(null),
    };

    const rakutenService: RakutenService = {
      fetchLatestNav: () =>
        ok({
          rakutenFundId: 'ABCD1234EFGH',
          nav: { date: '2024-03-05', value: 10000 },
        }),
    };

    const logSpy = vi.spyOn(globalThis.Logger, 'log');
    logSpy.mockClear();

    const useCase = createNavFetchUseCase(
      fundRepository,
      navRepository,
      transactionRepository,
      performanceRepository,
      rakutenService,
      wealthAdvisorService
    );

    const result = useCase.fetchAndRegisterAllNavs();

    // NAV 取得・登録自体は成功し、ユースケース全体は成功で返る（実績記録失敗はエラーにしない）。
    expect(result.success).toBe(true);
    // 全体実績失敗が [ERROR] 重要度でログ出力される（[WARN] ではない）。
    expect(logSpy).toHaveBeenCalledWith(
      '[ERROR] 全体実績記録に失敗: 全体実績シートの読み取りに失敗しました。'
    );
    // 実績記録失敗が結果の performanceFailures に scope='global' として集約される（#144、通知連携用）。
    if (result.success) {
      expect(result.value.performanceFailures).toEqual([
        {
          scope: 'global',
          fundId: null,
          fundName: null,
          message: '全体実績シートの読み取りに失敗しました。',
        },
      ]);
    }
  });

  it('wealthadvisor取得、設定欠落、二重指定、取得元未設定を明示的に分類する', () => {
    // 前提: Wealth Advisor成功、取得元コード欠落、楽天との二重指定、取得元未設定の4銘柄が存在する。
    // 事前条件: Wealth Advisorサービスは実在に近いSBIゴールドファンドのNAVを返す。
    // 検証: 各銘柄がsuccess、failed、failed、skippedに分類され、別取得元へフォールバックしない。
    const funds: Fund[] = [
      {
        id: 'fund-wealthadvisor-success',
        name: 'ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: 'wealthadvisor',
        navSourceCode: 'sbi_am/sa_202306080A',
        assetClass: null,
        createdAt: '2026-09-02T00:00:00.000Z',
      },
      {
        id: 'fund-code-missing',
        name: 'ＳＢＩ・限定販売ファンド（コード欠落）',
        rakutenFundId: null,
        settlementBusinessDays: 2,
        navSource: 'wealthadvisor',
        navSourceCode: null,
        assetClass: null,
        createdAt: '2026-09-02T00:00:00.000Z',
      },
      {
        id: 'fund-duplicated-source',
        name: 'ＳＢＩ・限定販売ファンド（二重指定）',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: 2,
        navSource: 'wealthadvisor',
        navSourceCode: 'sbi_am/sa_202306080A',
        assetClass: null,
        createdAt: '2026-09-02T00:00:00.000Z',
      },
      {
        id: 'fund-no-source',
        name: '取得元未設定ファンド',
        rakutenFundId: null,
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2026-09-02T00:00:00.000Z',
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
    const navRepository: NavRepository = {
      listByFundId: () => ok([]),
      findByFundAndDate: () => ok(null),
      findLatestByFundId: () => ok(null),
      findLatestByFundIds: () => ok(new Map()),
      createNav: () => ok(undefined),
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
    const performanceRepository: PerformanceRepository = {
      createPerformance: () => ok(undefined),
      createGlobalPerformance: () => ok(undefined),
      findByFundAndDate: () => ok(null),
      findGlobalByDate: () => ok(null),
      findLatestByFundId: () => ok(null),
      listGlobalHistory: () => ok([]),
      findGlobalByDateRange: () => ok([]),
      findByFundAndDateRange: () => ok([]),
    };
    const rakutenService: RakutenService = {
      fetchLatestNav: () => fail('unexpected', '楽天サービスは呼び出されてはいけません。'),
    };
    const result = createNavFetchUseCase(
      fundRepository,
      navRepository,
      transactionRepository,
      performanceRepository,
      rakutenService,
      wealthAdvisorService
    ).fetchAndRegisterAllNavs();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.items.map((item) => item.status)).toEqual([
        'success',
        'failed',
        'failed',
        'skipped',
      ]);
      expect(result.value.items[1]?.message).toContain('取得元コード');
      expect(result.value.items[2]?.message).toBe('取得元が二重に指定されています。');
      expect(result.value.items[3]?.message).toBe('基準価額の取得元が設定されていません。');
    }
  });

  it('孤立したnavSourceCodeではどちらの取得サービスも呼ばずfailedにする', () => {
    // 前提: navSourceがnullなのにnavSourceCodeと楽天ファンドIDが同時に存在する不整合なFundである。
    // 事前条件: FundRepository以外の将来経路からFundが渡された状況を再現する。
    // 検証: 楽天・Wealth Advisorの両サービスを呼ばず、設定不整合としてfailedを返す。
    const fund: Fund = {
      id: 'fund-orphan-source-code',
      name: 'ＳＢＩ・取得元不整合ファンド',
      rakutenFundId: 'ABCD1234EFGH',
      settlementBusinessDays: 2,
      navSource: null,
      navSourceCode: 'sbi_am/sa_202306080A',
      assetClass: null,
      createdAt: '2026-09-02T00:00:00.000Z',
    };
    const fundRepository: FundRepository = {
      listFunds: () => ok([fund]),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
      updateAssetClass: () => ok(undefined),
    };
    const navRepository: NavRepository = {
      listByFundId: () => ok([]),
      findByFundAndDate: () => ok(null),
      findLatestByFundId: () => ok(null),
      findLatestByFundIds: () => ok(new Map()),
      createNav: () => ok(undefined),
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
    const performanceRepository: PerformanceRepository = {
      createPerformance: () => ok(undefined),
      createGlobalPerformance: () => ok(undefined),
      findByFundAndDate: () => ok(null),
      findGlobalByDate: () => ok(null),
      findLatestByFundId: () => ok(null),
      listGlobalHistory: () => ok([]),
      findGlobalByDateRange: () => ok([]),
      findByFundAndDateRange: () => ok([]),
    };
    const rakutenFetch = vi.fn(() => fail('unexpected', '呼び出されてはいけません。'));
    const wealthAdvisorFetch = vi.fn(() => fail('unexpected', '呼び出されてはいけません。'));
    const rakutenService: RakutenService = { fetchLatestNav: rakutenFetch };
    const defensiveWealthAdvisorService: WealthAdvisorService = {
      fetchLatestNav: wealthAdvisorFetch,
    };

    const result = createNavFetchUseCase(
      fundRepository,
      navRepository,
      transactionRepository,
      performanceRepository,
      rakutenService,
      defensiveWealthAdvisorService
    ).fetchAndRegisterAllNavs();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.items[0]?.status).toBe('failed');
      expect(result.value.items[0]?.message).toBe('取得元の設定が不整合です。');
    }
    expect(rakutenFetch).not.toHaveBeenCalled();
    expect(wealthAdvisorFetch).not.toHaveBeenCalled();
  });

  it('取引0件（取引シート未作成）の銘柄でもファンド別実績の記録失敗が発生しない', () => {
    // 前提: 取引シートが未作成で、取引が0件の銘柄が1件存在する。
    // 事前条件: 楽天証券から基準価額を取得・登録でき、ファンド別実績は未記録である。
    // 検証: 処理が成功し、実績記録失敗が発生せず、保有なしのためファンド別実績も記録されない。
    const fund: Fund = {
      id: '01M2EB1JSER5M3RAZP4N9AVTDZ',
      name: 'ＳＢＩ・ｉシェアーズ・ゴールドファンド（為替ヘッジなし）',
      rakutenFundId: 'TDZ',
      settlementBusinessDays: null,
      navSource: null,
      navSourceCode: null,
      assetClass: null,
      createdAt: '2026-09-02T00:00:00.000Z',
    };
    const fundRepository: FundRepository = {
      listFunds: () => ok([fund]),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
      updateAssetClass: () => ok(undefined),
    };
    const navRepository: NavRepository = {
      listByFundId: () => ok([]),
      findByFundAndDate: () => ok(null),
      findLatestByFundId: () => ok(null),
      createNav: () => ok(undefined),
    };
    // 取引シート未作成の状態を、フェイクではなく本物のTransactionRepositoryで再現する。
    // これにより「シート不存在＝取引0件」という統一契約をリポジトリ層まで通して検証する。
    const transactionRepository = createEmptyTransactionRepository();
    let performanceRecorded = false;
    const performanceRepository: PerformanceRepository = {
      createPerformance: () => {
        performanceRecorded = true;
        return ok(undefined);
      },
      createGlobalPerformance: () => ok(undefined),
      findByFundAndDate: () => ok(null),
      findGlobalByDate: () => ok(null),
      findLatestByFundId: () => ok(null),
    };
    const rakutenService: RakutenService = {
      fetchLatestNav: (rakutenFundId) =>
        ok({
          rakutenFundId,
          nav: { date: '2026-09-01', value: 26093 },
        }),
    };

    const result = createNavFetchUseCase(
      fundRepository,
      navRepository,
      transactionRepository,
      performanceRepository,
      rakutenService,
      wealthAdvisorService
    ).fetchAndRegisterAllNavs();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.performanceFailures).toEqual([]);
    }
    expect(performanceRecorded).toBe(false);
  });
});
