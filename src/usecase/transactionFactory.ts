import type { Transaction } from '../domain/types';
import { generateUlid } from '../utils/ulid';
import { clock } from '../utils/dateTime';

/**
 * {@link buildTransaction} の入力。
 *
 * - `id` を省略した場合は {@link generateUlid} で新規採番する（新規登録用途）。
 * - `id` を指定した場合はその値を保持する（更新時の再生成用途）。
 * - `createdAt` を省略した場合は呼び出し時刻を ISO 文字列で採番する（新規登録用途）。
 * - `createdAt` を指定した場合はその値を保持する（更新時に作成日時を維持する用途）。
 * - `recurringPurchaseId` / `idempotencyKey` を省略した場合は `null` を設定する
 *   （スポット購入・売却の既存挙動）。
 */
export type BuildTransactionInput = {
  type: Transaction['type'];
  fundId: string;
  date: string;
  amount: number;
  navValue: number;
  units: number;
  recurringPurchaseId?: string | null;
  idempotencyKey?: string | null;
  id?: string;
  createdAt?: string;
};

/**
 * {@link Transaction} を生成する共通ファクトリ。
 *
 * 目的:
 * - `RecurringUseCase`（RECURRING_PURCHASE）と `TransactionUseCase`
 *   （SPOT_PURCHASE / REDEMPTION の新規・更新）に分散していた、
 *   10 フィールドをほぼ同形で組み立てる定型処理を集約する。
 *
 * 内容:
 * - `id` 未指定時のみ {@link generateUlid} を、`createdAt` 未指定時のみ
 *   `clock.nowIso()` を評価する（`??` の短絡により、指定済みの場合は
 *   採番処理を一切走らせない）。これにより既存の ID・作成日時の生成挙動を維持する。
 *
 * @param input - 生成する取引の各フィールド。省略時の既定値は {@link BuildTransactionInput} を参照。
 * @returns 組み立てた {@link Transaction}。
 */
export function buildTransaction(input: BuildTransactionInput): Transaction {
  return {
    id: input.id ?? generateUlid(),
    fundId: input.fundId,
    type: input.type,
    date: input.date,
    amount: input.amount,
    navValue: input.navValue,
    units: input.units,
    recurringPurchaseId: input.recurringPurchaseId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    createdAt: input.createdAt ?? clock.nowIso(),
  };
}
