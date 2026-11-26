import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it, vi } from 'vite-plus/test';

/**
 * src/ui/scripts.html の「スポット取引」カードで「対象銘柄」を切り替えたときの、
 * 銘柄別の取引一覧（#transactionList）の表示のテスト（issue #316）。
 *
 * 前提:
 * - 「対象銘柄」の change イベントは selectTransactionFund を呼ぶ。
 * - selectTransactionFund は、前の銘柄の取引を一覧から消してから、loadTransactions で
 *   getTransactionHistory API を呼ぶ。本番の API（google.script.run）は応答に秒単位の時間がかかる。
 * - 一覧の描画は renderTransactions が行う。読み込み中・取得失敗の間は、取引の代わりに
 *   TRANSACTION_LIST_STATUS_MESSAGES の文言を表示する。
 *
 * 検証項目:
 * - 銘柄を切り替えた直後（API の応答前）に、前の銘柄の取引と操作ボタンが消え、「読み込み中」が表示される。
 * - API が成功すると、切り替えた後の銘柄の取引が表示される。
 * - API が失敗すると、前の銘柄の取引が残らず、一覧の位置に取得の失敗が表示される。
 * - 応答を待つ間に別の銘柄へ切り替えた場合、古い応答（成功・失敗）で一覧を上書きしない。
 * - 銘柄の選択を外した場合は、API を呼ばずに取引 0 件の表示にする。
 * - 取得に失敗した後で読み込み直しに成功すると、取引の表示に戻る。
 * - 定義していない読み込み状態は、別の表示へ切り替えずにエラーにする。
 *
 * テストの方法:
 * - scripts.html は素の JavaScript であり、モジュールとして読み込めない。このため実ソースから関数の
 *   定義を抽出し、DOM と API のスタブを注入して実行する。
 */

// 不変の実ソースはファイル全体で一度だけ読み込み、定義を抽出する。
// 抽出に失敗した場合は、関数の構造が変わったものとして直ちに失敗させる（別の実装へ切り替えない）。
const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/scripts.html'), 'utf8');

/**
 * scripts.html から、正規表現に一致する定義のソースを抽出する。
 *
 * @param name 抽出する定義の名前（エラーメッセージ用）
 * @param pattern 定義全体に一致する正規表現
 * @returns 抽出したソース
 */
function extractSource(name: string, pattern: RegExp): string {
  const matched = source.match(pattern)?.[0];
  if (!matched) {
    throw new Error(`scripts.html から ${name} を抽出できませんでした。`);
  }
  return matched;
}

const extractedSources = [
  extractSource('TRANSACTION_LIST_RECENT_COUNT', /const TRANSACTION_LIST_RECENT_COUNT = \d+;/),
  extractSource(
    'TRANSACTION_LIST_STATUS_MESSAGES',
    /const TRANSACTION_LIST_STATUS_MESSAGES = \{[\s\S]*?\n {4}\};/
  ),
  extractSource(
    'updateTransactionListToggle',
    /function updateTransactionListToggle\(totalCount\) \{[\s\S]*?\n {4}\}/
  ),
  extractSource('renderTransactions', /function renderTransactions\(\) \{[\s\S]*?\n {4}\}/),
  extractSource('loadTransactions', /async function loadTransactions\(fundId\) \{[\s\S]*?\n {4}\}/),
  extractSource(
    'selectTransactionFund',
    /async function selectTransactionFund\(fundId\) \{[\s\S]*?\n {4}\}/
  ),
].join('\n');

/** 一覧に表示する取引（テストで使う項目だけ）。 */
type 取引 = { id: string; fundId: string; type: string; date: string; units: number };

/** 一覧（#transactionList）のスタブに追加される行。文言だけの行か、取引の行のいずれか。 */
type 一覧の行 =
  | { kind: '文言'; text: string }
  | { kind: '取引'; id: string; fundId: string; actions: string[] };

/** getTransactionHistory API の応答。 */
type 取引履歴の応答 =
  | { success: true; value: 取引[] }
  | { success: false; error: { message: string } };

/** ゴールドファンドのスポット購入（切り替える前の銘柄の取引）。 */
const ゴールドファンドの取引: 取引 = {
  id: 'スポット購入-ゴールド-2026-10-02',
  fundId: 'ゴールドファンド',
  type: 'SPOT_PURCHASE',
  date: '2026-10-02',
  units: 2122,
};

