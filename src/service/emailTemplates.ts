import { getAssetClassLabel } from '../domain/assetClassLabel';
import type {
  AssetClassSummary,
  HoldingWithWeekOverWeek,
  WeekOverWeekChange,
} from '../domain/types';
import type { MarketIndexAlertResult, MarketIndexChange } from '../usecase/MarketIndexAlertUseCase';
import type { WeeklyReport } from '../usecase/WeeklyReportUseCase';

/**
 * メール本文の HTML テンプレート群。
 *
 * 背景・目的:
 * - EmailService.ts（617行）に文字列直書きで同居していた3種類のメール本文
 *   （週次レポート・エラー通知・-5%ルールアラート）の生成を、送信ロジックから
 *   分離して本モジュールへ集約する（H5 #151）。
 * - EmailService は「検証・件名生成・送信・ログ」に、本モジュールは「本文 HTML の生成」に
 *   責務を限定する。
 *
 * 重要な制約（出力バイト列不変。適用範囲に注意）:
 * - この制約は **H5 #151 の「EmailService.ts からの分離」作業自体**に課されたものである。
 *   分離の前後で本モジュールが生成する HTML 文字列を**1バイトも変えない**こと
 *   （G 計画 #116 で「外枠統一は出力が変わるため除外」とされた経緯を踏襲し、
 *   H5 は置き場所の分離と同一文字列を生成する重複の集約に限定する）。
 * - この不変性は tests/service/EmailService.snapshot.test.ts のインラインスナップショット
 *   （公開 API 経由で捕捉した htmlBody 全文）で機械的に保証される。スナップショットの
 *   期待値を変更した時点で挙動変更を疑うこと。
 * - ただし、**意図的な機能追加・表示変更まで禁止するものではない**。その場合は
 *   スナップショットを実出力から意図的に更新し、差分が意図した変更のみであることを
 *   確認する（例: #185 で保有銘柄一覧に「前週比（損益率）」列を追加）。
 */

/**
 * HTMLメールのテーブルセルで繰り返し用いるインラインスタイル定数。
 *
 * 目的:
 * - 各メール本文に大量に重複していた `padding: ...; border: 1px solid #ddd; ...`
 *   というスタイル文字列を一元化する。
 *
 * 注意:
 * - 各値は元の文字列と完全に一致させており、`${STYLE.x} color: ...;` のように
 *   末尾へ追記する形でも、既存のHTML出力が1バイトも変わらないようにしている。
 */
const STYLE = {
  /** 8px パディングの通常セル。 */
  td: 'padding: 8px; border: 1px solid #ddd;',
  /** 8px パディングの右寄せセル。 */
  tdRight: 'padding: 8px; border: 1px solid #ddd; text-align: right;',
  /** 12px パディングの通常セル。 */
  cell: 'padding: 12px; border: 1px solid #ddd;',
  /** 12px パディングの左寄せセル（テーブル見出し用）。 */
  cellLeft: 'padding: 12px; border: 1px solid #ddd; text-align: left;',
  /** 12px パディングの右寄せセル（テーブル見出し・数値セル用）。 */
  cellRight: 'padding: 12px; border: 1px solid #ddd; text-align: right;',
} as const;

/**
 * 週次レポート・市場指数アラートで共通のHTML外枠（html/head/body）でラップする。
 *
 * 目的:
 * - 2種類のメールで完全に一致していた外枠テンプレートを一本化する。
 *
 * 注意:
 * - エラー通知メール（{@link generateErrorNotificationEmailBody}）は歴史的にインデントが
 *   異なり、この関数を使うと出力バイト列が変わってしまうため、あえて本関数を共有しない。
 *
 * @param innerHtml - `<body>` 直下に挿入する本文HTML。先頭に改行とインデントを含む。
 * @returns 外枠で包んだ完全なHTML文字列。
 */
