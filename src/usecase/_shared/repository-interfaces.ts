/**
 * リポジトリインターフェース
 *
 * UseCase層で使用するリポジトリの抽象定義。
 * Infrastructure層で実装される。
 */

import { type ResultAsync } from "neverthrow";
import { type RepositoryError } from "../../shared/errors/base-error.js";
import { type Fund } from "../../domain/fund/index.js";
import { type Nav, type NavDate } from "../../domain/nav/index.js";
import { type FundId } from "../../domain/_shared/index.js";

/**
 * 投資信託リポジトリインターフェース
 */
export type FundRepository = {
  /**
   * IDで投資信託を取得する
   *
   * @param id - 投資信託ID
   * @returns 存在すればFund、なければnull
   */
  readonly findById: (id: FundId) => ResultAsync<Fund | null, RepositoryError>;

  /**
   * 全投資信託を取得する
   *
   * @returns 投資信託の配列（登録日時降順）
   */
  readonly findAll: () => ResultAsync<readonly Fund[], RepositoryError>;

  /**
   * 銘柄名で投資信託を取得する
   *
   * @param name - 銘柄名
   * @returns 存在すればFund、なければnull
   */
  readonly findByName: (name: string) => ResultAsync<Fund | null, RepositoryError>;

  /**
   * 投資信託を保存する
   *
   * @param fund - 保存する投資信託
   */
  readonly save: (fund: Fund) => ResultAsync<void, RepositoryError>;
};

/**
 * 基準価額リポジトリインターフェース
 */
export type NavRepository = {
  /**
   * 銘柄・日付で基準価額を取得する
   *
   * @param fundId - 投資信託ID
   * @param date - 基準価額日付
   * @returns 存在すればNav、なければnull
   */
  readonly findByFundAndDate: (
    fundId: FundId,
    date: NavDate
  ) => ResultAsync<Nav | null, RepositoryError>;

  /**
   * 銘柄の最新基準価額を取得する
   *
   * @param fundId - 投資信託ID
   * @returns 存在すればNav、なければnull
   */
  readonly findLatestByFund: (fundId: FundId) => ResultAsync<Nav | null, RepositoryError>;

  /**
   * 銘柄の基準価額履歴を取得する
   *
   * @param fundId - 投資信託ID
   * @param limit - 取得件数上限（未指定で全件）
   * @returns 基準価額の配列（日付降順）
   */
  readonly findHistoryByFund: (
    fundId: FundId,
    limit?: number
  ) => ResultAsync<readonly Nav[], RepositoryError>;

  /**
   * 基準価額を保存する
   *
   * 同一銘柄・同一日付の基準価額が既に存在する場合は上書き更新する。
   *
   * @param nav - 保存する基準価額
   */
  readonly save: (nav: Nav) => ResultAsync<void, RepositoryError>;
};

/**
 * リポジトリコンテナ
 *
 * UseCase層で使用するリポジトリをまとめたオブジェクト。
 */
export type Repositories = {
  readonly fund: FundRepository;
  readonly nav: NavRepository;
};
