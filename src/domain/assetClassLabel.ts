import type { AssetClass } from './types';

/** サーバー側（メール・ドメイン）の資産クラス表示名。UI側の定義との一致をテストで保証する。 */
export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: '株式',
  gold: '金',
};

/** UI側の未設定表示と一致させる資産クラス未設定ラベル。 */
export const UNSET_ASSET_CLASS_LABEL = '未設定';

/**
 * 資産クラスを画面・メールで使用する日本語ラベルへ変換する。
 * nullは資産クラス未設定を表し、型で網羅された資産クラスは共通定義から取得する。
 */
export function getAssetClassLabel(assetClass: AssetClass | null): string {
  return assetClass === null ? UNSET_ASSET_CLASS_LABEL : ASSET_CLASS_LABELS[assetClass];
}
