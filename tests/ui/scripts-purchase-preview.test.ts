import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vite-plus/test';
import { calculateUnits } from '../../src/domain/PurchaseCalculator';

/**
 * このテストは src/ui/scripts.html の購入口数プレビューが、サーバー側の正式計算である
 * src/domain/PurchaseCalculator.ts の calculateUnits と同じ結果を返すことを検証する。
 *
 * 前提:
 * - scripts.html は素のJavaScriptであり、購入画面に表示する口数をブラウザ上で計算する。
 * - calculateUnits は登録時に使用する正式な購入口数を計算する。
 * - 両者の算出方式（代金の円未満を四捨五入したときに購入金額を超えない最大の口数。issue #260）
 *   または1万口単位の定数が異なると、プレビューと登録結果が一致しなくなる。
 *
 * 検証項目:
 * - scripts.html の購入口数プレビュー関数（buildPurchaseUnitsPreview）を抽出できること。
 * - 新規登録時のプレビュー口数と calculateUnits が、端数の大きさが異なる複数条件で完全一致すること。
 * - scripts.html の UNITS_BASE が、サーバー側と同じ 10000 であること。
 * - スポット購入の編集時のプレビューが、保存時の規則（金額・基準価額が変わらなければ記録済みの口数を保持）と一致すること。
 */

