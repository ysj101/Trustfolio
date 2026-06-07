import type { Fund, Result } from '../domain/types';
import { fail } from '../domain/result';
import type { FundRepository } from '../repository/FundRepository';

/**
 * 指定した銘柄IDの {@link Fund} が存在することを確認し、その実体を返す共通ガード。
 *
 * 目的:
 * - 各 UseCase（`createRecurringPurchase` / `updateRecurringPurchase` /
 *   `getHistory` / `executeSpotPurchase` / `executeSaleTransaction` /
 *   `updateSpotPurchase` / `updateSaleTransaction`）に重複していた
 *   「`findById` 取得 → 取得失敗の伝播 → 不在時の `not_found` 返却」という
 *   定型処理を一本化する。
 *
 * 内容:
 * - リポジトリ取得自体が失敗した場合は、その失敗 {@link Result} をそのまま返し、
 *   元のエラー情報を保持する（既存挙動を厳密に維持する）。
 * - 銘柄が存在しない場合は `not_found` 種別・メッセージ「対象の銘柄が存在しません。」・
 *   フィールド `fundId` のエラーを返す。これは各 UseCase が個別に組み立てていた
 *   エラーオブジェクトと完全に同一である。
 *
 * 注意:
 * - 約定処理（`executeRecurringPurchases`）内の銘柄チェックは
 *   `fundMap` 経由かつ別メッセージ・フィールド無しのため、本ガードの対象外である。
 *
 * @param fundRepository - 銘柄マスタへのアクセスを担うリポジトリ。
 * @param fundId - 存在を確認したい銘柄ID。
 * @returns 銘柄が存在すれば、その {@link Fund} を持つ成功 {@link Result}。
 */
export function assertFundExists(fundRepository: FundRepository, fundId: string): Result<Fund> {
  const fundResult = fundRepository.findById(fundId);
  if (!fundResult.success) {
    return fundResult;
  }
  if (!fundResult.value) {
    return fail('not_found', '対象の銘柄が存在しません。', 'fundId');
  }
  return { success: true, value: fundResult.value };
}
