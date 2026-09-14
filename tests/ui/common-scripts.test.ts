import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASSET_CLASSES, type AssetClass } from '../../src/domain/types';
import { getAssetClassLabel } from '../../src/domain/assetClassLabel';

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
  classList: {
    add: (...c: string[]) => void;
    remove: (...c: string[]) => void;
  };
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
 * google.script.run を模したモックを生成する。
 *
 * callApi は withSuccessHandler / withFailureHandler をチェーンした後に
 * handleApiRequestJson(request) を呼ぶ。本モックは登録された両ハンドラを保持し、
 * handleApiRequestJson が呼ばれた時点で respond に渡して「GAS 側の応答」を再現する。
 * ハンドラ未登録のまま応答しようとした場合は暗黙に無視せず例外で失敗させる。
 *
 * @param respond - GAS 側の応答を再現する関数。onSuccess / onFailure のどちらかを呼ぶ。
 * @returns run: google.script.run 相当のモック / requests: handleApiRequestJson に渡されたリクエストの記録
 */
function createScriptRunMock(
  respond: (onSuccess: (value: unknown) => void, onFailure: (error: unknown) => void) => void
): { run: unknown; requests: unknown[] } {
  const requests: unknown[] = [];
  let onSuccess: (value: unknown) => void = () => {
    throw new Error('withSuccessHandler が登録されていません。');
  };
  let onFailure: (error: unknown) => void = () => {
    throw new Error('withFailureHandler が登録されていません。');
  };
  const run = {
    withSuccessHandler(handler: (value: unknown) => void) {
      onSuccess = handler;
      return run;
    },
    withFailureHandler(handler: (error: unknown) => void) {
      onFailure = handler;
      return run;
    },
    handleApiRequestJson(request: unknown) {
      requests.push(request);
      respond(onSuccess, onFailure);
    },
  };
  return { run, requests };
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

/** 楽天証券から基準価額を取得する銘柄（楽天ファンドIDのみ設定）。 */
const RAKUTEN_FUND = { rakutenFundId: 'JP90C000H1T1', navSource: null, navSourceCode: null };
/** Wealth Advisorから取得する銘柄。 */
const WEALTH_ADVISOR_FUND = {
  rakutenFundId: null,
  navSource: 'wealthadvisor',
  navSourceCode: 'sbi_am/sa_202306080A',
};
/** 取得元未設定の銘柄。 */
const UNSET_FUND = { rakutenFundId: null, navSource: null, navSourceCode: null };

describe('TrustfolioUi.buildNavSourceFields', () => {
  it('取得元種別ごとにAPI送信用の3フィールドを組み立てる', () => {
    // 前提: 入力コードはtrim済みで、noneではコードを使用しない。
    // 事前条件: 各種別に対応するコードを用意する。
    // 検証: 楽天証券・Wealth Advisor・未設定が排他的な値になる。
    const ui = loadTrustfolioUi(createDocumentMock(), {});
    expect(ui.buildNavSourceFields('none', '')).toEqual({
      success: true,
      value: {
        rakutenFundId: null,
        navSource: null,
        navSourceCode: null,
      },
    });
    expect(ui.buildNavSourceFields('rakuten', 'JP90C000H1T1')).toEqual({
      success: true,
      value: {
        rakutenFundId: 'JP90C000H1T1',
        navSource: null,
        navSourceCode: null,
      },
    });
    expect(ui.buildNavSourceFields('wealthadvisor', 'sbi_am/sa_202306080A')).toEqual({
      success: true,
      value: {
        rakutenFundId: null,
        navSource: 'wealthadvisor',
        navSourceCode: 'sbi_am/sa_202306080A',
      },
    });
  });
  it('空コードと未知の種別を失敗 Result にする', () => {
    // 前提: 楽天証券とWealth Advisorはコード入力を必須とし、yahooは未定義である。
    // 事前条件: 空コードと未知の種別をbuildNavSourceFieldsへ渡す。
    // 検証: 必須コードの欠落と未対応値を暗黙に補正しない。
    const ui = loadTrustfolioUi(createDocumentMock(), {});
    expect(ui.buildNavSourceFields('rakuten', '')).toMatchObject({
      success: false,
      error: { type: 'validation' },
    });
    expect(ui.buildNavSourceFields('wealthadvisor', '')).toMatchObject({
      success: false,
      error: { type: 'validation' },
    });
    expect(ui.buildNavSourceFields('yahoo', 'sbi_am/sa_202306080A')).toMatchObject({
      success: false,
      error: { type: 'unexpected' },
    });
  });
});

describe('TrustfolioUi.resolveNavSourceKind', () => {
  it.each([
    { name: '楽天証券', fund: RAKUTEN_FUND, kind: 'rakuten' },
    { name: 'Wealth Advisor', fund: WEALTH_ADVISOR_FUND, kind: 'wealthadvisor' },
    { name: '取得元未設定', fund: UNSET_FUND, kind: 'none' },
  ])('$name の銘柄から取得元種別 $kind を逆引きする', ({ fund, kind }) => {
    // 前提: ブラウザに届く Fund は FundRepository の読み取り時検証を通過しており、
    //       楽天ファンドIDと Wealth Advisor の組み合わせ不変条件を満たしている。
    // 事前条件: navSource が 'wealthadvisor' か null のいずれかである。
    // 検証: navSource を優先し、次に rakutenFundId の有無で 3 種別のいずれかを成功 Result で返す。
    const ui = loadTrustfolioUi(createDocumentMock(), {});
    expect(ui.resolveNavSourceKind(fund)).toEqual({ success: true, value: kind });
  });

  it('未知の navSource を失敗 Result にする', () => {
    // 前提: Fund 型の navSource は 'wealthadvisor' | null の型契約を持つ。
    // 事前条件: サーバー側で取得元が追加されたのに UI が未対応の状況を模し、'morningstar' を渡す。
    // 検証: 暗黙に「取得元未設定」へ読み替えず、値を含むメッセージの失敗 Result を返す。
    const ui = loadTrustfolioUi(createDocumentMock(), {});
    expect(
      ui.resolveNavSourceKind({
        rakutenFundId: null,
        navSource: 'morningstar',
        navSourceCode: null,
      })
    ).toMatchObject({ success: false, error: { message: expect.stringContaining('morningstar') } });
  });
});

describe('TrustfolioUi.formatNavSourceLabel', () => {
  it.each([
    { name: '楽天証券', fund: RAKUTEN_FUND, label: '楽天証券: JP90C000H1T1' },
    {
      name: 'Wealth Advisor',
      fund: WEALTH_ADVISOR_FUND,
      label: 'Wealth Advisor: sbi_am/sa_202306080A',
    },
    { name: '取得元未設定', fund: UNSET_FUND, label: '取得元未設定' },
  ])('$name の銘柄を一覧表示用ラベル「$label」に変換する', ({ fund, label }) => {
    // 前提: 銘柄一覧では取得元種別と識別子を「<取得元>: <識別子>」の統一形式で表示する。
    // 事前条件: Fund は 3 種別のいずれかを表す正常データである。
    // 検証: 楽天証券・Wealth Advisor はセレクトと同じ文言、取得元なしは「取得元未設定」になる。
    const ui = loadTrustfolioUi(createDocumentMock(), {});
    expect(ui.formatNavSourceLabel(fund)).toEqual({ success: true, value: label });
  });

  it('取得元の判定に失敗した場合は resolveNavSourceKind の失敗 Result をそのまま返す', () => {
    // 前提: ラベル生成は種別の逆引きに依存し、逆引きの失敗は加工せず呼び出し側へ伝える。
    // 事前条件: navSource が未知の値 'morningstar' である。
    // 検証: formatNavSourceLabel と resolveNavSourceKind が同一の失敗 Result を返す。
    const ui = loadTrustfolioUi(createDocumentMock(), {});
    const fund = { rakutenFundId: null, navSource: 'morningstar', navSourceCode: null };
    expect(ui.formatNavSourceLabel(fund)).toEqual(ui.resolveNavSourceKind(fund));
    expect(ui.formatNavSourceLabel(fund)).toMatchObject({ success: false });
  });
});

describe('TrustfolioUi.populateNavSourceKindSelect', () => {
  it('共通定義から取得元の選択肢を生成する', () => {
    // 前提: selectは空で、取得元選択肢は実装側のラベル定義から生成される。
    // 事前条件: 実装側の NAV_SOURCE_LABELS に 3 種別（取得しない・楽天証券・Wealth Advisor）が定義されている。
    // 検証: optionのvalueと表示順が実装側の定義と一致する。
    const ui = loadTrustfolioUi(createDocumentMock(), {});
    const select = createNodeMock('select');
    ui.populateNavSourceKindSelect(select);
    expect(select.children.map((option) => option.value)).toEqual([
      'none',
      'rakuten',
      'wealthadvisor',
    ]);
    expect(select.children.map((option) => option.textContent)).toEqual([
      '取得しない',
      '楽天証券',
      'Wealth Advisor',
    ]);
  });
});

describe('TrustfolioUiの資産クラスUIファクトリ', () => {
  it('サーバー側ラベル・順序とUI側のバッジ・順位定義が一致する', () => {
    // 前提: サーバー側のASSET_CLASSESと表示ラベルを読み込み、common-scripts.htmlを評価する。
    // 検証: equity、gold、nullのラベルと順位が一致し、未知値はResultの失敗になる。
    const ui = loadTrustfolioUi(createDocumentMock(), {});
    for (const assetClass of [...ASSET_CLASSES, null] as Array<AssetClass | null>) {
      const badge = ui.createAssetClassBadge(assetClass) as { success: true; value: NodeMock };
      expect(badge.value.textContent).toBe(getAssetClassLabel(assetClass));
      const order = ui.getAssetClassOrder(assetClass) as { success: true; value: number };
      expect(order.value).toBe(
        assetClass === null ? ASSET_CLASSES.length : ASSET_CLASSES.indexOf(assetClass)
      );
    }
    expect(ui.getAssetClassOrder('bond')).toMatchObject({ success: false });
  });
  it.each([
    { assetClass: 'equity', label: '株式', colorClass: 'text-indigo-300' },
    { assetClass: 'gold', label: '金', colorClass: 'text-yellow-300' },
    { assetClass: null, label: '未設定', colorClass: 'text-amber-300' },
  ])('$assetClassを対応するラベルと色で表示する', ({ assetClass, label, colorClass }) => {
    // 前提: common-scripts.htmlを実際のノードモック環境で評価する。
    // 事前条件: assetClassは株式、金、または導入前データの未設定である。
    // 検証: 共通バッジファクトリが対応する日本語ラベルと配色を設定する。
    const ui = loadTrustfolioUi(createDocumentMock(), {});

    const result = ui.createAssetClassBadge(assetClass) as
      | { success: true; value: NodeMock }
      | { success: false; error: { type: string; message: string } };

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.textContent).toBe(label);
      expect(result.value.className).toContain(colorClass);
    }
  });

  it('定義外の資産クラスを拒否する', () => {
    // 前提: common-scripts.htmlを実際のノードモック環境で評価する。
    // 事前条件: サーバー契約に存在しないbondを指定する。
    // 検証: bondを未設定へ読み替えず、データ不整合を示す失敗結果を返す。
    const ui = loadTrustfolioUi(createDocumentMock(), {});

    expect(ui.createAssetClassBadge('bond')).toEqual({
      success: false,
      error: {
        type: 'unexpected',
        message: '未対応の資産クラスです: bond',
      },
    });
  });

  it('selectをプレースホルダーと共通の資産クラス選択肢で組み立て直す', () => {
    // 前提: selectには初期化前の古い選択肢が存在する。
    // 事前条件: populateAssetClassSelectへ既存selectを渡す。
    // 検証: 古い要素を消去し、プレースホルダー、株式、金だけを順番どおり追加する。
    const ui = loadTrustfolioUi(createDocumentMock(), {});
    const select = createNodeMock('select');
    const oldOption = createNodeMock('option');
    oldOption.value = '旧選択肢';
    select.appendChild(oldOption);

    ui.populateAssetClassSelect(select);

    expect(select.children.map((option) => option.value)).toEqual(['', 'equity', 'gold']);
    expect(select.children.map((option) => option.textContent)).toEqual([
      '選択してください',
      '株式',
      '金',
    ]);
  });
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
  it('成功時はJSON文字列を復元したレスポンスでresolveする', async () => {
    // 前提: GAS の handleApiRequestJson は Result オブジェクトを JSON 文字列にして返す。
    // 事前条件: レスポンスは銘柄の null プロパティ（assetClass / rakutenFundId）を含む。
    // 検証: callApi が JSON.parse 済みの値を返し、null が保持され、
    //       リクエストがそのまま handleApiRequestJson へ渡される。
    const response = {
      success: true,
      value: {
        funds: [
          { id: 'fund-001', name: 'eMAXIS Slim 全世界株式', assetClass: null, rakutenFundId: null },
        ],
      },
    };
    const { run, requests } = createScriptRunMock((onSuccess) =>
      onSuccess(JSON.stringify(response))
    );
    const ui = loadTrustfolioUi({}, { script: { run } });
    const request = { action: 'listFunds' };
    const result = await ui.callApi(request);
    expect(result).toEqual(response);
    expect(result.value.funds[0].assetClass).toBeNull();
    expect(requests).toEqual([request]);
  });

  it('成功ハンドラが文字列以外を受け取った場合はrejectする', async () => {
    // 前提: GAS から JSON 文字列ではなくオブジェクトが返される（handleApiRequestJson の契約違反）。
    // 事前条件: なし
    // 検証: 暗黙に resolve せず、受け取った値の型を含むエラーで reject する。
    const { run } = createScriptRunMock((onSuccess) => onSuccess({ success: true }));
    const ui = loadTrustfolioUi({}, { script: { run } });
    await expect(ui.callApi({ action: 'listFunds' })).rejects.toThrow(
      'APIレスポンスが文字列ではありません: object'
    );
  });

  it('成功ハンドラが null を受け取った場合は null と明示してrejectする', async () => {
    // 前提: GAS から null が返される（例: トランポリンが return を欠いて何も返さない場合）。
    // 事前条件: なし
    // 検証: typeof null が 'object' になって原因が隠れることなく、'null' と明示したエラーで reject する。
    const { run } = createScriptRunMock((onSuccess) => onSuccess(null));
    const ui = loadTrustfolioUi({}, { script: { run } });
    await expect(ui.callApi({ action: 'listFunds' })).rejects.toThrow(
      'APIレスポンスが文字列ではありません: null'
    );
  });

  it('成功ハンドラが不正なJSON文字列を受け取った場合はrejectする', async () => {
    // 前提: GAS から JSON として解釈できない文字列（閉じ括弧が欠けた JSON）が返される。
    // 事前条件: なし
    // 検証: JSON.parse の失敗が、文脈の分かる日本語メッセージのエラーとして reject へ伝播する。
    const { run } = createScriptRunMock((onSuccess) =>
      onSuccess('{"success": true, "value": "閉じ括弧が欠けたJSON"')
    );
    const ui = loadTrustfolioUi({}, { script: { run } });
    await expect(ui.callApi({ action: 'listFunds' })).rejects.toThrow(
      'APIレスポンスのJSON解析に失敗しました'
    );
  });

  it('失敗時はエラーでrejectする', async () => {
    // 前提: GAS の呼び出し自体が失敗し、withFailureHandler が呼ばれる。
    // 事前条件: なし
    // 検証: 失敗ハンドラへ渡されたエラーがそのまま reject へ伝播する。
    const { run } = createScriptRunMock((_onSuccess, onFailure) =>
      onFailure(new Error('通信に失敗しました。'))
    );
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
      {
        type: 'SPOT_PURCHASE',
        date: '2026-06-20',
        amount: 30000,
        units: 25000,
        navValue: 12000,
        incomeTax: null,
        residentTax: null,
      },
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
      {
        type: 'REDEMPTION',
        date: '2026-06-21',
        amount: 15000,
        units: -10000,
        navValue: 15000,
        incomeTax: null,
        residentTax: null,
      },
      BASE_OPTIONS
    );

    const header = li.children[0]?.children[0];
    expect(header?.children[1]?.className).toBe('badge-redemption');
    expect(header?.children[1]?.textContent).toBe('売却');
    const detail = li.children[0]?.children[1];
    // units=-10000 → 絶対値 10,000口
    expect(detail?.textContent).toBe('15,000円 / 10,000口 / 基準価額: 15,000円');
  });

  it('売却の税額が記録済みの場合は所得税と住民税を別々に表示する', () => {
    // 前提: 所得税と住民税が記録された売却取引がある
    // 事前条件: 両税額は0以上の数値である
    // 検証: 詳細行に「税: 所得税 X円 ／ 住民税 Y円」形式（同一明細行の金額表記と同じ N,NNN円 形式）で表示する
    const documentMock = createDocumentMock();
    const ui = loadTrustfolioUi(documentMock, {});
    const li = ui.createTransactionItem(
      {
        type: 'REDEMPTION',
        date: '2026-06-21',
        amount: 15000,
        units: 10000,
        navValue: 15000,
        incomeTax: 1532,
        residentTax: 500,
      },
      BASE_OPTIONS
    );

    expect(li.children[0]?.children[2]?.textContent).toBe('税: 所得税 1,532円 ／ 住民税 500円');
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
        incomeTax: null,
        residentTax: null,
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

describe('TrustfolioUi.registerTabDataLoader / getTabDataLoader', () => {
  it('登録したタブのデータローダーを取得して呼び出せる', () => {
    // 前提: performance タブのデータ読み込み関数を登録する
    // 事前条件: なし
    // 検証: 登録した関数がそのまま取得でき、呼び出しが実行される
    //   （window.loadPerformanceData の暗黙グローバル結合を置き換えた登録 API の契約）
    const ui = loadTrustfolioUi({}, {});
    const loader = vi.fn();

    ui.registerTabDataLoader('performance', loader);
    const retrieved = ui.getTabDataLoader('performance') as (() => void) | null;

    expect(retrieved).not.toBeNull();
    retrieved?.();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('未登録のタブは null を返す（存在チェックを呼び出し側で行える）', () => {
    // 前提: 何も登録していない状態で取得する
    // 事前条件: なし
    // 検証: null が返り、呼び出し側が「未登録」の分岐（エラーログ等）へ進める
    const ui = loadTrustfolioUi({}, {});

    expect(ui.getTabDataLoader('performance')).toBeNull();
  });

  it("継承プロパティ名（'constructor' 等）でも未登録なら null を返す", () => {
    // 前提: 'constructor' というタブ名は登録されていない
    // 事前条件: 登録表はプロトタイプなしオブジェクトで構築されている
    // 検証: Object.prototype の継承関数が誤って返らず、契約どおり null になる
    const ui = loadTrustfolioUi({}, {});

    expect(ui.getTabDataLoader('constructor')).toBeNull();
    expect(ui.getTabDataLoader('toString')).toBeNull();
  });
});

describe('TrustfolioUi.getLocalDateString', () => {
  it('今日の日付を YYYY-MM-DD 形式（ローカルタイムゾーン）で返す', () => {
    // 前提: 現在時刻を 2026-07-25 12:00（ローカル）に固定する
    // 事前条件: fake timers を使用する
    // 検証: 従来の toLocaleDateString('sv-SE') と同じ YYYY-MM-DD 形式が返る
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 25, 12, 0, 0));
    const ui = loadTrustfolioUi({}, {});

    expect(ui.getLocalDateString()).toBe('2026-07-25');
    vi.useRealTimers();
  });
});

describe('TrustfolioUi.formatShortDateTime', () => {
  it('ISO 日時を「M/D H:mm」形式（分のみゼロ埋め）へ整形する', () => {
    // 前提: 1桁の月・日・時、1桁の分を含む日時を与える
    // 事前条件: ローカルタイムゾーンで解釈される日時文字列を使用する
    // 検証: 月・日・時はゼロ埋めなし、分のみ2桁ゼロ埋め（従来の手書き整形と同一形式）
    const ui = loadTrustfolioUi({}, {});

    // ローカルタイムゾーンの 7/5 9:05 を表す Date を直接構築して ISO 文字列化する
    const local = new Date(2026, 6, 5, 9, 5, 0);
    expect(ui.formatShortDateTime(local.toISOString())).toBe('7/5 9:05');
  });
});

describe('TrustfolioUi.getPeriodCutoffDate', () => {
  it('1m / 3m / 1y の各期間で正しい起点日を返す', () => {
    // 前提: 基準日 2026-07-25 から各期間の起点日を求める
    // 事前条件: なし
    // 検証: 1ヶ月前・3ヶ月前・1年前が従来の setMonth / setFullYear 直操作と同一結果になる
    const ui = loadTrustfolioUi({}, {});
    const now = new Date(2026, 6, 25);

    expect((ui.getPeriodCutoffDate('1m', now) as Date).getTime()).toBe(
      new Date(2026, 5, 25).getTime()
    );
    expect((ui.getPeriodCutoffDate('3m', now) as Date).getTime()).toBe(
      new Date(2026, 3, 25).getTime()
    );
    expect((ui.getPeriodCutoffDate('1y', now) as Date).getTime()).toBe(
      new Date(2025, 6, 25).getTime()
    );
  });

  it('月末基準日の月またぎは JavaScript の Date 繰り上げ挙動（従来実装と同一）に従う', () => {
    // 前提: 3月31日を基準に1ヶ月前を求める（2月31日は存在しない）
    // 事前条件: なし
    // 検証: setMonth の標準挙動（2/31 → 3/3 へ繰り上げ）が従来の直接操作と同一に保たれる
    //   （closest-day 補正などの挙動変更が紛れ込んでいないことの固定）
    const ui = loadTrustfolioUi({}, {});
    const endOfMarch = new Date(2026, 2, 31);

    expect((ui.getPeriodCutoffDate('1m', endOfMarch) as Date).getTime()).toBe(
      new Date(2026, 2, 3).getTime()
    );
  });

  it('閏日基準日の1年前は JavaScript の Date 繰り上げ挙動（従来実装と同一）に従う', () => {
    // 前提: 閏日 2024-02-29 を基準に1年前を求める（2023-02-29 は存在しない）
    // 事前条件: なし
    // 検証: setFullYear の標準挙動（2023-03-01 へ繰り上げ）が従来の直接操作と同一に保たれる
    const ui = loadTrustfolioUi({}, {});
    const leapDay = new Date(2024, 1, 29);

    expect((ui.getPeriodCutoffDate('1y', leapDay) as Date).getTime()).toBe(
      new Date(2023, 2, 1).getTime()
    );
  });

  it('未知の期間種別は null を返す（呼び出し側で全件扱いにできる）', () => {
    // 前提: 'all' など期間フィルタ対象外の値を与える
    // 事前条件: なし
    // 検証: null が返り、呼び出し側がフィルタなし（全件）の分岐へ進める
    const ui = loadTrustfolioUi({}, {});

    expect(ui.getPeriodCutoffDate('all', new Date(2026, 6, 25))).toBeNull();
  });
});
