/**
 * エラー用DTO
 *
 * API エラーレスポンス用のデータ転送オブジェクト。
 */

import { type ContentfulStatusCode } from "hono/utils/http-status";
import {
  type ValidationError,
  type RepositoryError,
  type NotFoundError,
  type DuplicateError,
} from "../../../shared/errors/base-error.js";

/**
 * エラーレスポンスDTO
 */
export type ErrorResponseDto = {
  readonly error: {
    readonly type: string;
    readonly message: string;
    readonly details?: unknown;
  };
};

/**
 * エラーをレスポンスDTOに変換する
 *
 * @param error - エラーオブジェクト
 * @returns レスポンスDTO
 */
export function toErrorResponseDto(
  error: ValidationError | RepositoryError | NotFoundError | DuplicateError
): ErrorResponseDto {
  return {
    error: {
      type: error.type,
      message: error.message,
    },
  };
}

/**
 * エラータイプに対応するHTTPステータスコードを取得する
 *
 * @param errorType - エラータイプ
 * @returns HTTPステータスコード
 */
export function getHttpStatusCode(errorType: string): ContentfulStatusCode {
  switch (errorType) {
    case "VALIDATION_ERROR":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "DUPLICATE_ERROR":
      return 409;
    case "REPOSITORY_ERROR":
      return 500;
    default:
      return 500;
  }
}
