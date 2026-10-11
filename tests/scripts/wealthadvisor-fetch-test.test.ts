import { describe, expect, it } from 'vite-plus/test';
import {
  fetchNav,
  parseCodes,
  parseNavFromWealthAdvisorHtml,
} from '../../scripts/wealthadvisor-fetch-test.mjs';

describe('scripts/wealthadvisor-fetch-test', () => {
  it('実ページ相当のHTMLから基準価額を抽出する', () => {
    // 前提: 基準価額の後に最初のptdateと評価基準日のptdateが並ぶ。
    // 事前条件: 基準価額は26,093円である。
    // 検証: 最初のptdateを使用した日付と数値化した基準価額を返す。
    const html = `
      <th>基準価額</th>
      <td><span class="fprice">26,093</span>円</td>
      <span class="ptdate">2026年09月01日</span>
      <span class="ptdate">評価基準日 2026年07月31日</span>
    `;
    expect(parseNavFromWealthAdvisorHtml(html)).toEqual({
      date: '2026-09-01',
      value: 26093,
    });
  });

  it('実URL体系で取得して成功結果を返す', async () => {
    // 前提: fetchが200レスポンスと解析可能なHTMLを返す。
    // 事前条件: 取得元コードはsbi_am/sa_202306080Aである。
    // 検証: URLがWealth Advisorの規定体系で組み立てられ、successがtrueになる。
    let requestedUrl = '';
    const fetchFn = (url: string): Promise<{ status: number; text: () => Promise<string> }> => {
      requestedUrl = url;
      return Promise.resolve({
        status: 200,
        text: () =>
          Promise.resolve(`
            <th>基準価額</th>
            <span class="fprice">26,093</span>円
            <span class="ptdate">2026年09月01日</span>
          `),
      });
    };
    const result = await fetchNav('sbi_am/sa_202306080A', fetchFn);
    expect(requestedUrl).toBe(
      'https://apl.wealthadvisor.jp/webasp/sbi_am/pc/basic/sa_202306080A.html'
    );
    expect(result.success).toBe(true);
  });

  it('thに属性が付いたHTMLでも基準価額を抽出する', () => {
    // 前提: thとspanに追加属性があり、class値は仕様どおり厳密に一致する。
    // 事前条件: 基準価額日付は解析ウィンドウ内にある。
    // 検証: GASサービス版と同じ属性許容パーサーで抽出できる。
    const html = `
      <title>基準価額一覧</title>
      <th class="price-heading">基準価額</th>
      <span data-kind="nav" class="fprice">26,093</span>円
      <span data-kind="date" class="ptdate">2026年09月01日</span>
    `;
    expect(parseNavFromWealthAdvisorHtml(html)).toEqual({
      date: '2026-09-01',
      value: 26093,
    });
  });

  it('基準価額を含むthアンカーがないHTMLではnullを返す', () => {
    // 前提: 基準価額という文字はdivにあり、thアンカーが存在しない。
    // 事前条件: fpriceとptdateのspan自体は存在する。
    // 検証: GASサービス版と同様に誤った組み合わせを抽出しない。
    const html = `
      <div>基準価額</div>
      <span class="fprice">26,093</span>円
      <span class="ptdate">2026年09月01日</span>
    `;
    expect(parseNavFromWealthAdvisorHtml(html)).toBeNull();
  });

  it('評価基準日の日付spanが解析ウィンドウ外の場合はnullを返す', () => {
    // 前提: 基準価額日付がなく、評価基準日ラベルがspan外にある変形HTMLである。
    // 事前条件: 評価基準日のspanは基準価額thから2000文字より後ろにある。
    // 検証: 評価基準日を基準価額日として抽出しない。
    const html = `
      <th>基準価額</th>
      <span class="fprice">26,093</span>円
      <div>評価基準日</div>${'x'.repeat(2100)}
      <span class="ptdate">2026年07月31日</span>
    `;
    expect(parseNavFromWealthAdvisorHtml(html)).toBeNull();
  });

  it('NAV日付が欠落した場合はウィンドウ内の評価基準日を抽出しない', () => {
    // 前提: NAV日付のptdateがなく、評価基準日ラベルの後ろに日付だけのptdateが存在する。
    // 事前条件: 評価基準日のラベルと日付は解析ウィンドウ内にある。
    // 検証: GASサービス版と同様に評価基準日領域を除外してnullを返す。
    const html = `
      <th>基準価額</th>
      <span class="fprice">26,093</span>円
      <div>評価基準日</div>
      <span class="ptdate">2026年07月31日</span>
    `;
    expect(parseNavFromWealthAdvisorHtml(html)).toBeNull();
  });

  it('業務上限と同じ100,000,000円の基準価額を受理する', () => {
    // 前提: 実サイト疎通用パーサーへ業務上限と同じ基準価額が渡される。
    // 事前条件: 日付とHTML構造は正常である。
    // 検証: GASサービス版と同様に上限値を受理する。
    const html = `
      <th>基準価額</th>
      <span class="fprice">100,000,000</span>円
      <span class="ptdate">2026年09月01日</span>
    `;
    expect(parseNavFromWealthAdvisorHtml(html)).toEqual({
      date: '2026-09-01',
      value: 100_000_000,
    });
  });

  it('業務上限を1円超える100,000,001円の基準価額を拒否する', () => {
    // 前提: 実サイト疎通用パーサーへ業務上限を1円超える基準価額が渡される。
    // 事前条件: 日付とHTML構造は正常である。
    // 検証: GASサービス版と同様に上限超過値をnullとして拒否する。
    const html = `
      <th>基準価額</th>
      <span class="fprice">100,000,001</span>円
      <span class="ptdate">2026年09月01日</span>
    `;
    expect(parseNavFromWealthAdvisorHtml(html)).toBeNull();
  });

  it('HTTP 200でHTML解析に失敗した場合はサイト構造変更の可能性を返す', async () => {
    // 前提: HTTP通信は200で成功するが基準価額thが存在しない。
    // 事前条件: 通信例外とHTTPエラーは発生しない。
    // 検証: HTTP 200ではなくHTML解析失敗を示すエラーメッセージを返す。
    const fetchFn = (): Promise<{ status: number; text: () => Promise<string> }> =>
      Promise.resolve({
        status: 200,
        text: () => Promise.resolve('<html><body>メンテナンス画面</body></html>'),
      });
    const result = await fetchNav('sbi_am/sa_202306080A', fetchFn);
    expect(result.success).toBe(false);
    expect(result.error).toBe('HTML解析失敗(サイト構造変更の可能性)');
  });

  it('不正な取得元コードでは通信せずvalidation相当の失敗結果を返す', async () => {
    // 前提: companyとpageIdをスラッシュで区切っていない取得元コードである。
    // 事前条件: fetch関数は呼ばれた場合に検知できる。
    // 検証: URL・HTTP状態・NAVを持たず、形式不正を示す全フィールドを返す。
    let fetchCalled = false;
    const fetchFn = (): Promise<never> => {
      fetchCalled = true;
      return Promise.reject(new Error('呼び出されてはいけません。'));
    };
    const result = await fetchNav('sbi_am', fetchFn);
    expect(fetchCalled).toBe(false);
    expect(result).toEqual({
      navSourceCode: 'sbi_am',
      url: null,
      statusCode: null,
      nav: null,
      success: false,
      error: '取得元コードの形式が不正です。',
    });
  });

  it('HTTP 503ではURLとステータスを保持したHTTP失敗結果を返す', async () => {
    // 前提: Wealth Advisorが503レスポンスを返す。
    // 事前条件: 取得元コードは正常であり、HTML本文は解析しない。
    // 検証: URLと503を保持し、NAVと解析エラーを持たない失敗結果を返す。
    const fetchFn = (): Promise<{ status: number; text: () => Promise<string> }> =>
      Promise.resolve({
        status: 503,
        text: () => Promise.resolve('解析されてはいけません。'),
      });
    const result = await fetchNav('sbi_am/sa_202306080A', fetchFn);
    expect(result).toEqual({
      navSourceCode: 'sbi_am/sa_202306080A',
      url: 'https://apl.wealthadvisor.jp/webasp/sbi_am/pc/basic/sa_202306080A.html',
      statusCode: 503,
      nav: null,
      success: false,
      error: null,
    });
  });

  it('fetch例外ではURLと例外メッセージを保持した通信失敗結果を返す', async () => {
    // 前提: Wealth Advisorへのfetchが通信例外を送出する。
    // 事前条件: 取得元コードは正常である。
    // 検証: URLと例外メッセージを保持し、HTTP状態とNAVを持たない失敗結果を返す。
    const fetchFn = (): Promise<never> => Promise.reject(new Error('通信失敗'));
    const result = await fetchNav('sbi_am/sa_202306080A', fetchFn);
    expect(result).toEqual({
      navSourceCode: 'sbi_am/sa_202306080A',
      url: 'https://apl.wealthadvisor.jp/webasp/sbi_am/pc/basic/sa_202306080A.html',
      statusCode: null,
      nav: null,
      success: false,
      error: '通信失敗',
    });
  });

  it('WEALTHADVISOR_CODESの末尾カンマと連続カンマを空要素として除外する', () => {
    // 前提: 環境変数相当の文字列に末尾カンマと連続カンマが含まれる。
    // 事前条件: 有効な取得元コードの前後にも空白がある。
    // 検証: 空要素を取得対象にせず、有効なコードだけを返す。
    expect(parseCodes(' sbi_am/sa_202306080A ,,')).toEqual(['sbi_am/sa_202306080A']);
  });

  it('安全な整数範囲を超える巨大な基準価額を拒否する', () => {
    // 前提: 実サイト疎通用パーサーへ桁あふれする巨大な基準価額が渡される。
    // 事前条件: 日付とHTML構造は正常である。
    // 検証: GASサービス版と同様にnullを返す。
    const html = `
      <th>基準価額</th>
      <span class="fprice">9,007,199,254,740,993</span>円
      <span class="ptdate">2026年09月01日</span>
    `;
    expect(parseNavFromWealthAdvisorHtml(html)).toBeNull();
  });

  it('99月99日の暦外日付を拒否する', () => {
    // 前提: 実サイト疎通用パーサーへ2026年99月99日が渡される。
    // 事前条件: 基準価額とHTML構造は正常である。
    // 検証: GASサービス版と同様に存在しない月日をnullとして拒否する。
    const html = `
      <th>基準価額</th>
      <span class="fprice">26,093</span>円
      <span class="ptdate">2026年99月99日</span>
    `;
    expect(parseNavFromWealthAdvisorHtml(html)).toBeNull();
  });

  it('2月30日の暦外日付を拒否する', () => {
    // 前提: 実サイト疎通用パーサーへ2026年2月30日が渡される。
    // 事前条件: 基準価額とHTML構造は正常である。
    // 検証: GASサービス版と同様にDateで繰り上がる暦外日をnullとして拒否する。
    const html = `
      <th>基準価額</th>
      <span class="fprice">26,093</span>円
      <span class="ptdate">2026年02月30日</span>
    `;
    expect(parseNavFromWealthAdvisorHtml(html)).toBeNull();
  });
});
