/**
 * リポジトリ実装のエクスポート
 */

import { type DatabaseConnection } from "../database/client.js";
import { type Repositories } from "../../usecase/_shared/repository-interfaces.js";
import { createFundRepository } from "./fund-repository.js";
import { createNavRepository } from "./nav-repository.js";

export { createFundRepository } from "./fund-repository.js";
export { createNavRepository } from "./nav-repository.js";

/**
 * 全リポジトリを作成する
 *
 * @param db - データベース接続
 * @returns リポジトリコンテナ
 */
export function createRepositories(db: DatabaseConnection): Repositories {
  return {
    fund: createFundRepository(db),
    nav: createNavRepository(db),
  };
}
