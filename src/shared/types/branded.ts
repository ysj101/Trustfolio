/**
 * Branded Types ユーティリティ
 *
 * プリミティブ型に型レベルのブランドを付与することで、
 * 異なる意味を持つ値の混同を防止する。
 *
 * 例: FundIdとNavIdは両方stringだが、型として区別される
 */

/**
 * ブランド付き型を作成するためのシンボル
 *
 * 実行時には存在せず、型チェック時のみ有効
 */
declare const brand: unique symbol;

/**
 * ブランド付き型
 *
 * @typeParam T - ベースとなる型
 * @typeParam Brand - ブランド識別子
 */
export type Branded<T, Brand extends string> = T & {
  readonly [brand]: Brand;
};

/**
 * ブランド付き型を生成するファクトリ関数の型
 *
 * @typeParam T - 入力型
 * @typeParam B - ブランド付き出力型
 */
export type BrandFactory<T, B> = (value: T) => B;

/**
 * ブランドを除去してベース型を取得する
 *
 * @typeParam T - ブランド付き型
 */
export type Unbrand<T> = T extends Branded<infer U, string> ? U : T;