function wrapEmailBody(innerHtml: string): string {
  return `
    <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 20px;">${innerHtml}
      </body>
    </html>
  `;
}

/**
 * 数値を3桁区切りの文字列に変換する。
 *
 * 週次レポートの本文生成に加え、EmailService の件名生成（損益額の表示）でも使用するため
 * export している。
 *
 * @param value - 数値
 * @returns フォーマット済み文字列
 */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('ja-JP');
}

/**
 * 損益率をパーセント表記の文字列に変換する。
 *
 * @param rate - 損益率（小数、例: 0.15 = 15%）
 * @returns パーセント表記の文字列（例: "+15.0%"）
 */
function formatRate(rate: number): string {
  const percentage = rate * 100;
  const sign = percentage >= 0 ? '+' : '';
  return `${sign}${percentage.toFixed(1)}%`;
}

/**
 * 前週比の差分を符号付きの文字列に変換する。
 *
 * @param difference - 差分（円単位）
 * @returns フォーマット済み文字列（例: "+10,000円"、"-5,000円"）
 */
function formatDifference(difference: number): string {
  const sign = difference >= 0 ? '+' : '';
  return `${sign}${formatNumber(difference)}円`;
}

/**
 * 前週比の変化率を符号付きの文字列に変換する。
 *
 * @param changeRate - 変化率（%単位、例: 5.2 = +5.2%）
 * @returns フォーマット済み文字列（例: "+5.2%"、"-3.1%"）
 */
function formatChangeRate(changeRate: number): string {
  const sign = changeRate >= 0 ? '+' : '';
  return `${sign}${changeRate.toFixed(1)}%`;
}

/**
 * 前週比の差分と変化率を1つの文字列にフォーマットする。
 *
 * @param change - 前週比情報
 * @returns フォーマット済み文字列（例: "+10,000円 (+5.2%)"）
 */
function formatWeekOverWeekChange(change: WeekOverWeekChange | null): string {
  if (change === null) {
    return '---';
  }
  const diffStr = formatDifference(change.difference);
  const rateStr = formatChangeRate(change.changeRate);
  return `${diffStr} (${rateStr})`;
}

/**
 * 損益率の前週比（%ポイント）を符号付きの文字列に変換する。
 *
 * @param changeInPercentagePoints - %ポイント差分（例: 1.5 = +1.5%ポイント）
 * @returns フォーマット済み文字列（例: "+1.5%pt"、"-0.8%pt"）
 */
function formatPercentagePointChange(changeInPercentagePoints: number): string {
  const sign = changeInPercentagePoints >= 0 ? '+' : '';
  return `${sign}${changeInPercentagePoints.toFixed(1)}%pt`;
}

/**
 * 前週比の差分（円・%ポイント）に応じた文字色を返す。
 *
 * @param value - 差分値。nullの場合はデータなし。
 * @returns CSSの色コード。
 */
function getChangeColor(value: number | null): string {
  if (value === null) {
    return '#666';
  }
  return value >= 0 ? '#1565c0' : '#c62828';
}

/**
 * 保有銘柄一覧テーブルの各行（tr）HTMLを生成する。
 *
 * 前週比系の値（損益・損益率）が null（前週データなし）の場合は「---」を表示し、
 * 色は getChangeColor の規則（null はグレー）に従う。
 *
 * @param holdings - 前週比付き保有銘柄の配列
 * @returns 連結済みの行HTML
 */
