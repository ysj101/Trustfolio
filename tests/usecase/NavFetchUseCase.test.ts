import { describe, expect, it, vi } from 'vite-plus/test';
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
      findLatestByFundIds: (fundIds) =>
        ok(
          new Map(
            fundIds.map((fundId) => [
              fundId,
              {
                fundId,
                date: '2024-03-05',
                value: 10000,
                createdAt: '2024-03-05T00:00:00.000Z',
              },
            ])
          )
        ),
      createNav: () => ok(undefined),
    };

    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      // 渡したfundIdsの全件をキーに含めるという本物のリポジトリの契約を、フェイクでも守る。
      listByFundIdsGrouped: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, []]))),
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
      findLatestByFundIds: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, null]))),
      createNav: () => ok(undefined),
    };

    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      // 渡したfundIdsの全件をキーに含めるという本物のリポジトリの契約を、フェイクでも守る。
      listByFundIdsGrouped: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, []]))),
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
      findLatestByFundIds: (fundIds) =>
        ok(
          new Map(
            fundIds.map((fundId) => [
              fundId,
              fundId === 'fund-without-nav'
                ? null
                : {
                    fundId,
                    date: '2024-03-05',
                    value: 11000,
                    createdAt: '2024-03-05T00:00:00.000Z',
                  },
            ])
          )
        ),
      createNav: () => ok(undefined),
    };

    const transactionRepository: TransactionRepository = {
      listByFundId: (fundId) =>
        ok(transactions.filter((transaction) => transaction.fundId === fundId)),
      listAll: () => ok(transactions),
      listByFundIdsGrouped: () =>
        ok(
          new Map(
            funds.map((fund) => [
              fund.id,
              transactions.filter((transaction) => transaction.fundId === fund.id),
            ])
          )
        ),
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
      findLatestByFundIds: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, null]))),
      createNav: () => ok(undefined),
    };

    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      // 渡したfundIdsの全件をキーに含めるという本物のリポジトリの契約を、フェイクでも守る。
      listByFundIdsGrouped: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, []]))),
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
      findLatestByFundIds: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, null]))),
      createNav: () => ok(undefined),
    };

    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      // 渡したfundIdsの全件をキーに含めるという本物のリポジトリの契約を、フェイクでも守る。
      listByFundIdsGrouped: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, []]))),
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
      findLatestByFundIds: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, null]))),
      createNav: () => ok(undefined),
    };
    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      // 渡したfundIdsの全件をキーに含めるという本物のリポジトリの契約を、フェイクでも守る。
      listByFundIdsGrouped: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, []]))),
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
      findLatestByFundIds: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, null]))),
      createNav: () => ok(undefined),
    };
    const transactionRepository: TransactionRepository = {
      listByFundId: () => ok([]),
      listAll: () => ok([]),
      // 渡したfundIdsの全件をキーに含めるという本物のリポジトリの契約を、フェイクでも守る。
      listByFundIdsGrouped: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, []]))),
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
      findLatestByFundIds: (fundIds) => ok(new Map(fundIds.map((fundId) => [fundId, null]))),
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

  it('全体実績記録は銘柄単位の取引読取を行わず一括取得を各1回だけ行う', () => {
    // 前提: 基準価額を登録する取引あり銘柄が2件あり、全体実績は未登録である。
    // 事前条件: 取引履歴の各読取メソッドを数え、2銘柄ともファンド別実績を記録できる。
    // 検証: recordGlobalPerformanceが一括取引・一括基準価額取得を各1回だけ行い、
    //       単数の基準価額取得と全件取引取得を行わない。ファンド別実績の個別読取は別契約である。
    const funds: Fund[] = [
      {
        id: 'fund-read-once-a',
        name: '読取回数検証ファンドA',
        rakutenFundId: 'READONCE1234',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-read-once-b',
        name: '読取回数検証ファンドB',
        rakutenFundId: 'READONCE5678',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    let groupedCalls = 0;
    let listAllCalls = 0;
    let listByFundIdCalls = 0;
    let latestBatchCalls = 0;
    let latestSingleCalls = 0;
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
      findLatestByFundId: () => {
        latestSingleCalls += 1;
        return ok(null);
      },
      findLatestByFundIds: (fundIds) => {
        latestBatchCalls += 1;
        return ok(
          new Map(
            fundIds.map((fundId) => [
              fundId,
              {
                fundId,
                date: '2024-03-05',
                value: 10000,
                createdAt: '2024-03-05T00:00:00.000Z',
              },
            ])
          )
        );
      },
      createNav: () => ok(undefined),
    };
    const transactionRepository: TransactionRepository = {
      listByFundId: (fundId) => {
        listByFundIdCalls += 1;
        return ok([
          {
            id: `transaction-${fundId}`,
            fundId,
            type: 'SPOT_PURCHASE',
            date: '2024-02-01',
            amount: 10000,
            navValue: 10000,
            units: 10000,
            incomeTax: null,
            residentTax: null,
            recurringPurchaseId: null,
            idempotencyKey: `transaction-${fundId}`,
            createdAt: '2024-02-01T00:00:00.000Z',
          },
        ]);
      },
      listAll: () => {
        listAllCalls += 1;
        return ok([]);
      },
      listByFundIdsGrouped: (fundIds) => {
        groupedCalls += 1;
        return ok(
          new Map(
            fundIds.map((fundId) => [
              fundId,
              [
                {
                  id: `transaction-${fundId}`,
                  fundId,
                  type: 'SPOT_PURCHASE' as const,
                  date: '2024-02-01',
                  amount: 10000,
                  navValue: 10000,
                  units: 10000,
                  incomeTax: null,
                  residentTax: null,
                  recurringPurchaseId: null,
                  idempotencyKey: `transaction-${fundId}`,
                  createdAt: '2024-02-01T00:00:00.000Z',
                },
              ],
            ])
          )
        );
      },
      createTransaction: () => ok(undefined),
      findByIdempotencyKey: () => ok(null),
      findById: () => ok(null),
      updateTransaction: () => ok(undefined),
      deleteTransaction: () => ok(undefined),
    };
    const performanceRepository: PerformanceRepository = {
      createPerformance: () => ok(undefined),
      createGlobalPerformance: () => ok(undefined),
      // ファンド別実績を既存扱いにして、取引取得の呼び出し回数を全体実績処理だけで検証する。
      findByFundAndDate: () =>
        ok({
          fundId: funds[0]!.id,
          date: '2024-03-05',
          totalUnits: 0,
          remainingInvestment: 0,
          currentValue: 0,
          totalGain: 0,
          unrealizedGainRate: 0,
          createdAt: '2024-03-05T00:00:00.000Z',
        }),
      findGlobalByDate: () => ok(null),
      findLatestByFundId: () => ok(null),
    };
    const result = createNavFetchUseCase(
      fundRepository,
      navRepository,
      transactionRepository,
      performanceRepository,
      {
        fetchLatestNav: () =>
          ok({
            rakutenFundId: funds[0]!.rakutenFundId!,
            nav: { date: '2024-03-05', value: 10000 },
          }),
      },
      wealthAdvisorService
    ).fetchAndRegisterAllNavs();
    expect(result.success).toBe(true);
    expect(groupedCalls).toBe(1);
    expect(latestBatchCalls).toBe(1);
    expect(latestSingleCalls).toBe(0);
    expect(listAllCalls).toBe(0);
    // ファンド別実績を既存扱いにしているため、ここで数えた個別読取はすべて全体実績処理由来である。
    // 全体実績が銘柄ごとの読取へ戻る退行を、0回であることで固定する。
    expect(listByFundIdCalls).toBe(0);
  });

  it.each([
    ['取引履歴', 'transaction', '取引履歴の取得に失敗しました。'],
    ['基準価額', 'nav', '基準価額の取得に失敗しました。'],
  ] as const)(
    '%s取得の失敗を全体実績の失敗として伝播する',
    (_description, failureTarget, expectedMessage) => {
      // 前提: 基準価額登録に成功し、全体実績計算時の指定した取得処理だけが失敗する。
      // 検証: 基準価額登録は継続し、全体実績の失敗要素が通知され、全体実績は作成されない。
      const fund: Fund = {
        id: 'fund-global-performance-error',
        name: '全体実績失敗検証ファンド',
        rakutenFundId: 'GLOBALERROR123',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
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
        findLatestByFundIds: () =>
          failureTarget === 'nav'
            ? fail('unexpected', expectedMessage)
            : ok(
                new Map([
                  [
                    fund.id,
                    {
                      fundId: fund.id,
                      date: '2024-03-05',
                      value: 10000,
                      createdAt: '2024-03-05T00:00:00.000Z',
                    },
                  ],
                ])
              ),
        createNav: () => ok(undefined),
      };
      const transactionRepository: TransactionRepository = {
        listByFundId: () => ok([]),
        listAll: () => ok([]),
        listByFundIdsGrouped: () =>
          failureTarget === 'transaction'
            ? fail('unexpected', expectedMessage)
            : ok(
                new Map([
                  [
                    fund.id,
                    [
                      {
                        id: 'transaction-global-error',
                        fundId: fund.id,
                        type: 'SPOT_PURCHASE' as const,
                        date: '2024-02-01',
                        amount: 10000,
                        navValue: 10000,
                        units: 10000,
                        incomeTax: null,
                        residentTax: null,
                        recurringPurchaseId: null,
                        idempotencyKey: 'transaction-global-error',
                        createdAt: '2024-02-01T00:00:00.000Z',
                      },
                    ],
                  ],
                ])
              ),
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
      const result = createNavFetchUseCase(
        fundRepository,
        navRepository,
        transactionRepository,
        performanceRepository,
        {
          fetchLatestNav: () =>
            ok({ rakutenFundId: fund.rakutenFundId!, nav: { date: '2024-03-05', value: 10000 } }),
        },
        wealthAdvisorService
      ).fetchAndRegisterAllNavs();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.performanceFailures).toContainEqual({
          scope: 'global',
          fundId: null,
          fundName: null,
          message: expectedMessage,
        });
      }
      expect(createGlobalPerformance).not.toHaveBeenCalled();
    }
  );

  // 一括取得が成功しても、渡した銘柄IDのキーが欠落していれば契約違反である。
  // 本物のリポジトリでは起こらないが、黙って過少な全体実績を書かないことを取引履歴・基準価額の双方で固定する。
  it.each([
    {
      label: '取引Map',
      missingLabel: '取引履歴',
      dropTransactionKey: true,
    },
    {
      label: '基準価額Map',
      missingLabel: '基準価額',
      dropTransactionKey: false,
    },
  ])(
    '全体実績の$labelで銘柄キーが欠落した場合は過少な実績を記録しない',
    ({ missingLabel, dropTransactionKey }) => {
      // 前提: 2銘柄の基準価額取得・登録がいずれも成功し、全体実績は未登録である。
      // 事前条件: 一括取得は成功を返すが、2銘柄目のキーだけを欠落させる。
      // 検証: 全体実績は作成されず、失敗通知に欠落銘柄IDと対象Mapの名称が含まれる。
      const funds: Fund[] = [
        {
          id: 'fund-map-a',
          name: 'Map検証ファンドA',
          rakutenFundId: 'MAPTESTA1234',
          settlementBusinessDays: null,
          navSource: null,
          navSourceCode: null,
          assetClass: null,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'fund-map-b',
          name: 'Map検証ファンドB',
          rakutenFundId: 'MAPTESTB1234',
          settlementBusinessDays: null,
          navSource: null,
          navSourceCode: null,
          assetClass: null,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ];
      // 欠落させない側は全件を埋め、欠落させる側だけ1銘柄目のみのMapを返す。
      const presentFundIds = [funds[0]!.id];
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
        findLatestByFundIds: (fundIds) =>
          ok(
            new Map(
              (dropTransactionKey ? fundIds : presentFundIds).map((fundId) => [
                fundId,
                { fundId, date: '2024-03-05', value: 10000, createdAt: '2024-03-05T00:00:00.000Z' },
              ])
            )
          ),
        createNav: () => ok(undefined),
      };
      // 基準価額Mapの欠落を検証する場合は、取引0件だと基準価額の取得前に保有なしとして扱われないよう
      // 取引を1件持たせ、requireMapValueの基準価額判定まで到達させる。
      const transaction: Transaction = {
        id: 'transaction-map-check',
        fundId: funds[1]!.id,
        type: 'SPOT_PURCHASE',
        date: '2024-02-01',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: 'transaction-map-check',
        createdAt: '2024-02-01T00:00:00.000Z',
      };
      const transactionRepository: TransactionRepository = {
        listByFundId: () => ok([]),
        listAll: () => ok([]),
        listByFundIdsGrouped: (fundIds) =>
          ok(
            new Map(
              (dropTransactionKey ? presentFundIds : fundIds).map((fundId) => [
                fundId,
                fundId === funds[1]!.id ? [transaction] : [],
              ])
            )
          ),
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
      const result = createNavFetchUseCase(
        fundRepository,
        navRepository,
        transactionRepository,
        performanceRepository,
        {
          fetchLatestNav: (rakutenFundId) =>
            ok({ rakutenFundId, nav: { date: '2024-03-05', value: 10000 } }),
        },
        wealthAdvisorService
      ).fetchAndRegisterAllNavs();

      expect(result.success).toBe(true);
      if (result.success) {
        const globalFailure = result.value.performanceFailures.find(
          (failure) => failure.scope === 'global'
        );
        expect(globalFailure?.message).toContain(funds[1]!.id);
        expect(globalFailure?.message).toContain(missingLabel);
      }
      expect(createGlobalPerformance).not.toHaveBeenCalled();
    }
  );

  it('全体実績は取引あり銘柄だけを集計して従来と同じ計算結果を記録する', () => {
    // 前提: 取引あり銘柄2件と取引0件銘柄1件があり、基準価額の登録に成功する。
    // 事前条件: 銘柄Aは10,000円を11,000円、銘柄Bは20,000円を12,000円として評価する。
    // 検証: 取引0件銘柄はholdingsに含めず、currentValue=(11,000+24,000)=35,000円、
    //   totalGain=currentValue-(10,000+20,000)=5,000円となる。
    const funds: Fund[] = [
      {
        id: 'fund-calc-a',
        name: '計算対象A',
        rakutenFundId: 'CALCA123456',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-calc-b',
        name: '計算対象B',
        rakutenFundId: 'CALCB123456',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-calc-empty',
        name: '計算対象外（取引なし）',
        rakutenFundId: 'CALCEMPTY12',
        settlementBusinessDays: null,
        navSource: null,
        navSourceCode: null,
        assetClass: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const transactions: Transaction[] = [
      {
        id: 'transaction-calc-a',
        fundId: funds[0]!.id,
        type: 'SPOT_PURCHASE',
        date: '2024-02-01',
        amount: 10000,
        navValue: 10000,
        units: 10000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: 'transaction-calc-a',
        createdAt: '2024-02-01T00:00:00.000Z',
      },
      {
        id: 'transaction-calc-b',
        fundId: funds[1]!.id,
        type: 'SPOT_PURCHASE',
        date: '2024-02-01',
        amount: 20000,
        navValue: 10000,
        units: 20000,
        incomeTax: null,
        residentTax: null,
        recurringPurchaseId: null,
        idempotencyKey: 'transaction-calc-b',
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
      findLatestByFundId: () => ok(null),
      findLatestByFundIds: (fundIds) =>
        ok(
          new Map(
            fundIds.map((fundId) => [
              fundId,
              {
                fundId,
                date: '2024-03-05',
                value: fundId === funds[0]!.id ? 11000 : 12000,
                createdAt: '2024-03-05T00:00:00.000Z',
              },
            ])
          )
        ),
      createNav: () => ok(undefined),
    };
    const transactionRepository: TransactionRepository = {
      listByFundId: (fundId) => ok(transactions.filter((item) => item.fundId === fundId)),
      listAll: () => ok(transactions),
      listByFundIdsGrouped: (fundIds) =>
        ok(
          new Map(
            fundIds.map((fundId) => [fundId, transactions.filter((item) => item.fundId === fundId)])
          )
        ),
      createTransaction: () => ok(undefined),
      findByIdempotencyKey: () => ok(null),
      findById: () => ok(null),
      updateTransaction: () => ok(undefined),
      deleteTransaction: () => ok(undefined),
    };
    let recorded: PerformanceRecord | null = null;
    const performanceRepository: PerformanceRepository = {
      createPerformance: () => ok(undefined),
      createGlobalPerformance: (performance) => {
        recorded = performance;
        return ok(undefined);
      },
      findByFundAndDate: () => ok(null),
      findGlobalByDate: () => ok(null),
      findLatestByFundId: () => ok(null),
    };
    const result = createNavFetchUseCase(
      fundRepository,
      navRepository,
      transactionRepository,
      performanceRepository,
      {
        fetchLatestNav: (rakutenFundId) =>
          ok({ rakutenFundId, nav: { date: '2024-03-05', value: 10000 } }),
      },
      wealthAdvisorService
    ).fetchAndRegisterAllNavs();
    expect(result.success).toBe(true);
    expect(recorded).not.toBeNull();
    const recordedPerformance = recorded as PerformanceRecord;
    expect(recordedPerformance.currentValue).toBe(35000);
    expect(recordedPerformance.totalGain).toBe(5000);
  });
});
