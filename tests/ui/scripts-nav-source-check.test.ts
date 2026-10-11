import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const pageUrl = 'https://apl.wealthadvisor.jp/webasp/sbi_am/pc/basic/sa_202306080A.html';
const quoteResponse = {
  success: true,
  value: { url: pageUrl, statusCode: 200, nav: { value: 26093, date: '2026-09-01' } },
};

// 不変の実ソースはファイル全体で一度だけ読み込み、必要な断片を抽出する。
// 抽出失敗は配線の変更として即座に検知し、別の実装へ切り替えない。
const source = fs.readFileSync(path.join(process.cwd(), 'src/ui/scripts.html'), 'utf8');
const inputListener = source.match(
  /fundNavSourceCodeInput\.addEventListener\('input', \(\) => \{([\s\S]*?)\n {8}\}\);/
)?.[1];
const messageInitialization = source.match(
  /const setNavSourceCodeCheckMessage = window\.TrustfolioUi\.createSetMessage\([\s\S]*?\n {4}\);/
)?.[0];
const commonSource = fs.readFileSync(
  path.join(process.cwd(), 'src/ui/common-scripts.html'),
  'utf8'
);
const createSetMessageSource = commonSource.match(
  /function createSetMessage\(messageElement, options = \{\}\) \{[\s\S]*?\n {4}\}/
)?.[0];
if (!inputListener || !messageInitialization || !createSetMessageSource) {
  throw new Error('入力リスナー・確認結果の初期化・共通の表示関数を抽出できませんでした。');
}
const listener = source.match(
  /fundNavSourceCodeCheckButton\.addEventListener\('click', async \(\) => \{([\s\S]*?)\n {8}\}\);/
)?.[1];
const timestamp = source.match(/let lastNavSourceCodeCheckStartedAt = 0;/)?.[0];
const minInterval = source.match(/const NAV_SOURCE_CODE_CHECK_MIN_INTERVAL_MS = \d+;/)?.[0];
const inFlight = source.match(/let isNavSourceCodeCheckInFlight = false;/)?.[0];
const applyKind = source.match(/function applyNavSourceKindToForm\(\) \{[\s\S]*?\n {4}\}/)?.[0];
if (!listener || !timestamp || !minInterval || !inFlight || !applyKind) {
  throw new Error(
    '取得元コード確認のリスナー・開始時刻・最小実行間隔・飛行中フラグ・種別適用関数を抽出できませんでした。'
  );
}

// コードのコンパイルは一度だけ行い、各テストの独立したスタブと状態を引数で注入する。
// 両方の関数は同一の表示スタブを参照し、呼び出し履歴と表示状態の観測対象を一致させる。
const createCheckHandlers = new Function(
  'window',
  'fundNavSourceCodeInput',
  'fundNavSourceCodeCheckButton',
  'fundNavSourceKindSelect',
  'navSourceInputGroups',
  'setFieldGroupActive',
  'setNavSourceCodeCheckMessage',
  'Date',
  `${timestamp}\n${minInterval}\n${inFlight}\n${applyKind}\nreturn {
    handler: async () => {${listener}\n},
    applyNavSourceKindToForm,
  };`
);

/**
 * 各テスト専用のDOM・通信・表示・時刻のスタブを生成し、コンパイル済みのファクトリへ渡す。
 * 前回開始時刻と飛行中フラグは生成された関数内で保持し、他のテストと状態を共有しない。
 * 表示スタブは本文・属性・表示状態を再現し、共有ファクトリ自体の動作は共通UIテストで検証する。
 * @param response - 通信スタブが返す確認結果。省略時は基準価額の取得成功結果。
 * @returns 入力・結果表示・通信の観測対象と、確認処理・種別切替・時刻操作の関数。
 */
