import { ASSET_CLASSES, type AssetClass, type Result } from './types';
import { fail } from './result';
import { parseUtcIsoDate } from '../utils/dateTime';

/**
 * 値が定義済みの資産クラスであることを判定する。
 * 許可集合は {@link ASSET_CLASSES} のみを参照し、入力境界と永続化境界の判定を一致させる。
 *
 * @param value - 判定対象の値。
 * @returns `equity`または`gold`であればtrue。その場合、値は{@link AssetClass}へ絞り込まれる。
 */
export function isAssetClass(value: unknown): value is AssetClass {
  return ASSET_CLASSES.some((assetClass) => assetClass === value);
}

/**
 * 値が資産クラスの許可集合に含まれることを検証する。
 * API境界から渡る実行時値を{@link isAssetClass}で判定し、不正値を暗黙変換せず拒否する。
 *
 * @param value - 検証対象の値。
 * @returns 検証に成功すれば{@link AssetClass}を持つ{@link Result}。
 */
export function validateAssetClass(value: unknown): Result<AssetClass> {
  if (!isAssetClass(value)) {
    return fail('validation', '資産クラスを選択してください。', 'assetClass');
  }
  return { success: true, value };
}

/**
 * 文字列が `YYYY-MM-DD` 形式の妥当な日付かを判定する。
 *
 * 目的:
 * - `RecurringUseCase` と `TransactionUseCase` に重複していた同一実装を一本化する。
 *
 * 内容:
 * - 形式（4桁-2桁-2桁）を正規表現で検査したうえで、`Date` 解釈が成立するかを確認する。
 *   既知の制限: `2026-02-30` のような暦上存在しない日付は V8 が翌月へ繰り上げて
 *   パースするため `true` を返す（テストで「既知の制限」として明文化済み）。
 *
 * 注意:
 * - 既存挙動を変えないため、UTC 基準（{@link parseUtcIsoDate}）で `Date` を生成して
 *   判定する（TZ 方針は src/utils/dateTime.ts の「方針 3」を参照）。
 *
 * @param value - 判定対象の文字列。
 * @returns 妥当な `YYYY-MM-DD` であれば true。
 */
export function isValidIsoDate(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = parseUtcIsoDate(value);
  return !Number.isNaN(date.getTime());
}

/**
 * 値が「空でない文字列」であることを検証する共通バリデータ。
 *
 * 目的:
 * - 各 UseCase で繰り返されている
 *   `typeof value !== 'string' || value.trim() === ''` の検証を一本化する。
 *
 * 内容:
 * - 失敗時は `validation` 種別のエラーに、指定された `message` と `field` を付与して返す。
 * - 成功時は入力された値をそのまま（トリムせず）返す。
 *   これは既存の各 UseCase が元の値を保存している挙動を保つためである。
 *
 * @param value - 検証対象の値。
 * @param message - 失敗時に利用者へ提示するメッセージ。
 * @param field - 失敗時に対象フィールドを示すキー。
 * @returns 検証に成功すれば元の文字列を持つ {@link Result}。
 */
export function validateNonEmptyString(
  value: unknown,
  message: string,
  field: string
): Result<string> {
  if (typeof value !== 'string' || value.trim() === '') {
    return fail('validation', message, field);
  }
  return { success: true, value };
}

/**
 * 値が「0より大きい数値」であることを検証する共通バリデータ。
 *
 * 目的:
 * - 各 UseCase で繰り返されている
 *   `typeof value !== 'number' || Number.isNaN(value) || value <= 0` の検証を一本化する。
 *
 * 内容:
 * - 失敗時は `validation` 種別のエラーに、指定された `message` と `field` を付与して返す。
 * - 判定式は既存挙動を厳密に踏襲する。`Number.isNaN` のみで NaN を除外するため、
 *   `Infinity` は（0より大きいため）既存同様に許容される点に注意する。
 *
 * @param value - 検証対象の値。
 * @param message - 失敗時に利用者へ提示するメッセージ。
 * @param field - 失敗時に対象フィールドを示すキー。
 * @returns 検証に成功すれば数値を持つ {@link Result}。
 */
