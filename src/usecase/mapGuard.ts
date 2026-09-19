import type { Result } from '../domain/types';
import { fail } from '../domain/result';

/**
 * リポジトリが返すMapから、指定した銘柄の値を取得する共通ガード。
 *
 * 目的:
 * - 「Mapのキーが欠落していれば契約違反として失敗させる」という検査を
 *   UseCaseごとに重複させず、取引履歴と基準価額で同じfail fastの挙動にする。
 *
 * 内容:
 * - キーが存在しない場合は、渡されたラベルを用いたunexpectedエラーを返す。
 * - Mapの値がnullの場合は、基準価額なしなどの正常な状態を表すため、そのまま成功値として返す。
 *   キーの有無をhasで判定することで、nullや値なしと契約違反を混同しない。
 *
 * @typeParam T - Mapに格納される値の型。nullを含む型も指定できる。
 * @param map - リポジトリが返した、銘柄IDをキーとするMap。
 * @param key - 取得する銘柄ID。
 * @param label - エラーメッセージに表示するMapの種類。
 * @returns キーに対応する値、または契約違反を示す失敗Result。
 */
export function requireMapValue<T>(
  map: ReadonlyMap<string, T>,
  key: string,
  label: string
): Result<T> {
  // キーの存在契約そのものを has で検証する。get の結果で判定すると、
  // 値としてundefinedを持つMapに再利用したとき、キーがあるのに契約違反と誤判定する。
  if (!map.has(key)) {
    return fail('unexpected', `${label}Mapに銘柄IDが存在しません: ${key}`);
  }
  return { success: true, value: map.get(key) as T };
}
