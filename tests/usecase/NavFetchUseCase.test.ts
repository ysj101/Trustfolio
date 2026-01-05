import { describe, expect, it } from 'vitest';
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
});
