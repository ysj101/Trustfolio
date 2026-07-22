import type { Result } from '../domain/types';
import { fail, propagateFailure } from '../domain/result';

/**
 * リポジトリの findById 系検索結果に対する共通の存在確認ガード。
 *
 * 目的:
 * - `TransactionUseCase`（updateSpotPurchase / updateSaleTransaction / deleteSpotPurchase）と
 *   `RecurringUseCase`（updateRecurringPurchase / deleteRecurringPurchase）に重複していた
 *   「findById → 取得失敗の伝播 → 不在時の `not_found` 返却」という定型処理を一本化する
 *   （{@link assertFundExists} と同型の汎用版。H4 #150）。
 *
 * 内容:
 * - リポジトリ取得自体が失敗した場合は、その失敗を {@link propagateFailure} で伝播し、
 *   元のエラー情報を保持する（既存挙動を厳密に維持する）。
 * - エンティティが存在しない（null）場合は `not_found` 種別・指定メッセージ・
 *   フィールド `id` のエラーを返す。field を `id` に固定しているのは、
 *   集約元の5箇所すべてが `field: 'id'` を用いていたためである。
 *
 * - 不在判定は「null との明示比較」で行う。型契約（`Result<T | null>`）上、不在を表す値は
 *   null のみであり、`!value` による falsy 判定では T が 0・false・空文字列の場合に
 *   存在する値を不在と誤判定してしまう（暗黙のフォールバック）ため採用しない。
 *
 * @typeParam T - 検索対象のエンティティ型。
 * @param findResult - リポジトリの findById 系メソッドの戻り値。
 * @param notFoundMessage - 不在時に利用者へ提示するメッセージ
 *   （例: '対象の取引履歴が存在しません。'）。
 * @returns エンティティが存在すれば、その実体を持つ成功 {@link Result}。
 */
export function assertEntityFound<T>(
  findResult: Result<T | null>,
  notFoundMessage: string
): Result<T> {
  if (!findResult.success) {
    return propagateFailure(findResult);
  }
  if (findResult.value === null) {
    return fail('not_found', notFoundMessage, 'id');
  }
  return { success: true, value: findResult.value };
}