function buildHoldingsRows(holdings: HoldingWithWeekOverWeek[]): string {
  let holdingsHtml = '';
  for (const holding of holdings) {
    const investmentStr = formatNumber(holding.remainingInvestment);
    const valueStr = holding.currentValue !== null ? formatNumber(holding.currentValue) : '---';
    const gainStr = holding.unrealizedGain !== null ? formatNumber(holding.unrealizedGain) : '---';
    const gainRateStr =
      holding.unrealizedGainRate !== null ? formatRate(holding.unrealizedGainRate) : '---';

    // 損益の色を決定（個別銘柄）
    const gainColor = getGainColor(holding.unrealizedGain);

    // 前週比（損益）のフォーマット（個別銘柄）
    const holdingGainChangeStr =
      holding.unrealizedGainChange !== null
        ? formatDifference(holding.unrealizedGainChange)
        : '---';
    const holdingGainChangeColor = getChangeColor(holding.unrealizedGainChange);

    // 前週比（損益率）のフォーマット（個別銘柄）
    const holdingGainRateChangeStr =
      holding.unrealizedGainRateChange !== null
        ? formatPercentagePointChange(holding.unrealizedGainRateChange)
        : '---';
    const holdingGainRateChangeColor = getChangeColor(holding.unrealizedGainRateChange);

    holdingsHtml += `
      <tr>
        <td style="${STYLE.td}">${holding.fundName}</td>
        <td style="${STYLE.td}">${getAssetClassLabel(holding.assetClass)}</td>
        <td style="${STYLE.tdRight}">${investmentStr}円</td>
        <td style="${STYLE.tdRight}">${valueStr}円</td>
        <td style="${STYLE.tdRight} color: ${gainColor}; font-weight: bold;">${gainStr}円</td>
        <td style="${STYLE.tdRight} color: ${gainColor}; font-weight: bold;">${gainRateStr}</td>
        <td style="${STYLE.tdRight} color: ${holdingGainChangeColor}; font-weight: bold;">${holdingGainChangeStr}</td>
        <td style="${STYLE.tdRight} color: ${holdingGainRateChangeColor}; font-weight: bold;">${holdingGainRateChangeStr}</td>
      </tr>
    `;
  }
  return holdingsHtml;
}

/**
 * 資産クラス別サマリーの各行をHTMLへ変換する。
 * nullの評価額・損益・構成比は未登録値として「---」にし、構成比には損益用の符号を付けない。
 * 呼び出し元は空配列の場合に表自体を生成しない。
 */
function buildAssetClassRows(summaries: AssetClassSummary[]): string {
  let rows = '';
  for (const summary of summaries) {
    // 評価額・損益・損益率・構成比は、未登録値を「---」として表示する。
    const value =
      summary.totalCurrentValue === null ? '---' : formatNumber(summary.totalCurrentValue);
    const gain =
      summary.totalUnrealizedGain === null ? '---' : formatNumber(summary.totalUnrealizedGain);
    const rate =
      summary.totalUnrealizedGainRate === null
        ? '---'
        : formatRate(summary.totalUnrealizedGainRate);
    const allocation =
      summary.allocationRate === null ? '---' : formatAllocationRate(summary.allocationRate);
    const gainColor = getGainColor(summary.totalUnrealizedGain);

    rows += `
      <tr>
        <td style="${STYLE.td}">${getAssetClassLabel(summary.assetClass)}</td>
        <td style="${STYLE.tdRight}">${formatNumber(summary.remainingInvestment)}円</td>
        <td style="${STYLE.tdRight}">${value}円</td>
        <td style="${STYLE.tdRight} color: ${gainColor}; font-weight: bold;">${gain}円</td>
        <td style="${STYLE.tdRight} color: ${gainColor}; font-weight: bold;">${rate}</td>
        <td style="${STYLE.tdRight}">${allocation}</td>
      </tr>
    `;
  }
  return rows;
}

/**
 * 評価額構成比をメール表示用のパーセントへ変換する。
 *
 * 構成比は増減値ではないため符号を付けず、小数第1位まで表示する。
 * 呼び出し元は、評価額が未登録で構成比がnullの場合に本関数を呼び出さず、`---`を表示する。
 *
 * @param rate 全体評価額に対する構成比（0.5は50.0%を表す）
 * @returns 符号なしの小数1桁パーセント表記
 */
function formatAllocationRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** 未実現損益の値を週次レポート用の青・赤・中立色へ変換する。nullは中立色とする。 */
function getGainColor(value: number | null): string {
  if (value === null) return '#333';
  return value >= 0 ? '#1565c0' : '#c62828';
}

/**
 * 週次レポートのHTMLメール本文を生成する。
 *
 * @param report - 週次レポート
 * @returns HTMLメール本文
 */
export function generateWeeklyReportEmailBody(report: WeeklyReport): string {
  const { portfolio, generatedAt } = report;

  // ポートフォリオ全体のサマリー
  const totalInvestmentStr = formatNumber(portfolio.remainingInvestment);
  const totalValueStr =
    portfolio.totalCurrentValue !== null ? formatNumber(portfolio.totalCurrentValue) : '---';
  const totalGainStr =
    portfolio.totalUnrealizedGain !== null ? formatNumber(portfolio.totalUnrealizedGain) : '---';
  const totalGainRateStr =
    portfolio.totalUnrealizedGainRate !== null
      ? formatRate(portfolio.totalUnrealizedGainRate)
      : '---';
  // 総損益（税引後実現損益 + 未実現損益）。未実現損益ベースの既存行とは別に表示する。
  const overallGainStr = portfolio.totalGain !== null ? formatNumber(portfolio.totalGain) : '---';
  const overallGainRateStr =
    portfolio.totalGainRate !== null ? formatRate(portfolio.totalGainRate) : '---';
  const overallGainColor = getGainColor(portfolio.totalGain);
  const totalTaxStr = formatNumber(portfolio.totalTax);
  const realizedGainAfterTaxStr = formatNumber(portfolio.realizedGainAfterTax);
  const realizedGainAfterTaxColor = getGainColor(portfolio.realizedGainAfterTax);
  // 税額未記録の売却がある場合、税引後実現損益は完全な税引後の値ではないため注記を付ける。
  const taxUnrecordedNote =
    portfolio.taxUnrecordedSaleCount > 0
      ? `<br><span style="font-size: 11px; color: #999; font-weight: normal;">※税未記録の売却が${String(portfolio.taxUnrecordedSaleCount)}件あるため参考値</span>`
      : '';

  // 損益の色を決定（全体）
  const totalGainColor = getGainColor(portfolio.totalUnrealizedGain);

  // 前週比のフォーマット（全体）
  const totalInvestmentChangeStr = formatWeekOverWeekChange(portfolio.remainingInvestmentChange);
  const totalValueChangeStr = formatWeekOverWeekChange(portfolio.totalCurrentValueChange);
  const totalGainChangeStr =
    portfolio.totalUnrealizedGainChange !== null
      ? formatDifference(portfolio.totalUnrealizedGainChange)
      : '---';
  const totalGainRateChangeStr =
    portfolio.totalUnrealizedGainRateChange !== null
      ? formatPercentagePointChange(portfolio.totalUnrealizedGainRateChange)
      : '---';

  // 前週比の色を決定
  const totalInvestmentChangeColor = getChangeColor(
    portfolio.remainingInvestmentChange?.difference ?? null
  );
  const totalValueChangeColor = getChangeColor(
    portfolio.totalCurrentValueChange?.difference ?? null
  );
  const totalGainChangeColor = getChangeColor(portfolio.totalUnrealizedGainChange);
  const totalGainRateChangeColor = getChangeColor(portfolio.totalUnrealizedGainRateChange);

  // 保有銘柄一覧のHTML生成
  const holdingsHtml = buildHoldingsRows(portfolio.holdings);
  const assetClassHtml =
    portfolio.assetClassSummaries.length === 0
      ? ''
      : `
        <h2 style="color: #333; margin-top: 30px;">資産クラス別</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 800px; margin-bottom: 30px;">
          <tr style="background-color: #f5f5f5;">
            <th style="${STYLE.cellLeft}">資産クラス</th>
            <th style="${STYLE.cellRight}">残存投資額</th>
            <th style="${STYLE.cellRight}">評価額</th>
            <th style="${STYLE.cellRight}">未実現損益</th>
            <th style="${STYLE.cellRight}">未実現損益率</th>
            <th style="${STYLE.cellRight}">評価額構成比</th>
          </tr>
          ${buildAssetClassRows(portfolio.assetClassSummaries)}
        </table>`;

  const inner = `
        <h1 style="color: #333;">Trustfolio 週次レポート</h1>
        <p style="color: #666;">レポート生成日時: ${generatedAt}</p>

        <h2 style="color: #333; margin-top: 30px;">ポートフォリオ全体</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 800px; margin-bottom: 30px;">
          <tr style="background-color: #f5f5f5;">
            <th style="${STYLE.cellLeft}">項目</th>
            <th style="${STYLE.cellRight}">金額</th>
            <th style="${STYLE.cellRight}">前週比</th>
          </tr>
          <tr>
            <td style="${STYLE.td}">残存投資額</td>
            <td style="${STYLE.tdRight}">${totalInvestmentStr}円</td>
            <td style="${STYLE.tdRight} color: ${totalInvestmentChangeColor}; font-weight: bold; font-size: 12px;">${totalInvestmentChangeStr}</td>
          </tr>
          <tr>
            <td style="${STYLE.td}">評価額</td>
            <td style="${STYLE.tdRight}">${totalValueStr}円</td>
            <td style="${STYLE.tdRight} color: ${totalValueChangeColor}; font-weight: bold; font-size: 12px;">${totalValueChangeStr}</td>
          </tr>
          <tr>
            <td style="${STYLE.td}">未実現損益</td>
            <td style="${STYLE.tdRight} color: ${totalGainColor}; font-weight: bold;">${totalGainStr}円</td>
            <td style="${STYLE.tdRight} color: ${totalGainChangeColor}; font-weight: bold; font-size: 12px;">${totalGainChangeStr}</td>
          </tr>
          <tr>
            <td style="${STYLE.td}">未実現損益率</td>
            <td style="${STYLE.tdRight} color: ${totalGainColor}; font-weight: bold;">${totalGainRateStr}</td>
            <td style="${STYLE.tdRight} color: ${totalGainRateChangeColor}; font-weight: bold; font-size: 12px;">${totalGainRateChangeStr}</td>
          </tr>
          <tr>
            <td style="${STYLE.td}">総損益（税引後実現＋未実現）</td>
            <td style="${STYLE.tdRight} color: ${overallGainColor}; font-weight: bold;">${overallGainStr}円</td>
            <td style="${STYLE.tdRight}">---</td>
          </tr>
          <tr>
            <td style="${STYLE.td}">総損益率</td>
            <td style="${STYLE.tdRight} color: ${overallGainColor}; font-weight: bold;">${overallGainRateStr}</td>
            <td style="${STYLE.tdRight}">---</td>
          </tr>
          <tr>
            <td style="${STYLE.td}">売却税額（記録分）</td>
            <td style="${STYLE.tdRight}">${totalTaxStr}円</td>
            <td style="${STYLE.tdRight}">---</td>
          </tr>
          <tr>
            <td style="${STYLE.td}">税引後実現損益</td>
            <td style="${STYLE.tdRight} color: ${realizedGainAfterTaxColor}; font-weight: bold;">${realizedGainAfterTaxStr}円${taxUnrecordedNote}</td>
            <td style="${STYLE.tdRight}">---</td>
          </tr>
        </table>${assetClassHtml}
        <h2 style="color: #333; margin-top: 30px;">保有銘柄一覧</h2>
        <table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">
          <tr style="background-color: #f5f5f5;">
            <th style="${STYLE.cellLeft}">銘柄名</th>
            <th style="${STYLE.cellLeft}">資産クラス</th>
            <th style="${STYLE.cellRight}">残存投資額</th>
            <th style="${STYLE.cellRight}">評価額</th>
            <th style="${STYLE.cellRight}">損益</th>
            <th style="${STYLE.cellRight}">損益率</th>
            <th style="${STYLE.cellRight}">前週比（損益）</th>
            <th style="${STYLE.cellRight}">前週比（損益率）</th>
          </tr>
          ${holdingsHtml}
        </table>

        <p style="color: #999; font-size: 12px; margin-top: 40px;">
          このメールはTrustfolioから自動送信されています。
        </p>`;

  return wrapEmailBody(inner);
}

