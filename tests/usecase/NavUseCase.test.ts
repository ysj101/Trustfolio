import { describe, expect, it } from 'vitest';
import { createNavUseCase } from '../../src/usecase/NavUseCase';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { NavRepository } from '../../src/repository/NavRepository';
import type { Fund, Nav } from '../../src/domain/types';
import { ok } from '../fakes';

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

describe('NavUseCase', () => {
  it('銘柄IDが空の場合はバリデーションエラーになる', () => {
    // 前提: 銘柄IDが空文字列である
    // 事前条件: リポジトリは正常応答する
    // 検証: fundIdフィールドのエラーが返る
    const useCase = createNavUseCase(createFundRepository([]), createNavRepository([]));
    const result = useCase.getNavHistory('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('fundId');
    }
  });

  it('対象銘柄が存在しない場合はnot_foundを返す', () => {
    // 前提: 指定した銘柄IDが存在しない
    // 事前条件: 銘柄リストは空である
    // 検証: not_foundエラーが返る
    const useCase = createNavUseCase(createFundRepository([]), createNavRepository([]));
    const result = useCase.getNavHistory('fund-unknown');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('銘柄が存在する場合は基準価額履歴を返す', () => {
    // 前提: 銘柄と基準価額履歴が存在する
    // 事前条件: リポジトリに対象データを登録済みとする
    // 検証: 返却値に基準価額履歴が含まれる
    const funds: Fund[] = [
      {
        id: 'fund-001',
        name: '日本株インデックス',
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
        date: '2024-03-01',
        value: 12345,
        createdAt: '2024-03-01T00:00:00.000Z',
      },
    ];
    const useCase = createNavUseCase(createFundRepository(funds), createNavRepository(navs));
    const result = useCase.getNavHistory('fund-001');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.value).toBe(12345);
    }
  });
});
