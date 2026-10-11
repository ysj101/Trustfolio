import { describe, expect, it } from 'vite-plus/test';
import { assertEntityFound } from '../../src/usecase/entityGuard';
import { ok, fail } from '../fakes';

/**
 * 汎用存在確認ガード（assertEntityFound）の検証。
 *
 * assertEntityFound は Transaction / RecurringPurchase の update・delete 系5箇所から
 * 共通利用されるガードであり、「取得成功・不在・取得失敗」の3分岐が仕様の全てである。
 */

/** テスト用のエンティティ。実データに近い日本語の値を用いる。 */
const 積立設定 = { id: 'recurring-001', fundId: 'fund-001', monthlyAmount: 30000 };

describe('assertEntityFound', () => {
  it('エンティティが存在する場合はその実体を成功で返す', () => {
    // 前提: findById 系の検索がエンティティを返している
    // 事前条件: 検索結果は成功かつ非 null
    // 検証: 成功 Result として実体がそのまま返る
    const result = assertEntityFound(ok(積立設定), '対象の積立設定が存在しません。');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual(積立設定);
    }
  });

  it('エンティティが存在しない場合は指定メッセージの not_found エラー（field=id）を返す', () => {
    // 前提: findById 系の検索が null（不在）を返している
    // 事前条件: 検索自体は成功している
    // 検証: type=not_found・指定メッセージ・field=id のエラーが返る
    //   （集約元5箇所が個別に組み立てていたエラーと完全同一であることが本ガードの契約）
    const result = assertEntityFound(
      ok<typeof 積立設定 | null>(null),
      '対象の積立設定が存在しません。'
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toEqual({
        type: 'not_found',
        message: '対象の積立設定が存在しません。',
        field: 'id',
      });
    }
  });

  it('falsy な値（0 など）は不在と誤判定せず、そのまま成功で返す', () => {
    // 前提: エンティティ型 T が falsy になり得る値（例: 数値 0）である
    // 事前条件: 検索は成功し、値として 0 が返っている（null ではない）
    // 検証: 型契約上の不在は null のみであり、falsy 値は存在する値として成功で返る
    //   （`!value` 判定だと 0 を不在と誤判定するため、null 明示比較を契約とする）
    const result = assertEntityFound(ok<number | null>(0), '対象が存在しません。');

    expect(result).toEqual({ success: true, value: 0 });
  });

  it('検索自体が失敗した場合は元の失敗をそのまま伝播する', () => {
    // 前提: シート読み取り等の理由でリポジトリ検索が失敗している
    // 事前条件: 検索結果が失敗 Result である
    // 検証: エラーが not_found へ変換されず、元のエラー情報（type/message）が保持される
    const result = assertEntityFound(
      fail<typeof 積立設定 | null>('unexpected', '積立設定シートの読み取りに失敗しました。'),
      '対象の積立設定が存在しません。'
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toBe('積立設定シートの読み取りに失敗しました。');
    }
  });
});
