/**
 * 共通モジュールのエクスポート
 */

// Types
export type { Branded, BrandFactory, Unbrand } from "./types/branded.js";

// Errors
export type {
  AppError,
  ValidationError,
  RepositoryError,
  NotFoundError,
  DuplicateError,
} from "./errors/base-error.js";

export {
  createValidationError,
  createRepositoryError,
  createNotFoundError,
  createDuplicateError,
} from "./errors/base-error.js";

// Utils
export {
  combineResults,
  tryCatchAsync,
  tryCatch,
  fromNullable,
  fromNullableAsync,
  toAsync,
} from "./utils/result-helpers.js";
