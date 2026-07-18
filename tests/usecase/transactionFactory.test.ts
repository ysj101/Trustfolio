import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTransaction } from '../../src/usecase/transactionFactory';

/**
 * 取引生成ファクトリ（buildTransaction）の検証。
 *
 * buildTransaction は全取引種別（SPOT_PURCHASE / REDEMPTION / RECURRING_PURCHASE）の
 * 生成を担う共通ファクトリであり、仕様の中心は「省略時の採番」と「指定時の保持」である:
 * - id 省略時は ULID を新規採番、指定時はその値を保持（更新時の再生成用途）。
 * - createdAt 省略時は呼び出し時刻の ISO 文字列、指定時はその値を保持（作成日時の維持用途）。
 * - recurringPurchaseId / idempotencyKey 省略時は null（スポット購入・売却の既存挙動）。
 */

/** ULID の形式（Crockford Base32・26文字）。tests/utils/ulid.test.ts と同じ判定を用いる。 */
const ULID_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

afterEach(() => {
  // createdAt 検証で固定した時刻を必ず元へ戻す（他テストへの影響防止）
  vi.useRealTimers();
});

describe('buildTransaction', () => {
  it('id と createdAt を省略した場合は ULID と現在時刻を採番する（新規登録用途）', () => {
    // 前提: スポット購入の新規登録として、id・createdAt を渡さない
    // 事前条件: 現在時刻を 2024-03-05T12:00:00Z に固定する
    // 検証: id は ULID 形式で採番され、createdAt は固定した現在時刻の ISO 文字列になる
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-05T12:00:00.000Z'));

    const transaction = buildTransaction({
      type: 'SPOT_PURCHASE',
      fundId: 'fund-001',
      date: '2024-03-05',
      amount: 100000,
      navValue: 15000,
      units: 66667,
    });

    expect(transaction.id).toMatch(ULID_PATTERN);
    expect(transaction.createdAt).toBe('2024-03-05T12:00:00.000Z');
    // 入力フィールドはそのまま保持される
    expect(transaction.type).toBe('SPOT_PURCHASE');
    expect(transaction.fundId).toBe('fund-001');
    expect(transaction.date).toBe('2024-03-05');
    expect(transaction.amount).toBe(100000);
    expect(transaction.navValue).toBe(15000);
    expect(transaction.units).toBe(66667);
  });

  it('recurringPurchaseId と idempotencyKey を省略した場合は null になる（スポット取引の既存挙動）', () => {
    // 前提: スポット売却として、積立関連フィールドを渡さない
    // 事前条件: なし
    // 検証: recurringPurchaseId / idempotencyKey がともに null で設定される
    const transaction = buildTransaction({
      type: 'REDEMPTION',
      fundId: 'fund-001',
      date: '2024-03-06',
      amount: 50000,
      navValue: 15100,
      units: 33113,
    });

    expect(transaction.recurringPurchaseId).toBeNull();
    expect(transaction.idempotencyKey).toBeNull();
  });

  it('id と createdAt を指定した場合はその値を保持する（更新時の再生成用途）', () => {
    // 前提: 既存取引の更新として、元の id と作成日時を引き継ぐ
    // 事前条件: id は既存の値、createdAt は過去の作成日時を指定する
    // 検証: 採番されず、指定した id・createdAt がそのまま保持される
    const transaction = buildTransaction({
      type: 'SPOT_PURCHASE',
      fundId: 'fund-001',
      date: '2024-03-05',
      amount: 120000,
      navValue: 15000,
      units: 80000,
      id: '01HV8ZQJ0X3YT5N2K4M6P8R9SA',
      createdAt: '2024-01-15T09:30:00.000Z',
    });

    expect(transaction.id).toBe('01HV8ZQJ0X3YT5N2K4M6P8R9SA');
    expect(transaction.createdAt).toBe('2024-01-15T09:30:00.000Z');
  });

  it('recurringPurchaseId と idempotencyKey を指定した場合はその値を保持する（積立購入用途）', () => {
    // 前提: 積立購入の取引として、積立設定IDと冪等キーを指定する
    // 事前条件: なし
    // 検証: 指定した値が null に落ちずそのまま保持される
    const transaction = buildTransaction({
      type: 'RECURRING_PURCHASE',
      fundId: 'fund-001',
      date: '2024-03-05',
      amount: 30000,
      navValue: 15000,
      units: 20000,
      recurringPurchaseId: 'recurring-001',
      idempotencyKey: 'recurring-001_2024-03-01',
    });

    expect(transaction.recurringPurchaseId).toBe('recurring-001');
    expect(transaction.idempotencyKey).toBe('recurring-001_2024-03-01');
  });

  it('連続で生成した取引の id は互いに異なる（採番の一意性）', () => {
    // 前提: 同時刻に複数の新規取引を生成する
    // 事前条件: id を省略して2件生成する
    // 検証: 採番された id が重複しない
    const input = {
      type: 'SPOT_PURCHASE' as const,
      fundId: 'fund-001',
      date: '2024-03-05',
      amount: 100000,
      navValue: 15000,
      units: 66667,
    };

    const first = buildTransaction(input);
    const second = buildTransaction(input);

    expect(first.id).not.toBe(second.id);
  });
});