/** S&P500ファンドのスポット購入（切り替えた後の銘柄の取引）。 */
const SP500ファンドの取引: 取引 = {
  id: 'スポット購入-SP500-2026-11-25',
  fundId: 'S&P500ファンド',
  type: 'SPOT_PURCHASE',
  date: '2026-11-25',
  units: 11817,
};

/** 「読み込み中」を示す一覧の行。 */
const 読み込み中の行: 一覧の行 = { kind: '文言', text: '取引履歴を読み込み中です...' };

/** 取得の失敗を示す一覧の行。 */
const 取得失敗の行: 一覧の行 = {
  kind: '文言',
  text: '取引履歴を取得できませんでした。「再読み込み」ボタンで読み込み直してください。',
};

/** 取引 0 件を示す一覧の行。 */
const 取引なしの行: 一覧の行 = { kind: '文言', text: '取引履歴がありません。' };

/**
 * 取引の行として期待する値を作る。スポット購入には「編集」「口数を訂正」「削除」の操作ボタンが付く。
 *
 * @param transaction 表示される取引
 */
function スポット購入の行(transaction: 取引): 一覧の行 {
  return {
    kind: '取引',
    id: transaction.id,
    fundId: transaction.fundId,
    actions: ['編集', '口数を訂正', '削除'],
  };
}

/**
 * 抽出した関数に、テストごとの独立したスタブを注入して返す。
 *
 * getTransactionHistory API は、テストが応答の時点を決められるよう、呼び出しごとに未解決の Promise を返す。
 * テストは respond(銘柄ID, 応答) で、その銘柄への呼び出しに応答を返す。
 *
 * @param initial 画面の初期状態。選択中の銘柄と、表示済みの取引
 */
function createScreen(initial: { selectedFundId: string | null; transactions: 取引[] }) {
  const state = {
    selectedTransactionFundId: initial.selectedFundId,
    transactionHistory: initial.transactions,
    showAllTransactions: false,
    transactionListStatus: 'loaded',
  };

  // #transactionList のスタブ。innerHTML への空文字の代入で行を消し、appendChild で行を追加する。
  const rows: 一覧の行[] = [];
  const transactionList = {
    set innerHTML(value: string) {
      if (value !== '') {
        throw new Error('一覧のスタブは、innerHTML への空文字の代入だけを扱います。');
      }
      rows.length = 0;
    },
    appendChild(row: 一覧の行) {
      rows.push(row);
    },
  };
  const transactionListToggle = { textContent: '', classList: { toggle: vi.fn() } };

  // 共通ファクトリ（common-scripts.html の window.TrustfolioUi）のスタブ。行の内容だけを記録する。
  const windowStub = {
    TrustfolioUi: {
      createEmptyListItem: (message: string): 一覧の行 => ({ kind: '文言', text: message }),
      createTransactionItem: (transaction: 取引, options: { actions: string[] }): 一覧の行 => ({
        kind: '取引',
        id: transaction.id,
        fundId: transaction.fundId,
        actions: options.actions,
      }),
    },
  };

  // 未応答の getTransactionHistory の呼び出し。銘柄IDごとに、応答を返す関数を保持する。
  const pendingResponses = new Map<string, (response: 取引履歴の応答) => void>();
  const callApi = vi.fn(
    (request: { action: string; fundId: string }) =>
      new Promise<取引履歴の応答>((resolve) => {
        pendingResponses.set(request.fundId, resolve);
      })
  );
  const setMessage = vi.fn();

  const functions = new Function(
    'state',
    'window',
    'transactionList',
    'transactionListToggle',
    'callApi',
    'setMessage',
    'createActionButton',
    'createTransactionDeleteButton',
    'setTransactionEditMode',
    'runUnitsCorrectionFlow',
    'listItemClass',
    'listEmptyClass',
    'listContentClass',
    'listActionsClass',
    'ghostButtonClass',
    'badgeSpotClass',
    'badgeRedemptionClass',
    'badgeRecurringClass',
    `${extractedSources}\nreturn { renderTransactions, loadTransactions, selectTransactionFund };`
  )(
    state,
    windowStub,
    transactionList,
    transactionListToggle,
    callApi,
    setMessage,
    // 操作ボタンのスタブ。ボタンの代わりに、ボタンの文言を行へ記録する。
    (label: string) => label,
    () => '削除',
    vi.fn(),
    vi.fn(),
    '一覧の行のクラス',
    '文言の行のクラス',
    '行の内容のクラス',
    '操作ボタン群のクラス',
    '操作ボタンのクラス',
    'スポット購入バッジのクラス',
    '売却バッジのクラス',
    '積立購入バッジのクラス'
  ) as {
    renderTransactions: () => void;
    loadTransactions: (fundId: string) => Promise<void>;
    selectTransactionFund: (fundId: string) => Promise<void>;
  };

  // 初期状態の取引を一覧へ描画しておく（銘柄を切り替える前の画面を再現する）。
  functions.renderTransactions();

  /**
   * 指定した銘柄への getTransactionHistory の呼び出しに応答を返す。
   * その銘柄への未応答の呼び出しがない場合は、テストの誤りとして直ちに失敗させる。
   */
  const respond = (fundId: string, response: 取引履歴の応答): void => {
    const resolve = pendingResponses.get(fundId);
    if (!resolve) {
      throw new Error(`${fundId} への getTransactionHistory の未応答の呼び出しがありません。`);
    }
    pendingResponses.delete(fundId);
    resolve(response);
  };

  return { ...functions, state, rows, transactionListToggle, callApi, setMessage, respond };
}