function createCheckEnvironment(response: unknown = quoteResponse) {
  const input = { value: ' sbi_am/sa_202306080A ' };
  const button = { disabled: false };
  const attributes = new Map<string, string>();
  const classes = new Set(['hidden']);
  const result = {
    textContent: '',
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    classList: {
      toggle: (name: string, force: boolean) => {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
  };
  let now = 10000;
  const callApi = vi.fn(async (): Promise<unknown> => response);
  const formatCurrency = vi.fn(() => '26,093円');
  const kindSelect = { value: 'wealth_advisor' };
  const setFieldGroupActive = vi.fn();
  const setNavSourceCodeCheckMessage = vi.fn((text: string, stateValue: string | null) => {
    result.textContent = text;
    if (stateValue) result.setAttribute('data-state', stateValue);
    else result.removeAttribute('data-state');
    result.classList.toggle('hidden', !text);
  });
  const { handler, applyNavSourceKindToForm } = createCheckHandlers(
    { TrustfolioUi: { callApi, formatCurrency, NAV_SOURCE_KINDS: { NONE: 'none' } } },
    input,
    button,
    kindSelect,
    [{ kind: 'wealth_advisor', field: {}, input }],
    setFieldGroupActive,
    setNavSourceCodeCheckMessage,
    { now: () => now }
  ) as { handler: () => Promise<void>; applyNavSourceKindToForm: () => void };
  return {
    input,
    button,
    result,
    attributes,
    classes,
    callApi,
    formatCurrency,
    handler,
    kindSelect,
    applyNavSourceKindToForm,
    setNavSourceCodeCheckMessage,
    advanceTime: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('取得元コードの確認ボタン', () => {
  it('確認成功後の編集ではchangeを待たずにinputで結果を消去する', async () => {
    // 前提: sbi_am/sa_202306080Aの確認が完了し、成功結果が表示されている。
    // 事前条件: 別のコードへ編集し、changeを発火させず実ソースのinputリスナーだけを実行する。
    // 検証: 本文・data-stateを消去し、結果を非表示にする。
    const env = createCheckEnvironment();
    await env.handler();
    expect(env.result.textContent).not.toBe('');
    expect(env.attributes.get('data-state')).toBe('success');
    expect(env.classes.has('hidden')).toBe(false);

    env.setNavSourceCodeCheckMessage.mockClear();
    env.input.value = 'sbi_am/sa_202401010X';
    const handleInput = new Function('setNavSourceCodeCheckMessage', inputListener);
    handleInput(env.setNavSourceCodeCheckMessage);

    expect(env.setNavSourceCodeCheckMessage).toHaveBeenCalledExactlyOnceWith('', null);
    expect(env.result.textContent).toBe('');
    expect(env.attributes.has('data-state')).toBe(false);
    expect(env.classes.has('hidden')).toBe(true);
  });

  it('実際の確認結果初期化では成功表示が10秒後も残る', () => {
    // 前提: scripts.htmlの初期化コードとcommon-scripts.htmlの表示関数を組み合わせる。
    // 事前条件: 共通UIテストと同じ仮想タイマーを注入し、基準価額の取得成功を表示する。
    // 検証: 初期化引数で自動消去が無効になり、10秒後も本文・data-state・表示状態を保持する。
    vi.useFakeTimers();
    const env = createCheckEnvironment();
    const messageElement = Object.assign(env.result, {
      getAttribute: (name: string) => env.attributes.get(name) ?? null,
    });
    Object.assign(messageElement.classList, {
      add: (name: string) => env.classes.add(name),
      remove: (name: string) => env.classes.delete(name),
    });
    const createSetMessage = new Function(
      'setTimeout',
      'clearTimeout',
      `${createSetMessageSource}\nreturn createSetMessage;`
    )(globalThis.setTimeout, globalThis.clearTimeout);
    const setMessage = new Function(
      'window',
      'fundNavSourceCodeCheckResult',
      `${messageInitialization}\nreturn setNavSourceCodeCheckMessage;`
    )({ TrustfolioUi: { createSetMessage } }, messageElement);
    const message = `基準価額 26,093円（2026-09-01）を取得しました。URL: ${pageUrl}`;

    setMessage(message, 'success');
    expect(messageElement.textContent).toBe(message);
    expect(env.attributes.get('data-state')).toBe('success');
    expect(env.classes.has('hidden')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(messageElement.textContent).toBe(message);
    expect(env.attributes.get('data-state')).toBe('success');
    expect(env.classes.has('hidden')).toBe(false);
  });

  it.each(['wealth_advisor', 'none'])(
    '取得元種別の適用時に直前の確認結果を消去する: %s',
    async (kind) => {
      // 前提: ＳＢＩ・iシェアーズ・ゴールドファンドの確認成功結果が表示されている。
      // 事前条件: Wealth Advisorへの切替、または登録成功後のnoneへのリセットを行う。
      // 検証: 消去関数を空文字とnullで呼び、本文・配色を消去して結果を非表示にする。
      const env = createCheckEnvironment();
      await env.handler();
      expect(env.classes.has('hidden')).toBe(false);
      expect(env.attributes.get('data-state')).toBe('success');

      // 確認処理も同じ表示スタブを使うため、種別適用による呼び出しだけを検証する。
      env.setNavSourceCodeCheckMessage.mockClear();
      env.kindSelect.value = kind;
      env.applyNavSourceKindToForm();

      expect(env.setNavSourceCodeCheckMessage).toHaveBeenCalledExactlyOnceWith('', null);
      expect(env.result.textContent).toBe('');
      expect(env.attributes.has('data-state')).toBe(false);
      expect(env.classes.has('hidden')).toBe(true);
    }
  );

  it('空白のみの入力では通信しない', async () => {
    // 前提: 入力は必須である。事前条件: 空白のみを入力する。
    // 検証: 通信せず、入力を促すエラーを表示する。
    const env = createCheckEnvironment();
    env.input.value = '  ';
    await env.handler();
    expect(env.callApi).not.toHaveBeenCalled();
    expect(env.result.textContent).toBe('取得元コードを入力してください。');
    expect(env.attributes.get('data-state')).toBe('error');
    expect(env.classes.has('hidden')).toBe(false);
  });

  it('前回開始から4999msでは拒否し、5000msでは再実行する', async () => {
    // 前提: 過剰アクセスを防ぐため開始間隔は5秒以上である。
    // 事前条件: 同じリスナーを境界時刻の前後で実行する。
    // 検証: 拒否したクリックでは前回開始時刻を更新せず、境界時刻で通信する。
    const env = createCheckEnvironment();
    await env.handler();
    env.advanceTime(4999);
    await env.handler();
    expect(env.callApi).toHaveBeenCalledTimes(1);
    expect(env.result.textContent).toBe('確認の実行間隔は5秒以上あけてください。');
    expect(env.attributes.get('data-state')).toBe('error');
    env.advanceTime(1);
    await env.handler();
    expect(env.callApi).toHaveBeenCalledTimes(2);
  });

  it('確認中はボタンが再び有効になっても通信を追加しない', async () => {
    // 前提: ＳＢＩ・iシェアーズ・ゴールドファンド（為替ヘッジなし）の確認応答を待っている。
    // 事前条件: 開始から5秒後に他の画面処理がボタンを再有効化し、利用者が再度クリックする。
    // 検証: 飛行中は追加通信せず待機を促し、完了後は再実行できる。
    const env = createCheckEnvironment();
    let resolveResponse!: (response: unknown) => void;
    env.callApi.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve;
        })
    );
    const pending = env.handler();
    env.advanceTime(5000);
    env.button.disabled = false;
    await env.handler();
    expect(env.callApi).toHaveBeenCalledTimes(1);
    expect(env.result.textContent).toBe('確認中です。完了までお待ちください。');
    expect(env.attributes.get('data-state')).toBe('error');
    resolveResponse(quoteResponse);
    await pending;
    await env.handler();
    expect(env.callApi).toHaveBeenCalledTimes(2);
  });

  it.each([
    { name: '成功応答', response: quoteResponse, error: null },
    {
      name: '基準価額を抽出できない応答',
      response: { success: true, value: { url: pageUrl, statusCode: 200, nav: null } },
      error: null,
    },
    {
      name: '失敗応答',
      response: {
        success: false,
        error: { message: 'Wealth Advisorへのアクセスに失敗しました。' },
      },
      error: null,
    },
    { name: '通信例外', response: null, error: new Error('サーバーへの接続に失敗しました。') },
  ])('入力変更後は古い結果を表示しない: $name', async ({ response, error }) => {
    // 前提: sbi_am/sa_202306080Aの確認処理が応答を待っている。
    // 事前条件: 利用者が別のコードへ変更し、change時の結果消去後に応答または例外が到着する。
    // 検証: 本文・配色・非表示状態を保ち、確認完了後は変更後のコードで再実行できる。
    const env = createCheckEnvironment();
    let resolveResponse!: (response: unknown) => void;
    let rejectResponse!: (error: Error) => void;
    env.callApi.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          resolveResponse = resolve;
          rejectResponse = reject;
        })
    );
    const pending = env.handler();
    env.input.value = 'sbi_am/sa_202401010X';
    env.setNavSourceCodeCheckMessage('', null);
    if (error) rejectResponse(error);
    else resolveResponse(response);
    await pending;
    expect(env.result.textContent).toBe('');
    expect(env.attributes.has('data-state')).toBe(false);
    expect(env.classes.has('hidden')).toBe(true);
    expect(env.formatCurrency).not.toHaveBeenCalled();
    expect(env.button.disabled).toBe(false);
    env.advanceTime(5000);
    await env.handler();
    expect(env.callApi).toHaveBeenCalledTimes(2);
    expect(env.callApi).toHaveBeenLastCalledWith({
      action: 'checkWealthAdvisorNavSource',
      navSourceCode: 'sbi_am/sa_202401010X',
    });
  });

  it.each([
    { name: '成功応答', error: null },
    { name: '通信例外', error: new Error('サーバーへの接続に失敗しました。') },
  ])('change発火前の入力変更でも確認中の表示を消去する: $name', async ({ error }) => {
    // 前提: sbi_am/sa_202306080Aの確認処理が応答を待ち、「確認中...」を表示している。
    // 事前条件: 利用者が入力値だけを変更し、changeによる消去を行わずに応答または例外が到着する。
    // 検証: 通信完了時に本文・配色を消去して結果を非表示にし、確認ボタンを再び有効にする。
    const env = createCheckEnvironment();
    let resolveResponse!: (response: unknown) => void;
    let rejectResponse!: (error: Error) => void;
    env.callApi.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          resolveResponse = resolve;
          rejectResponse = reject;
        })
    );
    const pending = env.handler();
    env.input.value = 'sbi_am/sa_202401010X';
    expect(env.result.textContent).toBe('確認中...');
    expect(env.classes.has('hidden')).toBe(false);
    if (error) rejectResponse(error);
    else resolveResponse(quoteResponse);
    await pending;
    expect(env.result.textContent).toBe('');
    expect(env.attributes.has('data-state')).toBe(false);
    expect(env.classes.has('hidden')).toBe(true);
    expect(env.formatCurrency).not.toHaveBeenCalled();
    expect(env.button.disabled).toBe(false);
  });

  it.each([
    {
      response: quoteResponse,
      state: 'success',
      message: `基準価額 26,093円（2026-09-01）を取得しました。URL: ${pageUrl}`,
    },
    {
      response: { success: true, value: { url: pageUrl, statusCode: 200, nav: null } },
      state: 'error',
      message: `ページは取得できましたが（HTTP 200）、基準価額を抽出できませんでした。URL: ${pageUrl}`,
    },
    {
      response: {
        success: false,
        error: { message: 'Wealth Advisorへのアクセスに失敗しました。' },
      },
      state: 'error',
      message: 'Wealth Advisorへのアクセスに失敗しました。',
    },
  ])('結果の3状態を区別して表示する: $message', async ({ response, state, message }) => {
    // 前提: ＳＢＩ・iシェアーズ・ゴールドファンドのコードを確認する。
    // 事前条件: 成功・抽出不可・取得失敗の各応答を返す。
    // 検証: trim済みコードを送り、結果に応じた文言と配色を表示する。
    const env = createCheckEnvironment(response);
    const pending = env.handler();
    expect(env.button.disabled).toBe(true);
    expect(env.result.textContent).toBe('確認中...');
    expect(env.attributes.has('data-state')).toBe(false);
    await pending;
    expect(env.callApi).toHaveBeenCalledWith({
      action: 'checkWealthAdvisorNavSource',
      navSourceCode: 'sbi_am/sa_202306080A',
    });
    expect(env.result.textContent).toBe(message);
    expect(env.attributes.get('data-state')).toBe(state);
    expect(env.classes.has('hidden')).toBe(false);
    expect(env.button.disabled).toBe(false);
    if (state === 'success') expect(env.formatCurrency).toHaveBeenCalledWith(26093);
    else expect(env.formatCurrency).not.toHaveBeenCalled();
  });

  it('通信例外を表示し、確認ボタンを再び有効にする', async () => {
    // 前提: callApiは通信例外でrejectする。事前条件: 通信失敗を発生させる。
    // 検証: 例外メッセージが表示され、finallyでdisabledが解除される。
    const env = createCheckEnvironment();
    env.callApi.mockRejectedValueOnce(new Error('サーバーへの接続に失敗しました。'));
    await env.handler();
    expect(env.result.textContent).toBe('サーバーへの接続に失敗しました。');
    expect(env.attributes.get('data-state')).toBe('error');
    expect(env.button.disabled).toBe(false);
  });
});
