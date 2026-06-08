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
