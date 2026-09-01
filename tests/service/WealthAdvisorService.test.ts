import { describe, expect, it, vi } from 'vitest';
import {
  createWealthAdvisorService,
  fetchWealthAdvisorQuote,
} from '../../src/service/WealthAdvisorService';

const 実HTML断片 = `
  <table class="tpdt mb30">
    <tbody>
      <tr>
        <th>基準価額</th>
        <th>前日比</th>
      </tr>
      <tr>
        <td><span class="fprice">26,093</span>円</td>
        <td><div class="fprice minus">-36<span class="fss">円</span></div></td>
      </tr>
      <tr>
        <td><span class="ptdate">2026年09月01日</span></td>
        <td><span class="ptdate">評価基準日 2026年07月31日</span></td>
      </tr>
    </tbody>
  </table>
`;

describe('WealthAdvisorService', () => {
  it('実HTML断片から基準価額と日付を抽出する', () => {
    // 前提: Wealth Advisorの実ページと同じ基準価額テーブル構造である。
    // 事前条件: 基準価額は26,093円、最初のptdateは2026年09月01日である。
    // 検証: 円/1万口の値とYYYY-MM-DD形式の日付が返る。
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => 実HTML断片,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav).toEqual({ date: '2026-09-01', value: 26093 });
    }
    fetchMock.mockRestore();
  });

  it('公開メソッドは取得元コードを一度正規化して通信結果にも保持する', () => {
    // 前提: Wealth Advisor取得元コードの前後に入力由来の空白がある。
    // 事前条件: 正規化後のコードに対応する実ページ相当HTMLを返す。
    // 検証: URLと成功結果の取得元コードの両方にtrim済みの値を使用する。
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => 実HTML断片,
    });
    const result = createWealthAdvisorService().fetchLatestNav(' sbi_am/sa_202306080A ');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://apl.wealthadvisor.jp/webasp/sbi_am/pc/basic/sa_202306080A.html',
      expect.any(Object)
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.navSourceCode).toBe('sbi_am/sa_202306080A');
    }
    fetchMock.mockRestore();
  });

  it('評価基準日ではなく最初のptdateを基準価額の日付として抽出する', () => {
    // 前提: 基準価額の日付より後ろに「評価基準日」のptdateが存在する。
    // 事前条件: 評価基準日は2026年07月31日である。
    // 検証: 抽出日付は評価基準日ではなく2026年09月01日になる。
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => 実HTML断片,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav?.date).toBe('2026-09-01');
    }
    fetchMock.mockRestore();
  });

  it('取得元コード形式が不正な場合は通信前にvalidationエラーになる', () => {
    // 前提: companyとpageIdをスラッシュで区切っていない。
    // 事前条件: 外部通信は実行しない。
    // 検証: navSourceCodeフィールドのvalidationエラーが返る。
    const result = fetchWealthAdvisorQuote('sbi_am');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
      expect(result.error.field).toBe('navSourceCode');
    }
  });

  it('HTTPステータスが200以外の場合はunexpectedエラーになる', () => {
    // 前提: Wealth Advisorが503レスポンスを返す。
    // 事前条件: getContentTextは呼び出された場合を検出できるスパイである。
    // 検証: HTTPエラーをNAV成功として扱わず、HTMLを解析せずにunexpectedエラーを返す。
    const getContentText = vi.fn(() => 実HTML断片);
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 503,
      getContentText,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
    }
    expect(getContentText).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('通信例外が発生した場合はunexpectedエラーになる', () => {
    // 前提: UrlFetchApp.fetchが通信例外を送出する。
    // 事前条件: 取得元コードは正しい形式である。
    // 検証: 腐敗防止層が例外を捕捉してunexpectedエラーを返す。
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockImplementation(() => {
      throw new Error('通信失敗');
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
    }
    fetchMock.mockRestore();
  });

  it('NAVを抽出できないHTMLの場合はunexpectedエラーになる', () => {
    // 前提: HTTP通信は成功するが基準価額テーブルが存在しない。
    // 事前条件: Wealth Advisorサービスの公開メソッドを使用する。
    // 検証: NAV抽出不能を成功扱いせずunexpectedエラーを返す。
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => '<html><body>基準価額なし</body></html>',
    });
    const result = createWealthAdvisorService().fetchLatestNav('sbi_am/sa_202306080A');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
    }
    fetchMock.mockRestore();
  });

  it('thとspanに属性が付いたHTMLから基準価額を抽出する', () => {
    // 前提: 基準価額見出しと対象spanには実サイトが追加しうる属性が付いている。
    // 事前条件: class値はfpriceとptdateに厳密に一致する。
    // 検証: タグ属性の有無に依存せず基準価額と日付を抽出する。
    const html = `
      <title>基準価額一覧</title>
      <th class="price-heading" scope="col">基準価額</th>
      <td><span data-kind="nav" class="fprice" aria-label="基準価額">26,093</span>円</td>
      <td><span data-kind="date" class="ptdate">2026年09月01日</span></td>
    `;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav).toEqual({ date: '2026-09-01', value: 26093 });
    }
    fetchMock.mockRestore();
  });

  it('基準価額を含むthアンカーがないHTMLではNAVを抽出しない', () => {
    // 前提: 本文には基準価額という文字と解析可能なspanがあるが、文字はthの外にある。
    // 事前条件: HTTPステータスは200である。
    // 検証: 誤った位置をアンカーにせず、quote結果のnavはnullになる。
    const html = `
      <div>基準価額</div>
      <span class="fprice">26,093</span>円
      <span class="ptdate">2026年09月01日</span>
    `;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav).toBeNull();
    }
    fetchMock.mockRestore();
  });

  it('評価基準日ラベルがspan外にある変形HTMLの日付をウィンドウ外では拾わない', () => {
    // 前提: 基準価額の日付がなく、評価基準日ラベルと日付spanだけが存在する変形HTMLである。
    // 事前条件: 評価基準日のspanは基準価額thから2000文字の解析ウィンドウ外にある。
    // 検証: 評価基準日を基準価額日として誤抽出せずnavはnullになる。
    const html = `
      <th>基準価額</th>
      <span class="fprice">26,093</span>円
      <div>評価基準日</div>${'x'.repeat(2100)}
      <span class="ptdate">2026年07月31日</span>
    `;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav).toBeNull();
    }
    fetchMock.mockRestore();
  });

  it('NAV日付が欠落した場合はウィンドウ内の評価基準日を抽出しない', () => {
    // 前提: NAV日付のptdateがなく、評価基準日ラベルの後ろに日付だけのptdateが存在する。
    // 事前条件: 評価基準日のラベルと日付は基準価額thから2000文字以内にある。
    // 検証: 評価基準日領域を明示的に除外し、NAV日付として誤抽出せずnullを返す。
    const html = `
      <th>基準価額</th>
      <span class="fprice">26,093</span>円
      <div>評価基準日</div>
      <span class="ptdate">2026年07月31日</span>
    `;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav).toBeNull();
    }
    fetchMock.mockRestore();
  });

  it('業務上限と同じ100,000,000円の基準価額を受理する', () => {
    // 前提: 外部HTMLの基準価額が業務上限とちょうど同じ100,000,000円である。
    // 事前条件: 日付とHTML構造は正常である。
    // 検証: 上限値を範囲内として基準価額データへ変換する。
    const html = `
      <th>基準価額</th>
      <span class="fprice">100,000,000</span>円
      <span class="ptdate">2026年09月01日</span>
    `;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav).toEqual({ date: '2026-09-01', value: 100_000_000 });
    }
    fetchMock.mockRestore();
  });

  it('業務上限を1円超える100,000,001円の基準価額を拒否する', () => {
    // 前提: 外部HTMLの基準価額が業務上限を1円超えている。
    // 事前条件: 日付とHTML構造は正常である。
    // 検証: 上限超過値を採用せずnavはnullになる。
    const html = `
      <th>基準価額</th>
      <span class="fprice">100,000,001</span>円
      <span class="ptdate">2026年09月01日</span>
    `;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav).toBeNull();
    }
    fetchMock.mockRestore();
  });

  it('安全な整数範囲を超える巨大な基準価額を拒否する', () => {
    // 前提: 外部HTMLの基準価額セルにJavaScriptの安全な整数範囲を超える値が含まれる。
    // 事前条件: 日付とHTML構造は正常である。
    // 検証: 桁あふれ値を基準価額として採用せずnavはnullになる。
    const html = `
      <th>基準価額</th>
      <span class="fprice">9,007,199,254,740,993</span>円
      <span class="ptdate">2026年09月01日</span>
    `;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav).toBeNull();
    }
    fetchMock.mockRestore();
  });

  it('99月99日の暦外日付を拒否する', () => {
    // 前提: 外部HTMLの日付セルが2026年99月99日になっている。
    // 事前条件: 基準価額は業務範囲内でHTML構造も正常である。
    // 検証: 存在しない月日を基準価額日として採用せずnavはnullになる。
    const html = `
      <th>基準価額</th>
      <span class="fprice">26,093</span>円
      <span class="ptdate">2026年99月99日</span>
    `;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav).toBeNull();
    }
    fetchMock.mockRestore();
  });

  it('2月30日の暦外日付を拒否する', () => {
    // 前提: 外部HTMLの日付セルがDateで翌月へ繰り上がる2026年2月30日になっている。
    // 事前条件: 基準価額は業務範囲内でHTML構造も正常である。
    // 検証: round-tripで年月日が一致しない日付を拒否しnavはnullになる。
    const html = `
      <th>基準価額</th>
      <span class="fprice">26,093</span>円
      <span class="ptdate">2026年02月30日</span>
    `;
    const fetchMock = vi.spyOn(globalThis.UrlFetchApp, 'fetch').mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => html,
    });
    const result = fetchWealthAdvisorQuote('sbi_am/sa_202306080A');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.nav).toBeNull();
    }
    fetchMock.mockRestore();
  });
});
