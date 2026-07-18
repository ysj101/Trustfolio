import { describe, expect, it } from 'vitest';
import { assertFundExists } from '../../src/usecase/fundGuard';
import type { FundRepository } from '../../src/repository/FundRepository';
import type { Fund } from '../../src/domain/types';
import { ok, fail } from '../fakes';

/**
 * 銘柄存在確認ガード（assertFundExists）の検証。
 *
 * assertFundExists は複数の UseCase（スポット購入・売却・積立設定・履歴参照）から
 * 共通利用されるガードであり、「取得成功・不在・取得失敗」の3分岐が仕様の全てである。
 */

/** テスト用の銘柄。実データに近い日本語の銘柄名を用いる。 */
const 全世界株式ファンド: Fund = {
  id: 'fund-001',
  name: '全世界株式インデックスファンド',
  rakutenFundId: null,
  settlementBusinessDays: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

/**
 * findById だけを差し替えられる FundRepository スタブを生成する。
 * assertFundExists は findById 以外を呼ばないため、他メソッドは固定の成功応答でよい。
 */
function createFundRepositoryStub(findById: FundRepository['findById']): FundRepository {
  return {
    listFunds: () => ok([]),
    findByName: () => ok(null),
    findById,
    createFund: () => ok(undefined),
    updateFund: () => ok(undefined),
  };
}

describe('assertFundExists', () => {
  it('銘柄が存在する場合はその銘柄を成功で返す', () => {
    // 前提: リポジトリに対象の銘柄が登録されている
    // 事前条件: findById が銘柄を返す
    // 検証: 成功 Result として銘柄の実体がそのまま返る
    const fundRepository = createFundRepositoryStub((fundId) =>
      fundId === 'fund-001' ? ok<Fund | null>(全世界株式ファンド) : ok<Fund | null>(null)
    );

    const result = assertFundExists(fundRepository, 'fund-001');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual(全世界株式ファンド);
    }
  });

  it('銘柄が存在しない場合は not_found エラーを返す', () => {
    // 前提: リポジトリに対象の銘柄が登録されていない
    // 事前条件: findById が null（不在）を返す
    // 検証: type=not_found・既定メッセージ・field=fundId のエラーが返る
    //   （各 UseCase が個別に組み立てていたエラーと完全同一であることが本ガードの契約）
    const fundRepository = createFundRepositoryStub(() => ok<Fund | null>(null));

    const result = assertFundExists(fundRepository, 'fund-999');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toEqual({
        type: 'not_found',
        message: '対象の銘柄が存在しません。',
        field: 'fundId',
      });
    }
  });

  it('リポジトリ取得自体が失敗した場合は元の失敗をそのまま伝播する', () => {
    // 前提: シート読み取り等の理由でリポジトリ取得が失敗する
    // 事前条件: findById が失敗 Result を返す
    // 検証: エラーが not_found へ変換されず、元のエラー情報（type/message）が保持される
    const fundRepository = createFundRepositoryStub(() =>
      fail<Fund | null>('unexpected', '銘柄シートの読み取りに失敗しました。')
    );

    const result = assertFundExists(fundRepository, 'fund-001');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toBe('銘柄シートの読み取りに失敗しました。');
    }
  });
});
