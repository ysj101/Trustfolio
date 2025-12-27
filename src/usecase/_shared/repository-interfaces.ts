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
import { type FundId, type RecurringPurchaseId } from "../../domain/_shared/index.js";
import { type Transaction, type IdempotencyKey } from "../../domain/transaction/index.js";
import { type RecurringPurchase } from "../../domain/recurring/index.js";

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
 * 取引リポジトリインターフェース
 */
export type TransactionRepository = {
  /**
   * 取引を保存する
   *
   * @param transaction - 保存する取引
   */
  readonly save: (transaction: Transaction) => ResultAsync<void, RepositoryError>;

  /**
   * 冪等性キーで取引を取得する
   *
   * @param key - 冪等性キー
   * @returns 存在すればTransaction、なければnull
   */
  readonly findByIdempotencyKey: (
    key: IdempotencyKey
  ) => ResultAsync<Transaction | null, RepositoryError>;

  /**
   * 銘柄の取引履歴を取得する
   *
   * @param fundId - 投資信託ID
   * @param limit - 取得件数上限（未指定で全件）
   * @returns 取引の配列（日付降順）
   */
  readonly findByFund: (
    fundId: FundId,
    limit?: number
  ) => ResultAsync<readonly Transaction[], RepositoryError>;

  /**
   * 全取引を取得する
   *
   * @returns 全取引の配列
   */
  readonly findAll: () => ResultAsync<readonly Transaction[], RepositoryError>;
};

/**
 * 積立設定リポジトリインターフェース
 */
export type RecurringPurchaseRepository = {
  /**
   * 積立設定を保存する
   *
   * @param recurringPurchase - 保存する積立設定
   */
  readonly save: (recurringPurchase: RecurringPurchase) => ResultAsync<void, RepositoryError>;

  /**
   * IDで積立設定を取得する
   *
   * @param id - 積立設定ID
   * @returns 存在すればRecurringPurchase、なければnull
   */
  readonly findById: (
    id: RecurringPurchaseId
  ) => ResultAsync<RecurringPurchase | null, RepositoryError>;

  /**
   * 銘柄のアクティブな積立設定を取得する
   *
   * @param fundId - 投資信託ID
   * @returns アクティブな積立設定の配列
   */
  readonly findActiveByFund: (
    fundId: FundId
  ) => ResultAsync<readonly RecurringPurchase[], RepositoryError>;

  /**
   * 全積立設定を取得する
   *
   * @returns 全積立設定の配列
   */
  readonly findAll: () => ResultAsync<readonly RecurringPurchase[], RepositoryError>;

  /**
   * 全アクティブな積立設定を取得する
   *
   * @returns アクティブな積立設定の配列
   */
  readonly findAllActive: () => ResultAsync<readonly RecurringPurchase[], RepositoryError>;
};

/**
 * リポジトリコンテナ
 *
 * UseCase層で使用するリポジトリをまとめたオブジェクト。
 */
export type Repositories = {
  readonly fund: FundRepository;
  readonly nav: NavRepository;
  readonly transaction: TransactionRepository;
  readonly recurringPurchase: RecurringPurchaseRepository;
};
