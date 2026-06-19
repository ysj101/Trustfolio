import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * このテストは src/ui/common-scripts.html が公開する window.TrustfolioUi の
 * ユーティリティ群（callApi / formatCurrency / formatPercent / setLoading /
 * createSetMessage）の挙動を検証する。
 *
 * 前提:
 * - common-scripts.html は素のJS（ビルド・型検査の対象外）であるため、
 *   <script> の中身を取り出し、DOM や google.script.run をモックした環境で評価する。
 * - これにより、UIをデプロイせずに共有ロジックの回帰を検出できるようにする。
 */

/** common-scripts.html から <script> 内のJS本文を取り出す。 */
function readCommonScriptsSource(): string {
  const filePath = path.join(process.cwd(), 'src', 'ui', 'common-scripts.html');
  const html = fs.readFileSync(filePath, 'utf8');
  const start = html.indexOf('<script>') + '<script>'.length;
  const end = html.lastIndexOf('</script>');
  return html.slice(start, end);
}

/** classList / 属性 / textContent を持つ最小限の要素モックを生成する。 */
function createElementMock(): {
  textContent: string;
  disabled: boolean;
  classList: { add: (...c: string[]) => void; remove: (...c: string[]) => void };
  setAttribute: (key: string, value: string) => void;
  removeAttribute: (key: string) => void;
  getAttribute: (key: string) => string | null;
  hasClass: (name: string) => boolean;
} {
  const classes = new Set<string>();
  const attributes = new Map<string, string>();
  return {
    textContent: '',
    disabled: false,
    classList: {
      add: (...names: string[]) => {
        for (const name of names) {
          classes.add(name);
        }
      },
      remove: (...names: string[]) => {
        for (const name of names) {
          classes.delete(name);
        }
      },
    },
    setAttribute: (key: string, value: string) => {
      attributes.set(key, value);
    },
    removeAttribute: (key: string) => {
      attributes.delete(key);
    },
    getAttribute: (key: string) => attributes.get(key) ?? null,
    hasClass: (name: string) => classes.has(name),
  };
}

/**
 * common-scripts.html を評価し、window.TrustfolioUi を返す。
 *
 * @param documentMock - document の差し替え
 * @param googleMock - google（google.script.run）の差し替え
 */
function loadTrustfolioUi(documentMock: unknown, googleMock: unknown): Record<string, Function> {
  const source = readCommonScriptsSource();
  const windowMock: Record<string, unknown> = {};
  // new Function で隔離評価する。window/document/google/タイマーを引数で注入する。
  const evaluate = new Function(
    'window',
    'document',
    'google',
    'setTimeout',
    'clearTimeout',
    source
  );
  evaluate(windowMock, documentMock, googleMock, globalThis.setTimeout, globalThis.clearTimeout);
  return windowMock.TrustfolioUi as Record<string, Function>;
}

/**
 * createElement で生成される DOM 要素を模した最小限のノードモック。
 *
 * 描画ファクトリ（renderFundSelect / createListItem / createTransactionItem 等）が
 * 生成する DOM 構造（タグ・クラス・テキスト・子要素の並び）を検証できるよう、
 * appendChild による子要素の蓄積と innerHTML='' による子要素クリアを再現する。
 */
interface NodeMock {
  tagName: string;
  className: string;
  textContent: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  type: string;
  innerHTML: string;
  dataset: Record<string, string>;
  children: NodeMock[];
  /** addEventListener で登録された (種別, ハンドラ) の記録。 */
  listeners: Array<{ type: string; handler: (event: unknown) => void }>;
  appendChild: (child: NodeMock) => NodeMock;
  addEventListener: (type: string, handler: (event: unknown) => void) => void;
}

/** タグ名を指定して NodeMock を生成する。 */
function createNodeMock(tagName: string): NodeMock {
  const node = {
    tagName: tagName.toUpperCase(),
    className: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    type: '',
    dataset: {} as Record<string, string>,
    children: [] as NodeMock[],
    listeners: [] as Array<{ type: string; handler: (event: unknown) => void }>,
    appendChild(child: NodeMock): NodeMock {
      node.children.push(child);
      return child;
    },
    addEventListener(type: string, handler: (event: unknown) => void): void {
      node.listeners.push({ type, handler });
    },
  } as NodeMock;
  // innerHTML は「クリア専用」として扱う。
  // 本テスト対象の関数群は innerHTML='' による子要素クリアしか行わないため、
  // set 時のみ実DOM挙動（空文字で子要素を全削除）を再現し、get は常に '' を返す。
  Object.defineProperty(node, 'innerHTML', {
    get: () => '',
    set: (value: string) => {
      if (value === '') {
        node.children.length = 0;
      }
    },
  });
  return node;
}

