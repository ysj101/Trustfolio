import { describe, expect, it } from 'vitest';
import { createFundUseCase } from '../../src/usecase/FundUseCase';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { Fund } from '../../src/domain/types';
import { ok, fail } from '../fakes';

function createFundRepository(seed: Fund[] = []): FundRepository {
  const funds = [...seed];
  return {
    listFunds: () => ok([...funds]),
    findByName: (name) => ok(funds.find((item) => item.name === name) ?? null),
    findById: (id) => ok(funds.find((item) => item.id === id) ?? null),
    createFund: (fund) => {
      funds.push(fund);
      return ok(undefined);
    },
    updateFund: (fund) => {
      const index = funds.findIndex((item) => item.id === fund.id);
      if (index === -1) {
        return fail('not_found', `対象の銘柄が見つかりません: id=${fund.id}`);
      }
      funds[index] = fund;
      return ok(undefined);
    },
  };
}

describe('FundUseCase', () => {
  it('銘柄名が空の場合はバリデーションエラーになる', () => {
    // 前提: 銘柄名が空文字列である
    // 事前条件: リポジトリは空である
    // 検証: nameフィールドのエラーが返る
    const repository = createFundRepository();
    const useCase = createFundUseCase(repository);
    const result = useCase.createFund({
      name: ' ',
      rakutenFundId: null,
      settlementBusinessDays: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('name');
    }
  });

  it('同名銘柄が存在する場合は競合エラーになる', () => {
    // 前提: 既に同名の銘柄が存在する
    // 事前条件: リポジトリに銘柄を登録済みとする
    // 検証: conflictエラーが返る
    const repository = createFundRepository([
      {
        id: 'fund-1',
        name: 'つみたて日本株',
        rakutenFundId: null,
        settlementBusinessDays: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    const useCase = createFundUseCase(repository);
    const result = useCase.createFund({
      name: 'つみたて日本株',
      rakutenFundId: ' ABCD1234EFGH ',
      settlementBusinessDays: 3,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('conflict');
    }
  });

  it('銘柄を作成するとIDと作成日時が設定される', () => {
    // 前提: 銘柄名と楽天ファンドIDが有効である
    // 事前条件: リポジトリに同名銘柄が存在しない
    // 検証: 銘柄が作成され、トリム後の値が保持される
    const repository = createFundRepository();
    const useCase = createFundUseCase(repository);
    const result = useCase.createFund({
      name: '  世界株インデックス  ',
      rakutenFundId: ' ABCD1234EFGH ',
      settlementBusinessDays: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.name).toBe('世界株インデックス');
      expect(result.value.rakutenFundId).toBe('ABCD1234EFGH');
      expect(result.value.id).not.toBe('');
      expect(result.value.createdAt).toContain('T');
    }
  });

  it('更新対象が存在しない場合はnot_foundになる', () => {
    // 前提: 更新対象のIDが存在しない
    // 事前条件: リポジトリは空である
    // 検証: not_foundエラーが返る
    const repository = createFundRepository();
    const useCase = createFundUseCase(repository);
    const result = useCase.updateFund({
      id: 'missing-id',
      name: '国内債券ファンド',
      rakutenFundId: null,
      settlementBusinessDays: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('not_found');
    }
  });

  it('同名の別銘柄が存在する場合は競合エラーになる', () => {
    // 前提: 同名の別銘柄が存在する
    // 事前条件: 2つの銘柄が登録済み
    // 検証: conflictエラーが返る
    const repository = createFundRepository([
      {
        id: 'fund-1',
        name: '新興国株式',
        rakutenFundId: null,
        settlementBusinessDays: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-2',
        name: '国内債券',
        rakutenFundId: null,
        settlementBusinessDays: null,
        createdAt: '2024-01-02T00:00:00.000Z',
      },
    ]);
    const useCase = createFundUseCase(repository);
    const result = useCase.updateFund({
      id: 'fund-2',
      name: '新興国株式',
      rakutenFundId: null,
      settlementBusinessDays: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('conflict');
    }
  });

  it('更新時は作成日時を維持する', () => {
    // 前提: 更新対象が存在する
    // 事前条件: 作成日時が設定されている
    // 検証: 更新後もcreatedAtが保持される
    const repository = createFundRepository([
      {
        id: 'fund-1',
        name: '国内株式',
        rakutenFundId: 'ABCD1234EFGH',
        settlementBusinessDays: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]);
    const useCase = createFundUseCase(repository);
    const result = useCase.updateFund({
      id: 'fund-1',
      name: '国内株式（更新後）',
      rakutenFundId: 'ABCD1234EFGH',
      settlementBusinessDays: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.value.name).toBe('国内株式（更新後）');
    }
  });

  it('ファンドID末尾3文字が重複する場合は更新を拒否する', () => {
    // 前提: 更新対象以外のファンドと末尾3文字が一致する
    // 事前条件: 2件のファンドが存在し、末尾3文字が一致する
    // 検証: conflictエラーが返る
    const repository = createFundRepository([
      {
        id: 'fund-999',
        name: '国内債券',
        rakutenFundId: null,
        settlementBusinessDays: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'abc999',
        name: '国内株式',
        rakutenFundId: null,
        settlementBusinessDays: null,
        createdAt: '2024-01-02T00:00:00.000Z',
      },
    ]);
    const useCase = createFundUseCase(repository);
    const result = useCase.updateFund({
      id: 'fund-999',
      name: '国内債券（更新）',
      rakutenFundId: null,
      settlementBusinessDays: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('conflict');
    }
  });
});
