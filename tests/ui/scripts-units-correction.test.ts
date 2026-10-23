import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it, vi } from 'vite-plus/test';

/**
 * src/ui/scripts.html の「口数を訂正」（runUnitsCorrectionFlow、issue #260）のテスト。
 *
 * 前提:
 * - 取引一覧の購入取引（スポット購入・積立購入）の「口数を訂正」ボタンは runUnitsCorrectionFlow を呼ぶ。
 * - runUnitsCorrectionFlow は入力ダイアログ（prompt）で訂正後の口数を受け取り、
 *   共通の更新フロー（runMutationFlow）で correctPurchaseUnits API を呼ぶ。
 *
 * 検証項目:
 * - キャンセルした場合は API を呼ばない。
 * - 桁区切りのカンマ付きの入力（画面表示と同じ書式）を整数として送信する。
 * - 1 以上の整数でない入力と、数字・3 桁区切りのカンマ以外の書式の入力は、API を呼ばずにエラーを表示する。
 * - 口数が現在の値と同じ入力は、API を呼ばずに終える。
 * - 成功後の後処理で、編集中の取引なら編集を解除し、取引データを再読込する。
 * - 取引一覧の「すべて表示」切り替えボタン（updateTransactionListToggle）が、件数と表示状態に応じて
 *   表示・文言を切り替える（直近 5 件より古い購入取引も「口数を訂正」できるようにするため）。
 */

// 不変の実ソースはファイル全体で一度だけ読み込み、関数の定義を抽出する。
// 抽出に失敗した場合は、関数の構造が変わったものとして直ちに失敗させる（別の実装へ切り替えない）。
const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/scripts.html'), 'utf8');
const flowSource = source.match(
  /async function runUnitsCorrectionFlow\(transaction\) \{[\s\S]*?\n {4}\}/
)?.[0];
if (!flowSource) {
  throw new Error('scripts.html から runUnitsCorrectionFlow を抽出できませんでした。');
}
const toggleSource = source.match(
  /function updateTransactionListToggle\(totalCount\) \{[\s\S]*?\n {4}\}/
)?.[0];
const recentCountSource = source.match(/const TRANSACTION_LIST_RECENT_COUNT = \d+;/)?.[0];
if (!toggleSource || !recentCountSource) {
  throw new Error(
    'scripts.html から updateTransactionListToggle と TRANSACTION_LIST_RECENT_COUNT を抽出できませんでした。'
  );
}

/** 訂正対象として使う、2026-10-02 のゴールドファンドの積立購入（切り上げで 2,123口と記録）。 */
const 積立購入 = {
  id: '積立購入-2026-10-02',
  fundId: 'ゴールドファンド',
  date: '2026-10-02',
  units: 2123,
};

/**
 * 抽出した runUnitsCorrectionFlow に、テストごとの独立したスタブを注入して返す。
 *
 * @param promptAnswer 入力ダイアログが返す値（キャンセルは null）
 * @param editingTransactionId 編集中の取引ID（編集していない場合は null）
 */
function createFlow(promptAnswer: string | null, editingTransactionId: string | null) {
  const stubs = {
    prompt: vi.fn(() => promptAnswer),
    setMessage: vi.fn(),
    runMutationFlow: vi.fn(async (_options: { onSuccess: () => Promise<void> }) => undefined),
    setTransactionEditMode: vi.fn(),
    reloadAfterTransactionMutation: vi.fn(async () => undefined),
    state: { editingTransactionId, selectedTransactionFundId: 'ゴールドファンド' },
  };
  const flow = new Function(
    'prompt',
    'setMessage',
    'runMutationFlow',
    'setTransactionEditMode',
    'reloadAfterTransactionMutation',
    'state',
    `${flowSource}\nreturn runUnitsCorrectionFlow;`
  )(
    stubs.prompt,
    stubs.setMessage,
    stubs.runMutationFlow,
    stubs.setTransactionEditMode,
    stubs.reloadAfterTransactionMutation,
    stubs.state
  ) as (transaction: typeof 積立購入) => Promise<void>;
  return { flow, stubs };
}

