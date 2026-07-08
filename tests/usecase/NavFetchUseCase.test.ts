import { describe, expect, it, vi } from 'vitest';
import { createNavFetchUseCase } from '../../src/usecase/NavFetchUseCase';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { NavRepository } from '../../src/repository/NavRepository';
import type { TransactionRepository } from '../../src/repository/TransactionRepository';
import type { PerformanceRepository } from '../../src/repository/PerformanceRepository';
import type { RakutenService } from '../../src/service/RakutenService';
import type { Fund, PerformanceRecord } from '../../src/domain/types';
import { ok, fail } from '../fakes';

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
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-success',
        name: '成功ファンド',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-exists',
        name: '既存ファンド',
        rakutenFundId: 'IJKL1234MNOP',
        settlementBusinessDays: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-fail',
        name: '失敗ファンド',
        rakutenFundId: 'QRST1234UVWX',
        settlementBusinessDays: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    const fundRepository: FundRepository = {
      listFunds: () => ok(funds),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
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
      rakutenService
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
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const fundRepository: FundRepository = {
      listFunds: () => ok(funds),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
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
      rakutenService
    );

    const result = useCase.fetchAndRegisterAllNavs();
    expect(result.success).toBe(true);
    expect(globalRecorded).toBe(true);
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
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    const fundRepository: FundRepository = {
      listFunds: () => ok(funds),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
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
      rakutenService
    );

    const result = useCase.fetchAndRegisterAllNavs();

    // NAV 取得・登録自体は成功し、ユースケース全体は成功で返る（実績記録失敗はエラーにしない）。
    expect(result.success).toBe(true);
    // ファンド別実績失敗が [ERROR] 重要度でログ出力される（[WARN] ではない）。
    expect(logSpy).toHaveBeenCalledWith(
      '[ERROR] [成功ファンド] ファンド別実績記録に失敗: ファンド別実績シートの読み取りに失敗しました。'
    );
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
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    const fundRepository: FundRepository = {
      listFunds: () => ok(funds),
      findByName: () => ok(null),
      findById: () => ok(null),
      createFund: () => ok(undefined),
      updateFund: () => ok(undefined),
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
      rakutenService
    );

    const result = useCase.fetchAndRegisterAllNavs();

    // NAV 取得・登録自体は成功し、ユースケース全体は成功で返る（実績記録失敗はエラーにしない）。
    expect(result.success).toBe(true);
    // 全体実績失敗が [ERROR] 重要度でログ出力される（[WARN] ではない）。
    expect(logSpy).toHaveBeenCalledWith(
      '[ERROR] 全体実績記録に失敗: 全体実績シートの読み取りに失敗しました。'
    );
  });
});
