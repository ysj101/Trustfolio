/**
 * 基底エラー型定義
 *
 * アプリケーション全体で使用するエラー型の基盤。
 * throw/try-catch を使用せず、Result型でエラーを表現する。
 */

/**
 * アプリケーションエラーの基底型
 *
 * 全てのドメインエラーはこの型を継承する。
 * typeプロパティで判別可能なタグ付きユニオンとして使用する。
 */
export type AppError = {
  /** エラー種別（判別用タグ） */
  readonly type: string;
  /** 人間可読なエラーメッセージ */
  readonly message: string;
};

/**
 * バリデーションエラー
 *
 * 入力値が不正な場合に発生する。
 */
export type ValidationError = {
  readonly type: "VALIDATION_ERROR";
  readonly message: string;
  /** 不正なフィールド名（任意） */
  readonly field?: string | undefined;
};

/**
 * リポジトリエラー
 *
 * データベース操作が失敗した場合に発生する。
 */
export type RepositoryError = {
  readonly type: "REPOSITORY_ERROR";
  readonly message: string;
  /** 元となったエラー（デバッグ用） */
  readonly cause?: unknown;
};

/**
 * 存在しないリソースへのアクセスエラー
 *
 * 指定されたIDに対応するエンティティが見つからない場合に発生する。
 */
export type NotFoundError = {
  readonly type: "NOT_FOUND";
  readonly message: string;
  /** リソース種別 */
  readonly resource: string;
  /** 検索に使用したID */
  readonly id: string;
};

/**
 * 重複エラー
 *
 * 一意制約に違反した場合に発生する。
 */
export type DuplicateError = {
  readonly type: "DUPLICATE_ERROR";
  readonly message: string;
  /** 重複したフィールド名 */
  readonly field: string;
  /** 重複した値 */
  readonly value: string;
};

/**
 * ValidationErrorを生成する
 *
 * @param message - エラーメッセージ
 * @param field - 不正なフィールド名（任意）
 * @returns ValidationError
 */
export function createValidationError(
  message: string,
  field?: string
): ValidationError {
  return {
    type: "VALIDATION_ERROR",
    message,
    field,
  };
}

/**
 * RepositoryErrorを生成する
 *
 * @param message - エラーメッセージ
 * @param cause - 元となったエラー（任意）
 * @returns RepositoryError
 */
export function createRepositoryError(
  message: string,
  cause?: unknown
): RepositoryError {
  return {
    type: "REPOSITORY_ERROR",
    message,
    cause,
  };
}

/**
 * NotFoundErrorを生成する
 *
 * @param resource - リソース種別
 * @param id - 検索に使用したID
 * @returns NotFoundError
 */
export function createNotFoundError(
  resource: string,
  id: string
): NotFoundError {
  return {
    type: "NOT_FOUND",
    message: `${resource} with id '${id}' not found`,
    resource,
    id,
  };
}

/**
 * DuplicateErrorを生成する
 *
 * @param field - 重複したフィールド名
 * @param value - 重複した値
 * @returns DuplicateError
 */
export function createDuplicateError(
  field: string,
  value: string
): DuplicateError {
  return {
    type: "DUPLICATE_ERROR",
    message: `${field} '${value}' already exists`,
    field,
    value,
  };
}
