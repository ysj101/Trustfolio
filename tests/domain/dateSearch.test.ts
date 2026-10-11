import { describe, expect, it, vi } from 'vite-plus/test';
import {
  buildOffsetDateCandidates,
  findFirstRecordByDateCandidates,
} from '../../src/domain/dateSearch';

/**
 * 前週レコード探索の共通ヘルパー（dateSearch）の検証。
 *
 * WeeklyReportUseCase（全体実績の前週探索）と MarketIndexAlertUseCase（市場指数の前週探索）が
 * 共有する骨格であり、「候補日付の生成順 = 探索の優先順」が仕様の中心である。
 */

/** テスト用の単純な日付フォーマッタ（UTC 基準の YYYY-MM-DD）。 */
function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('buildOffsetDateCandidates', () => {
  it('オフセット列の並び順どおりに候補日付を生成する', () => {
    // 前提: 基準日 2024-04-01 に、市場指数アラートと同じ「近い順」のオフセット列を適用する
    // 事前条件: オフセットは [0, -1, 1, -2, 2]（0日→前日→翌日→2日前→2日後の優先順）
    // 検証: 生成される候補がオフセット列と同じ順序で並ぶ（探索の優先順が保たれる）
    const baseDate = new Date('2024-04-01T00:00:00Z');

    const candidates = buildOffsetDateCandidates(baseDate, [0, -1, 1, -2, 2], formatUtcDate);

    expect(candidates).toEqual([
      '2024-04-01',
      '2024-03-31',
      '2024-04-02',
      '2024-03-30',
      '2024-04-03',
    ]);
  });

  it('月をまたぐオフセットも正しく計算し、基準日の Date を変更しない', () => {
    // 前提: 月初の基準日から過去方向へ遡る（週次レポートと同じ過去方向のみのオフセット列）
    // 事前条件: オフセットは [0, -1, -2] で月境界（4/1 → 3/31, 3/30）をまたぐ
    // 検証: 月またぎが正しく計算され、渡した baseDate 自体は変更されない（防御的コピー）
    const baseDate = new Date('2024-04-01T00:00:00Z');
    const originalTime = baseDate.getTime();

    const candidates = buildOffsetDateCandidates(baseDate, [0, -1, -2], formatUtcDate);

    expect(candidates).toEqual(['2024-04-01', '2024-03-31', '2024-03-30']);
    expect(baseDate.getTime()).toBe(originalTime);
  });
});

describe('buildOffsetDateCandidates（閏年境界）', () => {
  it('閏年の2月末をまたぐオフセットで 2月29日 を正しく生成する', () => {
    // 前提: 2024年（閏年）の 3月1日 を基準に過去方向へ遡る
    // 事前条件: オフセットは [0, -1, -2]（3/1 → 2/29 → 2/28）
    // 検証: 閏日 2024-02-29 が正しく生成される（月境界＋閏年の複合ケース）
    const baseDate = new Date('2024-03-01T00:00:00Z');

    const candidates = buildOffsetDateCandidates(baseDate, [0, -1, -2], formatUtcDate);

    expect(candidates).toEqual(['2024-03-01', '2024-02-29', '2024-02-28']);
  });
});

describe('findFirstRecordByDateCandidates', () => {
  it('候補の先頭から照合し、最初にヒットしたレコードを日付付きで返す', () => {
    // 前提: 2件目の候補日付にのみレコードが存在する
    // 事前条件: レコードは日付をキーに引ける
    // 検証: 先頭のミスを飛ばして最初のヒット（2件目）が { date, record } で返る
    const records = new Map([['2024-03-31', { date: '2024-03-31', value: 45000 }]]);

    const found = findFirstRecordByDateCandidates(
      ['2024-04-01', '2024-03-31', '2024-03-30'],
      (dateStr) => records.get(dateStr) ?? null
    );

    expect(found).toEqual({ date: '2024-03-31', record: { date: '2024-03-31', value: 45000 } });
  });

  it('最初のヒット以降の候補は照合しない（優先順の早期終了）', () => {
    // 前提: 1件目の候補で即ヒットする
    // 事前条件: lookup の呼び出し回数を記録する
    // 検証: 2件目以降の lookup は呼ばれない（I/O を伴う照合で無駄な読み取りをしない）
    const lookup = vi.fn((dateStr: string) =>
      dateStr === '2024-04-01' ? { date: dateStr } : null
    );

    const found = findFirstRecordByDateCandidates(['2024-04-01', '2024-03-31'], lookup);

    expect(found?.date).toBe('2024-04-01');
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('全候補でヒットしない場合は null を返す', () => {
    // 前提: どの候補日付にもレコードが存在しない
    // 事前条件: lookup は常に null を返す
    // 検証: 結果は null（呼び出し側が「前週データなし」の分岐へ進める）
    const found = findFirstRecordByDateCandidates(['2024-04-01', '2024-03-31'], () => null);

    expect(found).toBeNull();
  });
});