describe('scripts.html の口数の訂正', () => {
  it('入力ダイアログをキャンセルした場合は API を呼ばない', async () => {
    // 前提: 利用者が入力ダイアログで「キャンセル」を押す（prompt が null を返す）
    // 検証: 更新フローもエラー表示も呼ばれない
    const { flow, stubs } = createFlow(null, null);

    await flow(積立購入);

    expect(stubs.runMutationFlow).not.toHaveBeenCalled();
    expect(stubs.setMessage).not.toHaveBeenCalled();
  });

  it('カンマ付きの入力を整数の口数として correctPurchaseUnits へ送信する', async () => {
    // 前提: 画面の口数表示（toLocaleString）と同じ書式で「2,122」と入力する
    // 検証: 入力ダイアログに現在の口数が初期値として表示され、口数 2122 のリクエストが送信される
    const { flow, stubs } = createFlow('2,122', null);

    await flow(積立購入);

    expect(stubs.prompt).toHaveBeenCalledWith(expect.stringContaining('2,123口'), '2123');
    expect(stubs.runMutationFlow).toHaveBeenCalledTimes(1);
    expect(stubs.runMutationFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          action: 'correctPurchaseUnits',
          id: '積立購入-2026-10-02',
          fundId: 'ゴールドファンド',
          units: 2122,
        },
      })
    );
  });

  it('日本語入力の全角数字・全角カンマの入力も整数の口数として送信する', async () => {
    // 前提: 取引報告書の約定口数を、IME の全角のまま「２，１２２」と入力する
    // 検証: 半角へ正規化され、口数 2122 のリクエストが送信される
    const { flow, stubs } = createFlow('２，１２２', null);

    await flow(積立購入);

    expect(stubs.runMutationFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ action: 'correctPurchaseUnits', units: 2122 }),
      })
    );
  });

  it('1以上の整数でない入力と、数字・3桁区切りのカンマ以外の書式の入力は API を呼ばずにエラーを表示する', async () => {
    // 前提: 空文字・0・負の値・小数・数字以外の文字列に加え、Number() が数値として解釈してしまう
    //   16 進数（0x10）・指数表記（1e3）・位置のおかしいカンマ（2,1,22）を順に入力する
    // 検証: いずれもエラーメッセージを表示し、更新フローは呼ばれない
    for (const answer of ['', '0', '-5', '2122.5', '二千百二十二', '0x10', '1e3', '2,1,22']) {
      const { flow, stubs } = createFlow(answer, null);

      await flow(積立購入);

      expect(stubs.runMutationFlow, `入力「${answer}」`).not.toHaveBeenCalled();
      expect(stubs.setMessage, `入力「${answer}」`).toHaveBeenCalledWith(
        '口数は1以上の整数で入力してください。',
        'error'
      );
    }
  });

  it('口数が現在の値と同じなら API を呼ばずに、訂正しなかったことを表示する', async () => {
    // 前提: 入力ダイアログの初期値（現在の口数 2123）のまま「OK」を押す
    // 検証: 更新フロー（API 呼び出しと再読込）は呼ばれず、訂正しなかった旨を表示する
    const { flow, stubs } = createFlow('2123', null);

    await flow(積立購入);

    expect(stubs.runMutationFlow).not.toHaveBeenCalled();
    expect(stubs.setMessage).toHaveBeenCalledWith(
      '口数は変わっていないため、訂正しませんでした。',
      null
    );
  });

  it('成功後の後処理で、編集中の取引なら編集を解除して取引データを再読込する', async () => {
    // 前提: 訂正対象の取引を編集フォームで編集中である
    // 事前条件: 更新フローの成功後処理（onSuccess）を実行する
    // 検証: 編集が解除され、選択中の銘柄の取引データが再読込される
    const { flow, stubs } = createFlow('2122', '積立購入-2026-10-02');

    await flow(積立購入);
    const options = stubs.runMutationFlow.mock.calls[0]?.[0];
    if (options === undefined) {
      throw new Error('更新フローが呼ばれていません。');
    }
    await options.onSuccess();

    expect(stubs.setTransactionEditMode).toHaveBeenCalledWith(null);
    expect(stubs.reloadAfterTransactionMutation).toHaveBeenCalledWith('ゴールドファンド');
  });

  describe('取引一覧の「すべて表示」切り替え', () => {
    /**
     * 抽出した updateTransactionListToggle に、ボタンのスタブと表示状態を注入して返す。
     *
     * @param showAllTransactions 全件を表示中かどうか
     */
    function createToggle(showAllTransactions: boolean) {
      const button = {
        textContent: '',
        classList: { toggle: vi.fn() },
      };
      const update = new Function(
        'transactionListToggle',
        'state',
        `${recentCountSource}\n${toggleSource}\nreturn updateTransactionListToggle;`
      )(button, { showAllTransactions }) as (totalCount: number) => void;
      return { update, button };
    }

    it('取引が直近 5 件以下ならボタンを隠す', () => {
      // 前提: 選択中の銘柄の取引が 5 件ちょうどである
      // 検証: hidden クラスが付与される（切り替える必要がない）
      const { update, button } = createToggle(false);

      update(5);

      expect(button.classList.toggle).toHaveBeenCalledWith('hidden', true);
    });

    it('取引がちょうど 6 件（直近 5 件を 1 件超える）なら、ボタンを表示する', () => {
      // 前提: 選択中の銘柄の取引が 6 件で、直近 5 件だけを表示している
      // 検証: hidden クラスが外れ、文言が「すべて表示（6件）」になる（5 件と 6 件の境界）
      const { update, button } = createToggle(false);

      update(6);

      expect(button.classList.toggle).toHaveBeenCalledWith('hidden', false);
      expect(button.textContent).toBe('すべて表示（6件）');
    });

    it('直近 5 件を超える取引があり、直近だけを表示中なら「すべて表示（件数）」を表示する', () => {
      // 前提: 選択中の銘柄の取引が 24 件（2 年分の積立）あり、直近 5 件だけを表示している
      // 検証: ボタンが表示され、文言が「すべて表示（24件）」になる
      const { update, button } = createToggle(false);

      update(24);

      expect(button.classList.toggle).toHaveBeenCalledWith('hidden', false);
      expect(button.textContent).toBe('すべて表示（24件）');
    });

    it('全件を表示中なら「直近5件だけ表示」を表示する', () => {
      // 前提: 選択中の銘柄の取引が 24 件あり、全件を表示している
      // 検証: 文言が「直近5件だけ表示」になる
      const { update, button } = createToggle(true);

      update(24);

      expect(button.textContent).toBe('直近5件だけ表示');
    });
  });
});