/** createElement のみを提供する document モックを生成する。 */
function createDocumentMock(): { createElement: (tag: string) => NodeMock } {
  return {
    createElement: (tag: string) => createNodeMock(tag),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('TrustfolioUi.formatCurrency', () => {
  it('整数の金額を3桁区切りで「円」付きにする', () => {
    const ui = loadTrustfolioUi({}, {});
    expect(ui.formatCurrency(1_234_000)).toBe('1,234,000円');
  });

  it('小数を含む値は四捨五入する（チャート軸の補間値など）', () => {
    const ui = loadTrustfolioUi({}, {});
    expect(ui.formatCurrency(1234.6)).toBe('1,235円');
  });
});

describe('TrustfolioUi.formatPercent', () => {
  it('比率を小数2桁のパーセント表記にする', () => {
    const ui = loadTrustfolioUi({}, {});
    expect(ui.formatPercent(0.1234)).toBe('12.34%');
  });
});

describe('TrustfolioUi.callApi', () => {
  it('成功時はレスポンスでresolveする', async () => {
    // google.script.run の成功ハンドラを同期的に呼ぶモック
    const response = { success: true, value: { message: 'ok' } };
    const run = {
      withSuccessHandler(onSuccess: (value: unknown) => void) {
        // 後続のhandleApiRequestで使うために保持
        (run as { onSuccess?: (value: unknown) => void }).onSuccess = onSuccess;
        return run;
      },
      withFailureHandler() {
        return run;
      },
      handleApiRequest() {
        (run as { onSuccess?: (value: unknown) => void }).onSuccess?.(response);
      },
    };
    const ui = loadTrustfolioUi({}, { script: { run } });
    await expect(ui.callApi({ action: 'listFunds' })).resolves.toEqual(response);
  });

  it('失敗時はエラーでrejectする', async () => {
    const error = new Error('通信に失敗しました。');
    const run = {
      withSuccessHandler() {
        return run;
      },
      withFailureHandler(onFailure: (error: unknown) => void) {
        (run as { onFailure?: (error: unknown) => void }).onFailure = onFailure;
        return run;
      },
      handleApiRequest() {
        (run as { onFailure?: (error: unknown) => void }).onFailure?.(error);
      },
    };
    const ui = loadTrustfolioUi({}, { script: { run } });
    await expect(ui.callApi({ action: 'listFunds' })).rejects.toThrow('通信に失敗しました。');
  });
});

describe('TrustfolioUi.setLoading', () => {
  it('ローディング中はappを薄くし対象要素を無効化、refreshButtonは常に有効化する', () => {
    const appEl = createElementMock();
    const buttons = [createElementMock(), createElementMock()];
    const refreshButton = createElementMock();
    const documentMock = {
      querySelector: (selector: string) => (selector === '.app' ? appEl : null),
      querySelectorAll: () => buttons,
      getElementById: (id: string) => (id === 'refreshButton' ? refreshButton : null),
    };
    const ui = loadTrustfolioUi(documentMock, {});

    ui.setLoading(true, 'button');
    expect(appEl.hasClass('opacity-60')).toBe(true);
    expect(appEl.hasClass('pointer-events-none')).toBe(true);
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[1]?.disabled).toBe(true);
    // refreshButton はローディング中でも操作可能に保つ
    expect(refreshButton.disabled).toBe(false);

    ui.setLoading(false, 'button');
    expect(appEl.hasClass('opacity-60')).toBe(false);
    expect(buttons[0]?.disabled).toBe(false);
    expect(refreshButton.disabled).toBe(false);
  });
});

describe('TrustfolioUi.createSetMessage', () => {
  it('テキストとstate属性を設定し、表示する', () => {
    const messageEl = createElementMock();
    const ui = loadTrustfolioUi({}, {});
    const setMessage = ui.createSetMessage(messageEl);

    setMessage('エラーが発生しました。', 'error');
    expect(messageEl.textContent).toBe('エラーが発生しました。');
    expect(messageEl.getAttribute('data-state')).toBe('error');
    expect(messageEl.hasClass('hidden')).toBe(false);
  });

  it('成功メッセージは10秒後に自動消去される', () => {
    vi.useFakeTimers();
    const messageEl = createElementMock();
    const ui = loadTrustfolioUi({}, {});
    const setMessage = ui.createSetMessage(messageEl);

    setMessage('保存しました。', 'success');
    expect(messageEl.textContent).toBe('保存しました。');

    // 10秒経過で消去される
    vi.advanceTimersByTime(10_000);
    expect(messageEl.textContent).toBe('');
    expect(messageEl.getAttribute('data-state')).toBeNull();
    expect(messageEl.hasClass('hidden')).toBe(true);
  });
});

describe('TrustfolioUi.renderFundSelect', () => {
  // サンプル銘柄（実際の名称に近い文字列を使用）
  const FUNDS = [
    { id: 'fund-emaxis', name: 'eMAXIS Slim 全世界株式' },
    { id: 'fund-sp500', name: 'SBI・V・S&P500' },
  ];

  it('銘柄が空のときは select を無効化し「銘柄がありません」の単一 option のみを表示する', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});
    const select = createNodeMock('select');

    const result = ui.renderFundSelect(select, []);

    // 戻り値は null（選択値の解決なし）
    expect(result).toBeNull();
    expect(select.disabled).toBe(true);
    expect(select.children).toHaveLength(1);
    expect(select.children[0]?.tagName).toBe('OPTION');
    expect(select.children[0]?.textContent).toBe('銘柄がありません');
    expect(select.children[0]?.value).toBe('');
  });

  it('銘柄があるときは各 fund を option 化し select を有効化する', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});
    const select = createNodeMock('select');

    ui.renderFundSelect(select, FUNDS);

    expect(select.disabled).toBe(false);
    expect(select.children).toHaveLength(2);
    expect(select.children[0]?.value).toBe('fund-emaxis');
    expect(select.children[0]?.textContent).toBe('eMAXIS Slim 全世界株式');
    expect(select.children[1]?.value).toBe('fund-sp500');
    expect(select.children[1]?.textContent).toBe('SBI・V・S&P500');
  });

  it('keepSelection なしでは value を設定せず null を返す（積立フォームの挙動）', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});
    const select = createNodeMock('select');

    const result = ui.renderFundSelect(select, FUNDS);

    expect(result).toBeNull();
    // value 未設定（初期値の空文字のまま）
    expect(select.value).toBe('');
  });

  it('keepSelection で既存の選択を維持し、その fundId を value へ設定して返す（取引フォームの挙動）', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});
    const select = createNodeMock('select');

    const result = ui.renderFundSelect(select, FUNDS, {
      keepSelection: true,
      selectedFundId: 'fund-sp500',
    });

    expect(result).toBe('fund-sp500');
    expect(select.value).toBe('fund-sp500');
  });

  it('keepSelection で選択が未設定 / 存在しない銘柄のときは先頭 fund へフォールバックする', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});

    // 選択未設定
    const selectA = createNodeMock('select');
    expect(ui.renderFundSelect(selectA, FUNDS, { keepSelection: true, selectedFundId: null })).toBe(
      'fund-emaxis'
    );
    expect(selectA.value).toBe('fund-emaxis');

    // 既に存在しない銘柄を選択していた場合
    const selectB = createNodeMock('select');
    expect(
      ui.renderFundSelect(selectB, FUNDS, {
        keepSelection: true,
        selectedFundId: 'fund-deleted',
      })
    ).toBe('fund-emaxis');
    expect(selectB.value).toBe('fund-emaxis');
  });
});