/** src/ui/scripts.html のソース全文を読み込む。 */
function readScriptsSource(): string {
  const filePath = path.join(process.cwd(), 'src', 'ui', 'scripts.html');
  return fs.readFileSync(filePath, 'utf8');
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

/**
 * scripts.html の buildPurchaseUnitsPreview（購入口数のプレビュー文字列、issue #260）を抽出する。
 * 抽出できない場合は、関数の構造が変わったものとして直ちにエラーにする。
 */
function extractBuildPurchaseUnitsPreview(
  source: string
): (
  amount: number,
  navValue: number,
  editingRecord: { amount: number; navValue: number; units: number } | null
) => string | null {
  const functionSource = source.match(
    /function buildPurchaseUnitsPreview\(amount, navValue, editingRecord\) \{[\s\S]*?\n {4}\}/
  )?.[0];
  if (!functionSource) {
    throw new Error('scripts.html から buildPurchaseUnitsPreview を抽出できませんでした。');
  }
  return new Function('UNITS_BASE', `${functionSource}\nreturn buildPurchaseUnitsPreview;`)(
    extractUnitsBase(source)
  ) as ReturnType<typeof extractBuildPurchaseUnitsPreview>;
}

/**
 * scripts.html から抽出した buildPurchaseUnitsPreview。不変の実ソースから、ファイル全体で一度だけ抽出する。
 */
const preview = extractBuildPurchaseUnitsPreview(readScriptsSource());

describe('scripts.html の購入口数プレビュー', () => {
  it('クライアント側の UNITS_BASE が10000である', () => {
    const source = readScriptsSource();

    // 検証項目: 投資信託の基準価額が示す「1万口あたり」と同じ単位を使用すること。
    expect(extractUnitsBase(source)).toBe(10000);
  });

  it('新規登録時のプレビュー口数がサーバー側 calculateUnits と完全一致する', () => {
    /** 新規登録時（編集中の記録値なし）のプレビュー文字列「N口」から口数を取り出す。 */
    const calculatePreviewUnits = (amount: number, navValue: number): number => {
      const text = preview(amount, navValue, null);
      const match = text?.match(/^([\d,]+)口$/);
      if (!match?.[1]) {
        throw new Error(`プレビューの表示「${String(text)}」から口数を読み取れません。`);
      }
      return Number(match[1].replace(/,/g, ''));
    };

    const cases = [
      {
        description: 'SBI証券の実際の約定口数と一致する実データ（端数を切り捨てる側）の場合',
        amount: 5_000,
        navValue: 23_562,
        expectedUnits: 2_122,
      },
      {
        description: '理論口数の小数部が大きく、切り上げ側の口数になる場合',
        amount: 5_000,
        navValue: 23_508,
        expectedUnits: 2_127,
      },
      {
        description: '数学的に割り切れるが、除算を先に行うと整数からずれる場合',
        amount: 43_000,
        navValue: 15_625,
        expectedUnits: 27_520,
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
      // - 5,000円・23,562円 の理論口数は 2,122.06口であり、2,123口の代金は 5,002円で購入金額を超える。
      //   このため 2,122口となり、以前の切り上げ（2,123口）への回帰を検出できる。
      // - 5,000円・23,508円 の理論口数は 2,126.94口であり、2,127口の代金は 5,000.15円 → 5,000円で
      //   購入金額を超えない。このため 2,127口となり、単純な切り捨て（2,126口）との違いを検出できる。
      // - 43,000 ÷ 15,625 × 10,000 は浮動小数点で 27519.999999999996 となるが、数学的には 27,520口である。
      // - 15,000円・15,000円 は 10,000口ちょうどで割り切れる。
      const serverResult = calculateUnits(testCase.amount, testCase.navValue);
      if (!serverResult.success) {
        throw new Error(
          `${testCase.description}で calculateUnits が失敗しました: ${serverResult.error.message}`
        );
      }

      const previewUnits = calculatePreviewUnits(testCase.amount, testCase.navValue);

      // 検証項目: UIの表示値と登録時の正式値が、各丸め条件で数値まで完全一致すること。
      expect(previewUnits, testCase.description).toBe(testCase.expectedUnits);
      expect(previewUnits, testCase.description).toBe(serverResult.value);
    }
  });
});

describe('scripts.html の購入口数プレビュー（スポット購入の編集）', () => {
  /** 5,000円・基準価額 23,562円 で登録し、口数を約定口数 2,121口 へ訂正したスポット購入の記録値。 */
  const 訂正済みの記録 = { amount: 5000, navValue: 23562, units: 2121 };

  it('新規登録では、calculateUnits と同じ推定値だけを表示する', () => {
    // 前提: 編集中のスポット購入がない（editingRecord が null）
    // 検証: 5,000円・23,562円 の推定値 2,122口 を表示する
    expect(preview(5000, 23562, null)).toBe('2,122口');
  });

  it('編集で購入金額と基準価額が記録値と同じなら、記録済みの口数（訂正値）を表示する', () => {
    // 前提: サーバー側の updateSpotPurchase は、金額と基準価額が変わらなければ記録済みの口数を保持する
    // 事前条件: 日付だけを直す編集（金額 5,000円・基準価額 23,562円 は記録値と同じ）
    // 検証: 推定値の 2,122口 ではなく、保存される 2,121口 を表示する
    expect(preview(5000, 23562, 訂正済みの記録)).toBe('2,121口（記録済みの口数を保持）');
  });

  it('編集で基準価額が記録値から変わると、計算し直した口数と、記録済みの口数から変わることを表示する', () => {
    // 前提: 日付の変更で基準価額が取り直され、23,562円 から 23,560円 に変わった
    // 検証: 計算し直した 2,122口 と、訂正済みの 2,121口 から変わることを併記する
    expect(preview(5000, 23560, 訂正済みの記録)).toBe('2,122口（記録済みの2,121口から変わります）');
  });

  it('編集で購入金額だけが記録値から変わると、calculateUnits と同じ口数と、記録済みの口数から変わることを表示する', () => {
    // 前提: 基準価額は記録値（23,562円）のまま、購入金額だけを 5,000円 から 10,000円 へ変える
    // 検証: calculateUnits の結果（4,244口）と、訂正済みの 2,121口 から変わることを併記する
    const serverResult = calculateUnits(10000, 23562);
    expect(serverResult).toEqual({ success: true, value: 4244 });
    expect(preview(10000, 23562, 訂正済みの記録)).toBe(
      '4,244口（記録済みの2,121口から変わります）'
    );
  });

  it('口数が0になる購入金額では、登録を拒否する calculateUnits と同じく口数を表示しない', () => {
    // 前提: 基準価額 23,562円 に対して購入金額 1円 では、代金が購入金額を超えない口数は 0口である
    // 検証: calculateUnits は検証エラーを返し、プレビューは null（「-」表示）になる
    expect(calculateUnits(1, 23562).success).toBe(false);
    expect(preview(1, 23562, null)).toBeNull();
  });

  it('記録値と同じ金額・基準価額なら、計算途中の値が安全な整数の範囲を超える金額でも記録済みの口数を表示する', () => {
    // 前提: サーバー側の updateSpotPurchase は、金額と基準価額が記録値と同じなら calculateUnits を呼ばない
    // 事前条件: 購入金額 900,719,925,474円（× 10,000 + 4,999 が安全な整数の範囲を超える）の記録を、
    //   金額・基準価額を変えずに編集する
    // 検証: 計算できないとはせず、記録済みの口数を表示する（保存時の挙動と一致する）
    const 大きい記録 = { amount: 900_719_925_474, navValue: 10_000, units: 900_719_925_474 };
    expect(preview(900_719_925_474, 10_000, 大きい記録)).toBe(
      `${(900_719_925_474).toLocaleString()}口（記録済みの口数を保持）`
    );
    expect(preview(900_719_925_474, 10_000, null)).toBeNull();
  });

  it('記録値が整数でない場合は、記録値と同じ金額でも口数を表示しない', () => {
    // 前提: サーバー側の入力検証は、記録値と同じ値でも1円以上の整数であることを求める
    // 事前条件: 以前の版で保存された、1円未満の端数を含む購入金額（5,000.5円）の記録を編集する
    // 検証: 「記録済みの口数を保持」とは表示せず、null（「-」表示）になる
    expect(preview(5000.5, 23562, { amount: 5000.5, navValue: 23562, units: 2122 })).toBeNull();
  });

  it('基準価額が整数でない場合は、登録を拒否する calculateUnits と同じく口数を表示しない', () => {
    // 前提: calculateUnits は基準価額が整数でない場合に登録を拒否する
    // 検証: プレビューは null（「-」表示）になる
    expect(preview(5000, 23562.5, null)).toBeNull();
  });
});
