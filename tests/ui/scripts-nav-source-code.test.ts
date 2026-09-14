import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

/**
 * このテストは src/ui/scripts.html が、投資信託登録フォームの「取得元コード」入力欄
 * （id="fundNavSourceCode"）に change イベントリスナーを登録し、Wealth Advisor の
 * ファンド基本情報ページ URL を取得元コードへ変換することを検証する。
 *
 * 前提:
 * - scripts.html は素のJavaScriptであり、GAS が include() で画面へ埋め込む。
 *   ビルド・型検査の対象外のため、<script> の中身を取り出して評価する
 *   （同じ方式を tests/ui/scripts-purchase-preview.test.ts が採用している）。
 * - URL から取得元コードへの変換ロジックそのもの（extractWealthAdvisorNavSourceCode）は
 *   tests/ui/common-scripts.test.ts が検証する。本テストが検証するのは「配線」、すなわち
 *   リスナーが正しいイベント種別で登録され、変換結果を入力欄へ反映することである。
 * - リスナーの登録漏れやイベント種別の変更（change → input 等）は、変換関数の単体テストでは
 *   検出できないため、本テストが必要である。
 *
 * 検証項目:
 * - 取得元コード入力欄に change イベントのリスナーが登録されていること。
 * - リスナーが入力欄の現在値を変換関数へ渡すこと。
 * - 変換できた場合（戻り値が null 以外）だけ入力欄の値を置き換えること。
 * - 変換できない場合（戻り値が null）は入力欄の値を一切変更しないこと。
 */

/** src/ui/scripts.html のソース全文を読み込む。 */
function readScriptsSource(): string {
  const filePath = path.join(process.cwd(), 'src', 'ui', 'scripts.html');
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * scripts.html から取得元コード入力欄の change リスナー本体を抽出する。
 *
 * 注意:
 * - 抽出できない場合は別の処理へ暗黙に切り替えず、直ちにエラーとして検知する
 *   （リスナーの削除・イベント種別の変更・変数名の変更をテスト失敗として表面化させるため）。
 */
function extractNavSourceCodeChangeHandlerBody(source: string): string {
  const match = source.match(
    /fundNavSourceCodeInput\.addEventListener\('change', \(\) => \{([\s\S]*?)\n {8}\}\);/
  );
  if (!match?.[1]) {
    throw new Error(
      'scripts.html から取得元コード入力欄の change リスナー本体を抽出できませんでした。'
    );
  }
  return match[1];
}

/**
 * 抽出したリスナー本体を、入力欄と変換関数のスタブを与えて実行する。
 *
 * @param inputValue - 実行前に入力欄へ入っている値
 * @param converted - 変換関数が返す値（変換できない場合を表すなら null）
 * @returns 実行後の入力欄の値と、変換関数へ渡された引数
 */
function runChangeHandler(
  inputValue: string,
  converted: string | null
): { valueAfter: string; receivedArgument: string | null } {
  const handlerBody = extractNavSourceCodeChangeHandlerBody(readScriptsSource());
  const fundNavSourceCodeInput = { value: inputValue };
  let receivedArgument: string | null = null;
  const windowStub = {
    TrustfolioUi: {
      extractWealthAdvisorNavSourceCode: (input: string): string | null => {
        receivedArgument = input;
        return converted;
      },
    },
  };

  const handler = new Function('window', 'fundNavSourceCodeInput', handlerBody);
  handler(windowStub, fundNavSourceCodeInput);

  return { valueAfter: fundNavSourceCodeInput.value, receivedArgument };
}

describe('scripts.html の取得元コード入力欄の change リスナー', () => {
  it('取得元コード入力欄に change イベントのリスナーを登録している', () => {
    // 前提: 変換は submit 時ではなく change 時に行う（pattern による制約検証より先に発火させるため）。
    // 検証: change 以外のイベント種別へ変更された場合に、この抽出が失敗して検知できること。
    const source = readScriptsSource();

    expect(source).toContain("fundNavSourceCodeInput.addEventListener('change'");
    expect(() => extractNavSourceCodeChangeHandlerBody(source)).not.toThrow();
  });

  it('入力されたファンド基本情報ページURLを取得元コードへ置き換える', () => {
    // 前提: 利用者が「ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）」のページURLを貼り付ける。
    // 事前条件: 変換関数は取得元コード sbi_am/sa_202306080A を返す。
    // 検証: 入力欄の現在値が変換関数へ渡され、戻り値で置き換えられること。
    const pageUrl = 'https://apl.wealthadvisor.jp/webasp/sbi_am/pc/basic/sa_202306080A.html';

    const result = runChangeHandler(pageUrl, 'sbi_am/sa_202306080A');

    expect(result.receivedArgument).toBe(pageUrl);
    expect(result.valueAfter).toBe('sbi_am/sa_202306080A');
  });

  it('変換対象外の入力では入力欄の値を変更しない', () => {
    // 前提: 利用者が既に取得元コード形式の値を直接入力している。
    // 事前条件: 変換関数は変換対象外を表す null を返す。
    // 検証: 推測による補完を行わず、入力値をそのまま保持すること。
    const result = runChangeHandler('sbi_am/sa_202306080A', null);

    expect(result.valueAfter).toBe('sbi_am/sa_202306080A');
  });
});