/**
 * エラー通知のHTMLメール本文を生成する。
 *
 * タイムスタンプの生成（現在時刻の取得と JST 整形）は呼び出し側（EmailService）の責務とし、
 * 本関数は受け取った値から本文を組み立てる純粋なテンプレートに徹する。
 *
 * 注意: このメールは歴史的に外枠のインデントが他メールと異なるため、
 * wrapEmailBody を使わずインラインで生成して既存の出力を維持している。
 *
 * @param taskName - エラーが発生したタスク名
 * @param errorMessage - エラーメッセージ
 * @param timestamp - 発生日時（JST の 'yyyy-MM-dd HH:mm:ss' 形式）
 * @returns HTMLメール本文
 */
export function generateErrorNotificationEmailBody(
  taskName: string,
  errorMessage: string,
  timestamp: string
): string {
  return `
        <html>
          <head>
            <meta charset="utf-8">
          </head>
          <body style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 20px;">
            <h1 style="color: #c62828;">Trustfolio エラー通知</h1>
            <p style="color: #666;">発生日時: ${timestamp}</p>

            <h2 style="color: #333; margin-top: 30px;">タスク</h2>
            <p style="font-size: 16px; color: #333;">${taskName}</p>

            <h2 style="color: #333; margin-top: 30px;">エラー内容</h2>
            <div style="background-color: #ffebee; border-left: 4px solid #c62828; padding: 16px; margin: 16px 0;">
              <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: monospace; color: #333;">${errorMessage}</pre>
            </div>

            <p style="color: #999; font-size: 12px; margin-top: 40px;">
              このメールはTrustfolioから自動送信されています。
            </p>
          </body>
        </html>
      `;
}