describe('TrustfolioUi.createEmptyListItem', () => {
  it('指定した文言とクラスを持つ <li> を生成する', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});

    const li = ui.createEmptyListItem('取引履歴がありません。', 'item-class empty-class');

    expect(li.tagName).toBe('LI');
    expect(li.className).toBe('item-class empty-class');
    expect(li.textContent).toBe('取引履歴がありません。');
  });
});

describe('TrustfolioUi.createActionButton', () => {
  it('type=button のボタンを生成し、クリックで onClick を呼ぶ', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});
    const onClick = vi.fn();

    const button = ui.createActionButton('削除', 'ghost-button', onClick);

    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.textContent).toBe('削除');
    expect(button.className).toBe('ghost-button');

    // 登録された click ハンドラを実行すると onClick が呼ばれる
    const clickListener = button.listeners.find((l: { type: string }) => l.type === 'click');
    expect(clickListener).toBeDefined();
    clickListener?.handler(undefined);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('TrustfolioUi.createListItem', () => {
  it('li(itemClass) > content(contentClass) に本文要素を順番に並べる', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});
    const childA = createNodeMock('strong');
    childA.textContent = '本文A';
    const childB = createNodeMock('span');
    childB.textContent = '本文B';

    const li = ui.createListItem({
      itemClass: 'list-item',
      contentClass: 'list-content',
      contentChildren: [childA, childB],
    });

    expect(li.tagName).toBe('LI');
    expect(li.className).toBe('list-item');
    // 操作ボタン無し → 子要素は content のみ
    expect(li.children).toHaveLength(1);
    const content = li.children[0];
    expect(content?.className).toBe('list-content');
    expect(content?.children).toEqual([childA, childB]);
  });

  it('actions 指定時は content の後ろに actions(actionsClass) を追加する', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});
    const child = createNodeMock('strong');
    const editButton = createNodeMock('button');
    const deleteButton = createNodeMock('button');

    const li = ui.createListItem({
      itemClass: 'list-item',
      contentClass: 'list-content',
      contentChildren: [child],
      actionsClass: 'list-actions',
      actions: [editButton, deleteButton],
    });

    // content + actions の2要素
    expect(li.children).toHaveLength(2);
    const actions = li.children[1];
    expect(actions?.className).toBe('list-actions');
    expect(actions?.children).toEqual([editButton, deleteButton]);
  });

  it('actions が空配列のときは操作ボタンラッパを生成しない', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});

    const li = ui.createListItem({
      itemClass: 'list-item',
      contentClass: 'list-content',
      contentChildren: [createNodeMock('span')],
      actionsClass: 'list-actions',
      actions: [],
    });

    expect(li.children).toHaveLength(1);
  });

  it('actionsClass を省略しても actions ラッパの className が文字列 "undefined" にならない', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});

    const li = ui.createListItem({
      itemClass: 'list-item',
      contentClass: 'list-content',
      contentChildren: [createNodeMock('span')],
      // actionsClass を意図的に省略する
      actions: [createNodeMock('button')],
    });

    expect(li.children).toHaveLength(2);
    expect(li.children[1]?.className).toBe('');
    expect(li.children[1]?.className).not.toBe('undefined');
  });
});

