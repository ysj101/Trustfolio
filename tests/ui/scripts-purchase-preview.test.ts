import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { calculateUnits } from '../../src/domain/PurchaseCalculator';

/**
 * このテストは src/ui/scripts.html の購入口数プレビューが、サーバー側の正式計算である
 * src/domain/PurchaseCalculator.ts の calculateUnits と同じ結果を返すことを検証する。
 *
 * 前提:
 * - scripts.html は素のJavaScriptであり、購入画面に表示する口数をブラウザ上で計算する。
 * - calculateUnits は登録時に使用する正式な購入口数を計算する。
 * - 両者の丸め方式または1万口単位の定数が異なると、プレビューと登録結果が一致しなくなる。
 *
 * 検証項目:
 * - scripts.html の購入計算式を正規表現で抽出できること。
 * - 抽出した購入計算式と calculateUnits が、丸め境界の異なる複数条件で完全一致すること。
 * - scripts.html の UNITS_BASE が、サーバー側と同じ 10000 であること。
 */

/** src/ui/scripts.html のソース全文を読み込む。 */
function readScriptsSource(): string {
  const filePath = path.join(process.cwd(), 'src', 'ui', 'scripts.html');
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * scripts.html から購入プレビューの口数計算式を抽出する。
 *
 * 注意:
 * - amount / navValue と UNITS_BASE を同じ行で使用する const units の右辺だけを対象にする。
 * - 式の構造が変わった場合は暗黙に別の計算へ切り替えず、直ちにエラーとして検知する。
 */
function extractPurchaseUnitsExpression(source: string): string {
  const match = source.match(
    /const units = ([^;\r\n]*\(amount\s*\/\s*navValue\)[^;\r\n]*UNITS_BASE[^;\r\n]*);/
  );
  if (!match?.[1]) {
    throw new Error('scripts.html から購入プレビューの口数計算式を抽出できませんでした。');
  }
  return match[1];
}

/**
 * scripts.html からクライアント側の1万口単位定数を抽出する。
 * 定義を抽出できない場合は、計算時に別の値を補完せず直ちにエラーとする。
 */
function extractUnitsBase(source: string): number {
  const match = source.match(/const UNITS_BASE\s*=\s*(\d+)\s*;/);
  if (!match?.[1]) {
    throw new Error('scripts.html から UNITS_BASE の定義値を抽出できませんでした。');
  }
  return Number(match[1]);
}

describe('scripts.html の購入口数プレビュー', () => {
  it('クライアント側の UNITS_BASE が10000である', () => {
    const source = readScriptsSource();

    // 検証項目: 投資信託の基準価額が示す「1万口あたり」と同じ単位を使用すること。
    expect(extractUnitsBase(source)).toBe(10000);
  });

  it('抽出した購入計算式がサーバー側 calculateUnits と完全一致する', () => {
    const source = readScriptsSource();
    const expression = extractPurchaseUnitsExpression(source);
    const unitsBase = extractUnitsBase(source);
    const calculatePreviewUnits = new Function(
      'amount',
      'navValue',
      'UNITS_BASE',
      `return ${expression};`
    ) as (amount: number, navValue: number, unitsBase: number) => number;

    const cases = [
      {
        description: '小数部が0.5未満で、四捨五入と切り上げの結果が異なる場合',
        amount: 15_000,
        navValue: 15_001,
        expectedUnits: 10_000,
      },
      {
        description: '小数部が0.5以上で、四捨五入と切り上げの結果が同じ場合',
        amount: 10_000,
        navValue: 15_000,
        expectedUnits: 6_667,
      },
      {
        description: '計算結果が整数で割り切れる場合',
        amount: 15_000,
        navValue: 15_000,
        expectedUnits: 10_000,
      },
    ];

    for (const testCase of cases) {
      // 前提条件:
      // - 15000 / 15001 * 10000 = 9999.333377774816（小数部0.333...）であり、
      //   Math.round は9999、Math.ceilは10000となるため、切り上げ回帰を検出できる。
      // - 10000 / 15000 * 10000 = 6666.666666666666（小数部0.666...）であり、
      //   Math.roundとMath.ceilはいずれも6667となる。
      // - 15000 / 15000 * 10000 = 10000であり、小数部がなく割り切れる。
      const serverResult = calculateUnits(testCase.amount, testCase.navValue);
      if (!serverResult.success) {
        throw new Error(
          `${testCase.description}で calculateUnits が失敗しました: ${serverResult.error.message}`
        );
      }

      const previewUnits = calculatePreviewUnits(testCase.amount, testCase.navValue, unitsBase);

      // 検証項目: UIの表示値と登録時の正式値が、各丸め条件で数値まで完全一致すること。
      expect(previewUnits, testCase.description).toBe(testCase.expectedUnits);
      expect(previewUnits, testCase.description).toBe(serverResult.value);
    }
  });
});