/**
 * 指数の終値を桁区切り・小数2桁の文字列に変換する。
 *
 * 市場指数アラートの指数行4ブロックで反復していた
 * `toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` を
 * 一元化したもの（H5 #151）。
 *
 * @param value - 指数の終値
 * @returns フォーマット済み文字列（例: "4,700.00"）
 */
function formatIndexValue(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * -5%ルールが発火した指数の行（tr）HTMLを生成する。
 *
 * S&P500 / NASDAQ で指数名以外が完全に同一だった2ブロックを集約したもの（H5 #151）。
 * 発火行は警告背景（#ffebee）・太字の指数名・赤太字の変化率で表示する。
 *
 * @param indexName - 表示する指数名（'S&P500' または 'NASDAQ'）
 * @param change - 指数の変化情報
 * @returns 行HTML
 */
function buildTriggeredIndexRow(indexName: string, change: MarketIndexChange): string {
  return `
      <tr style="background-color: #ffebee;">
        <td style="${STYLE.cell} font-weight: bold;">${indexName}</td>
        <td style="${STYLE.cellRight}">${formatIndexValue(change.previousValue)}</td>
        <td style="${STYLE.cellRight}">${formatIndexValue(change.currentValue)}</td>
        <td style="${STYLE.cellRight} color: #c62828; font-weight: bold;">${change.changeRate.toFixed(2)}%</td>
      </tr>
    `;
}

/**
 * -5%ルールが発火していない指数の参考行（tr）HTMLを生成する。
 *
 * S&P500 / NASDAQ で指数名以外が完全に同一だった2ブロックを集約したもの（H5 #151）。
 * 参考行は通常背景で、変化率を正負に応じた色（正: 青、負: 赤）と符号付きで表示する。
 *
 * @param indexName - 表示する指数名（'S&P500' または 'NASDAQ'）
 * @param change - 指数の変化情報
 * @returns 行HTML
 */
function buildReferenceIndexRow(indexName: string, change: MarketIndexChange): string {
  const changeColor = change.changeRate >= 0 ? '#1565c0' : '#c62828';
  const changeSign = change.changeRate >= 0 ? '+' : '';
  return `
      <tr>
        <td style="${STYLE.cell}">${indexName}</td>
        <td style="${STYLE.cellRight}">${formatIndexValue(change.previousValue)}</td>
        <td style="${STYLE.cellRight}">${formatIndexValue(change.currentValue)}</td>
        <td style="${STYLE.cellRight} color: ${changeColor};">${changeSign}${change.changeRate.toFixed(2)}%</td>
      </tr>
    `;
}

/**
 * -5%ルールアラートのHTMLメール本文を生成する。
 *
 * @param alertResult - アラート判定結果
 * @returns HTMLメール本文
 */
export function generateMarketIndexAlertEmailBody(alertResult: MarketIndexAlertResult): string {
  const { sp500, nasdaq, alertDate, comparisonDate } = alertResult;

  // 下落した指数の詳細を生成
  let triggeredIndicesHtml = '';

  if (sp500?.isTriggered) {
    triggeredIndicesHtml += buildTriggeredIndexRow('S&P500', sp500);
  }

  if (nasdaq?.isTriggered) {
    triggeredIndicesHtml += buildTriggeredIndexRow('NASDAQ', nasdaq);
  }

  // 下落していない指数も参考情報として表示
  let referenceIndicesHtml = '';

  if (sp500 && !sp500.isTriggered) {
    referenceIndicesHtml += buildReferenceIndexRow('S&P500', sp500);
  }

  if (nasdaq && !nasdaq.isTriggered) {
    referenceIndicesHtml += buildReferenceIndexRow('NASDAQ', nasdaq);
  }

  const inner = `
        <h1 style="color: #c62828;">⚠️ -5%ルールアラート</h1>
        <p style="color: #666;">比較期間: ${comparisonDate} → ${alertDate}</p>

        <div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; font-size: 16px; color: #333;">
            <strong>市場指数が前週比-5%以上下落しました。</strong><br>
            追加投資を検討するタイミングかもしれません。
          </p>
        </div>

        <h2 style="color: #333; margin-top: 30px;">下落した指数</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-bottom: 20px;">
          <tr style="background-color: #f5f5f5;">
            <th style="${STYLE.cellLeft}">指数</th>
            <th style="${STYLE.cellRight}">前週終値</th>
            <th style="${STYLE.cellRight}">今週終値</th>
            <th style="${STYLE.cellRight}">変化率</th>
          </tr>
          ${triggeredIndicesHtml}
        </table>

        ${
          referenceIndicesHtml !== ''
            ? `
        <h2 style="color: #333; margin-top: 30px;">参考: その他の指数</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin-bottom: 20px;">
          <tr style="background-color: #f5f5f5;">
            <th style="${STYLE.cellLeft}">指数</th>
            <th style="${STYLE.cellRight}">前週終値</th>
            <th style="${STYLE.cellRight}">今週終値</th>
            <th style="${STYLE.cellRight}">変化率</th>
          </tr>
          ${referenceIndicesHtml}
        </table>
        `
            : ''
        }

        <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #333;">
            <strong>-5%ルールとは</strong><br>
            市場が大きく下落した際に追加投資を行う投資戦略です。<br>
            長期的な視点で、割安になった資産を購入する機会として活用できます。
          </p>
        </div>

        <p style="color: #999; font-size: 12px; margin-top: 40px;">
          このメールはTrustfolioから自動送信されています。<br>
          投資は自己責任で行ってください。
        </p>`;

  return wrapEmailBody(inner);
}