describe('TrustfolioUi.createTransactionItem', () => {
  // 各種別の取引行で共通して渡すクラス設定（実コードの値に揃える）
  const BASE_OPTIONS = {
    itemClass: 'list-item',
    contentClass: 'list-content',
    headerClass: 'flex items-center gap-2 text-sm text-slate-200',
    detailClass: 'text-xs text-slate-400',
    badgeSpotClass: 'badge-spot',
    badgeRedemptionClass: 'badge-redemption',
    badgeRecurringClass: 'badge-recurring',
  };

  it('スポット購入は「スポット購入」バッジと金額/口数/基準価額の詳細を表示する', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});

    const li = ui.createTransactionItem(
      { type: 'SPOT_PURCHASE', date: '2026-06-20', amount: 30000, units: 25000, navValue: 12000 },
      BASE_OPTIONS
    );

    const content = li.children[0];
    // content の子は [header, detail]（fundName 無し）
    expect(content?.children).toHaveLength(2);
    const header = content?.children[0];
    expect(header?.className).toBe('flex items-center gap-2 text-sm text-slate-200');
    // header の子は [date(strong), badge(span)]
    expect(header?.children[0]?.textContent).toBe('2026-06-20');
    expect(header?.children[1]?.className).toBe('badge-spot');
    expect(header?.children[1]?.textContent).toBe('スポット購入');
    // 詳細行
    const detail = content?.children[1];
    expect(detail?.className).toBe('text-xs text-slate-400');
    expect(detail?.textContent).toBe('30,000円 / 25,000口 / 基準価額: 12,000円');
  });

  it('売却は「売却」バッジを表示し、口数を絶対値で表示する', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});

    const li = ui.createTransactionItem(
      { type: 'REDEMPTION', date: '2026-06-21', amount: 15000, units: -10000, navValue: 15000 },
      BASE_OPTIONS
    );

    const header = li.children[0]?.children[0];
    expect(header?.children[1]?.className).toBe('badge-redemption');
    expect(header?.children[1]?.textContent).toBe('売却');
    const detail = li.children[0]?.children[1];
    // units=-10000 → 絶対値 10,000口
    expect(detail?.textContent).toBe('15,000円 / 10,000口 / 基準価額: 15,000円');
  });

  it('SPOT_PURCHASE / REDEMPTION 以外は「積立購入」バッジを表示する', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});

    const li = ui.createTransactionItem(
      {
        type: 'RECURRING_PURCHASE',
        date: '2026-06-22',
        amount: 10000,
        units: 8000,
        navValue: 12500,
      },
      BASE_OPTIONS
    );

    const badge = li.children[0]?.children[0]?.children[1];
    expect(badge?.className).toBe('badge-recurring');
    expect(badge?.textContent).toBe('積立購入');
  });

  it('fundName 指定時はヘッダーと詳細の間に銘柄名 <div> を挿入する（全取引履歴の挙動）', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});

    const li = ui.createTransactionItem(
      { type: 'SPOT_PURCHASE', date: '2026-06-20', amount: 30000, units: 25000, navValue: 12000 },
      {
        ...BASE_OPTIONS,
        headerClass: 'mb-1 flex items-center gap-2 text-sm text-slate-200',
        fundName: 'eMAXIS Slim 全世界株式',
        fundNameClass: 'text-sm font-medium text-slate-100',
      }
    );

    const content = li.children[0];
    // content の子は [header, fundName, detail] の順
    expect(content?.children).toHaveLength(3);
    expect(content?.children[0]?.className).toBe(
      'mb-1 flex items-center gap-2 text-sm text-slate-200'
    );
    expect(content?.children[1]?.className).toBe('text-sm font-medium text-slate-100');
    expect(content?.children[1]?.textContent).toBe('eMAXIS Slim 全世界株式');
  });

  it('fundName 指定かつ fundNameClass 省略でも銘柄名 <div> の className が文字列 "undefined" にならない', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});

    const li = ui.createTransactionItem(
      { type: 'SPOT_PURCHASE', date: '2026-06-20', amount: 30000, units: 25000, navValue: 12000 },
      // fundNameClass を意図的に省略する
      { ...BASE_OPTIONS, fundName: 'eMAXIS Slim 全世界株式' }
    );

    const fundNameDiv = li.children[0]?.children[1];
    expect(fundNameDiv?.textContent).toBe('eMAXIS Slim 全世界株式');
    expect(fundNameDiv?.className).toBe('');
    expect(fundNameDiv?.className).not.toBe('undefined');
  });

  it('actions 指定時は li 直下に操作ボタン群を追加する（取引一覧の挙動）', () => {
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});
    const editButton = createNodeMock('button');
    const deleteButton = createNodeMock('button');

    const li = ui.createTransactionItem(
      { type: 'SPOT_PURCHASE', date: '2026-06-20', amount: 30000, units: 25000, navValue: 12000 },
      { ...BASE_OPTIONS, actionsClass: 'list-actions', actions: [editButton, deleteButton] }
    );

    // content + actions
    expect(li.children).toHaveLength(2);
    expect(li.children[1]?.className).toBe('list-actions');
    expect(li.children[1]?.children).toEqual([editButton, deleteButton]);
  });
});

describe('TrustfolioUi.resetFormFields', () => {
  it('textInputs の value を空にし、checkedInputs の checked を true へ戻す', () => {
    const ui = loadTrustfolioUi({}, {});
    const dateInput = createNodeMock('input');
    dateInput.value = '2026-06-20';
    const amountInput = createNodeMock('input');
    amountInput.value = '30000';
    const activeInput = createNodeMock('input');
    activeInput.checked = false;

    ui.resetFormFields({
      textInputs: [dateInput, amountInput],
      checkedInputs: [activeInput],
    });

    expect(dateInput.value).toBe('');
    expect(amountInput.value).toBe('');
    expect(activeInput.checked).toBe(true);
  });

  it('checkedInputs を省略してもエラーにならず textInputs のみクリアする', () => {
    const ui = loadTrustfolioUi({}, {});
    const input = createNodeMock('input');
    input.value = '12345';

    ui.resetFormFields({ textInputs: [input] });

    expect(input.value).toBe('');
  });
});