export function validatePositiveNumber(
  value: unknown,
  message: string,
  field: string
): Result<number> {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return fail('validation', message, field);
  }
  return { success: true, value };
}

/**
 * 値が「0以上の有限数」であることを検証する共通バリデータ。
 *
 * 目的:
 * - 売却時の所得税・住民税について、0円を許容しつつ、負値・NaN・±Infinityを
 *   入力境界で即座に拒否する。
 *
 * 内容:
 * - number型でない値・非有限数（NaN・±Infinity）・負値は validation エラーを返す。
 * - 0以上の有限数はそのまま成功として返す（0円を正当な値として扱う）。
 *
 * 注意:
 * - 0を拒否する {@link validatePositiveNumber} とは要件が異なるため、税額検証では
 *   本関数を使用する。
 *
 * @param value - 検証対象の値。
 * @param message - 失敗時に利用者へ提示するメッセージ。
 * @param field - 失敗時に対象フィールドを示すキー。
 * @returns 検証に成功すれば0以上の有限数を持つ {@link Result}。
 */
export function validateNonNegativeNumber(
  value: unknown,
  message: string,
  field: string
): Result<number> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fail('validation', message, field);
  }
  return { success: true, value };
}

/**
 * 値が「積立設定の注文日（1〜28 の整数）」として妥当であることを検証する共通バリデータ。
 *
 * 目的:
 * - `RecurringUseCase.validateRecurringInput()` に直書きされていた
 *   executionDay の制約（1〜28 の整数）をドメイン層へ集約する。
 *
 * 検証内容:
 * - 「数値であり（typeof number）」かつ「NaN でない」かつ「整数（{@link Number.isInteger}）」
 *   かつ「1 以上 28 以下」であることを要求する。
 * - **整数であることを必須とする**。注文日は「毎月N日」を表す値であり、`15.5` のような
 *   非整数は意味を成さない。さらに非整数が約定日計算
 *   （`RecurringUseCase` の `formatIsoDate(year, month, day)`）へ到達すると
 *   `2025-01-15.5` のような不正な日付文字列を生成し、営業日カレンダーに一致せず
 *   静かに想定外の結果を招く。これを入力境界で fail fast に弾く（#133）。
 * - 上限・下限を 1〜28 に固定するのは、月末日（29〜31）が存在しない月でも注文日が
 *   破綻しないようにするという積立設定固有の制約に由来する。
 *
 * 注意（挙動変更の経緯）:
 * - 以前は `Number.isInteger` 判定が無く `1.5` 等の非整数も通していたが、
 *   仕様文言「1〜28 の整数」・UI 入力（`<input type="number" step="1" min="1" max="28">`）と
 *   コードの乖離を解消するため、#133 で整数必須へ統一した。
 *
 * @param value - 検証対象の値（積立設定の注文日）。
 * @param message - 失敗時に利用者へ提示するメッセージ。
 * @param field - 失敗時に対象フィールドを示すキー。
 * @returns 検証に成功すれば整数（1〜28）を持つ {@link Result}。
 */
export function validateRecurringDay(
  value: unknown,
  message: string,
  field: string
): Result<number> {
  if (!isValidRecurringDay(value)) {
    return fail('validation', message, field);
  }
  return { success: true, value };
}

/**
 * 値が「積立設定の注文日（1〜28 の整数）」として妥当かを判定する型ガード述語。
 *
 * 目的:
 * - 「整数であること」と「1〜28 の範囲であること」という注文日のルールを1箇所に集約し、
 *   入力境界（{@link validateRecurringDay} 経由の作成・更新）と
 *   読込境界（`RecurringPurchaseRepository.parseRow` での保存値検証）の双方から共有する。
 *   これにより、片側だけ範囲チェックを欠くといった検証の非対称（#133 のレビュー指摘）を防ぐ。
 *
 * 判定内容:
 * - 「数値であり（typeof number）」かつ「整数（{@link Number.isInteger}。NaN・±Infinity は false）」
 *   かつ「1 以上 28 以下」のとき true を返す。
 *
 * @param value - 判定対象の値。
 * @returns 注文日として妥当なら true（その場合 `value` は number に絞り込まれる）。
 */
export function isValidRecurringDay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 28;
}