describe('scripts.html のスポット取引の対象銘柄の切り替え', () => {
  it('切り替えた直後（API の応答前）は、前の銘柄の取引と操作ボタンを消して「読み込み中」を表示する', () => {
    // 前提: ゴールドファンドを選択中で、その取引 1 件が操作ボタン付きで一覧に表示されている
    const screen = createScreen({
      selectedFundId: 'ゴールドファンド',
      transactions: [ゴールドファンドの取引],
    });
    expect(screen.rows).toEqual([スポット購入の行(ゴールドファンドの取引)]);

    // 事前条件: 「対象銘柄」を S&P500ファンドへ切り替える。getTransactionHistory はまだ応答していない
    void screen.selectTransactionFund('S&P500ファンド');

    // 検証: ゴールドファンドの取引と操作ボタンが消え、「読み込み中」だけが表示される。
    //   「すべて表示」ボタンは隠れ、S&P500ファンドの取引履歴を API へ要求している
    expect(screen.rows).toEqual([読み込み中の行]);
    expect(screen.transactionListToggle.classList.toggle).toHaveBeenLastCalledWith('hidden', true);
    expect(screen.callApi).toHaveBeenCalledWith({
      action: 'getTransactionHistory',
      fundId: 'S&P500ファンド',
    });
  });

  it('API が成功すると、切り替えた後の銘柄の取引を表示する', async () => {
    // 前提: ゴールドファンドの取引を表示中に、S&P500ファンドへ切り替える
    const screen = createScreen({
      selectedFundId: 'ゴールドファンド',
      transactions: [ゴールドファンドの取引],
    });
    const switching = screen.selectTransactionFund('S&P500ファンド');

    // 事前条件: getTransactionHistory が S&P500ファンドの取引 1 件を返す
    screen.respond('S&P500ファンド', { success: true, value: [SP500ファンドの取引] });
    await switching;

    // 検証: S&P500ファンドの取引が操作ボタン付きで表示され、エラーメッセージは表示されない
    expect(screen.rows).toEqual([スポット購入の行(SP500ファンドの取引)]);
    expect(screen.setMessage).not.toHaveBeenCalled();
  });

  it('API が失敗すると、前の銘柄の取引を残さず、一覧の位置に取得の失敗を表示する', async () => {
    // 前提: ゴールドファンドの取引を表示中に、S&P500ファンドへ切り替える
    const screen = createScreen({
      selectedFundId: 'ゴールドファンド',
      transactions: [ゴールドファンドの取引],
    });
    const switching = screen.selectTransactionFund('S&P500ファンド');

    // 事前条件: getTransactionHistory が失敗を返す
    screen.respond('S&P500ファンド', {
      success: false,
      error: { message: '取引シートを読み込めませんでした。' },
    });
    await switching;

    // 検証: 一覧には取得の失敗だけが表示され、ゴールドファンドの取引は残らない。
    //   画面上部のメッセージにも、API のエラーメッセージが表示される
    expect(screen.rows).toEqual([取得失敗の行]);
    expect(screen.setMessage).toHaveBeenCalledWith('取引シートを読み込めませんでした。', 'error');
  });

  it('応答を待つ間に別の銘柄へ切り替えた場合、古い銘柄の成功の応答で一覧を上書きしない', async () => {
    // 前提: ゴールドファンド → S&P500ファンド → 全世界株式ファンド の順に、応答を待たずに切り替える
    const screen = createScreen({
      selectedFundId: 'ゴールドファンド',
      transactions: [ゴールドファンドの取引],
    });
    const switchingToSp500 = screen.selectTransactionFund('S&P500ファンド');
    void screen.selectTransactionFund('全世界株式ファンド');

    // 事前条件: 先に切り替えた S&P500ファンドの応答だけが、後から届く
    screen.respond('S&P500ファンド', { success: true, value: [SP500ファンドの取引] });
    await switchingToSp500;

    // 検証: 一覧は、選択中の全世界株式ファンドの「読み込み中」のままで、S&P500ファンドの取引は表示されない
    expect(screen.rows).toEqual([読み込み中の行]);
  });

  it('応答を待つ間に別の銘柄へ切り替えた場合、古い銘柄の失敗の応答で一覧を上書きしない', async () => {
    // 前提: ゴールドファンド → S&P500ファンド → 全世界株式ファンド の順に、応答を待たずに切り替える
    const screen = createScreen({
      selectedFundId: 'ゴールドファンド',
      transactions: [ゴールドファンドの取引],
    });
    const switchingToSp500 = screen.selectTransactionFund('S&P500ファンド');
    void screen.selectTransactionFund('全世界株式ファンド');

    // 事前条件: 先に切り替えた S&P500ファンドの読み込みだけが、後から失敗する
    screen.respond('S&P500ファンド', {
      success: false,
      error: { message: '取引シートを読み込めませんでした。' },
    });
    await switchingToSp500;

    // 検証: 一覧は、選択中の全世界株式ファンドの「読み込み中」のままで、取得の失敗の表示に変わらない
    expect(screen.rows).toEqual([読み込み中の行]);
  });

  it('銘柄の選択を外した場合は、API を呼ばずに取引 0 件の表示にする', async () => {
    // 前提: ゴールドファンドの取引を表示中である
    const screen = createScreen({
      selectedFundId: 'ゴールドファンド',
      transactions: [ゴールドファンドの取引],
    });

    // 事前条件: 「対象銘柄」を未選択（空文字）にする
    await screen.selectTransactionFund('');

    // 検証: 取引 0 件の表示になり、getTransactionHistory は呼ばれない
    expect(screen.rows).toEqual([取引なしの行]);
    expect(screen.callApi).not.toHaveBeenCalled();
  });

  it('取得に失敗した後で読み込み直しに成功すると、取引の表示に戻る', async () => {
    // 前提: S&P500ファンドへ切り替えたが、取引履歴の取得に失敗している
    const screen = createScreen({
      selectedFundId: 'ゴールドファンド',
      transactions: [ゴールドファンドの取引],
    });
    const switching = screen.selectTransactionFund('S&P500ファンド');
    screen.respond('S&P500ファンド', {
      success: false,
      error: { message: '取引シートを読み込めませんでした。' },
    });
    await switching;
    expect(screen.rows).toEqual([取得失敗の行]);

    // 事前条件: 「再読み込み」ボタンに相当する loadTransactions の再実行が成功する
    const reloading = screen.loadTransactions('S&P500ファンド');
    screen.respond('S&P500ファンド', { success: true, value: [SP500ファンドの取引] });
    await reloading;

    // 検証: 取得の失敗の表示が消え、S&P500ファンドの取引が表示される
    expect(screen.rows).toEqual([スポット購入の行(SP500ファンドの取引)]);
  });

  it('定義していない読み込み状態は、別の表示へ切り替えずにエラーにする', () => {
    // 前提: 読み込み状態は 'loaded'・'loading'・'failed' の 3 つだけを定義している
    const screen = createScreen({ selectedFundId: 'ゴールドファンド', transactions: [] });

    // 事前条件: 定義していない状態 '不明な状態' を設定する
    screen.state.transactionListStatus = '不明な状態';

    // 検証: 取引 0 件などの表示で取り繕わず、状態の名前を含むエラーを投げる
    expect(() => screen.renderTransactions()).toThrow('不明な状態');
  });
});
