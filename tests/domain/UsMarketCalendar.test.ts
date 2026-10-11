import { describe, expect, it } from 'vite-plus/test';
import {
  getLastBusinessDay,
  getUsMarketHoliday,
  getUsMarketHolidays,
  isUsMarketBusinessDay,
  isUsMarketHoliday,
} from '../../src/domain/UsMarketCalendar';

describe('UsMarketCalendar', () => {
  describe('isUsMarketBusinessDay', () => {
    it('平日（月〜金）は営業日と判定される', () => {
      // 前提: 2024年1月8日は月曜日、祝日ではない
      // 検証: 営業日として判定される
      expect(isUsMarketBusinessDay('2024-01-08')).toBe(true);

      // 前提: 2024年1月9日は火曜日
      expect(isUsMarketBusinessDay('2024-01-09')).toBe(true);

      // 前提: 2024年1月10日は水曜日
      expect(isUsMarketBusinessDay('2024-01-10')).toBe(true);

      // 前提: 2024年1月11日は木曜日
      expect(isUsMarketBusinessDay('2024-01-11')).toBe(true);

      // 前提: 2024年1月12日は金曜日
      expect(isUsMarketBusinessDay('2024-01-12')).toBe(true);
    });

    it('土曜日は非営業日と判定される', () => {
      // 前提: 2024年1月13日は土曜日
      // 検証: 非営業日として判定される
      expect(isUsMarketBusinessDay('2024-01-13')).toBe(false);
    });

    it('日曜日は非営業日と判定される', () => {
      // 前提: 2024年1月14日は日曜日
      // 検証: 非営業日として判定される
      expect(isUsMarketBusinessDay('2024-01-14')).toBe(false);
    });

    it('無効な日付形式はfalseを返す', () => {
      // 前提: 不正な日付形式
      // 検証: falseを返す
      expect(isUsMarketBusinessDay('invalid')).toBe(false);
      expect(isUsMarketBusinessDay('2024/01/08')).toBe(false);
      expect(isUsMarketBusinessDay('')).toBe(false);
    });
  });

  describe('米国祝日判定', () => {
    describe("元日（New Year's Day）", () => {
      it('1月1日が平日の場合、その日が休場', () => {
        // 前提: 2024年1月1日は月曜日
        // 検証: 1月1日が休場
        expect(isUsMarketHoliday('2024-01-01')).toBe(true);
        expect(getUsMarketHoliday('2024-01-01')).toBe('NEW_YEARS_DAY');
      });

      it('1月1日が土曜日の場合、前年12月31日は振替休日にならない', () => {
        // 前提: 2022年1月1日は土曜日
        // 実際の米国市場ルール: 元日が土曜日の場合、前年への振替はない
        // 検証: 2021年12月31日（金）は通常営業
        expect(isUsMarketHoliday('2021-12-31')).toBe(false);
        expect(isUsMarketBusinessDay('2021-12-31')).toBe(true);
      });

      it('1月1日が日曜日の場合、1月2日（月）が休場', () => {
        // 前提: 2023年1月1日は日曜日
        // 検証: 2023年1月2日（月）が休場
        expect(isUsMarketHoliday('2023-01-02')).toBe(true);
        expect(getUsMarketHoliday('2023-01-02')).toBe('NEW_YEARS_DAY');
      });
    });

    describe('マーティン・ルーサー・キング・ジュニアの日（MLK Day）', () => {
      it('1月第3月曜日が休場', () => {
        // 前提: 2024年1月15日は1月第3月曜日
        // 検証: MLK Dayとして休場
        expect(isUsMarketHoliday('2024-01-15')).toBe(true);
        expect(getUsMarketHoliday('2024-01-15')).toBe('MLK_DAY');
        expect(isUsMarketBusinessDay('2024-01-15')).toBe(false);
      });

      it('2025年のMLK Day', () => {
        // 前提: 2025年1月20日は1月第3月曜日
        expect(isUsMarketHoliday('2025-01-20')).toBe(true);
        expect(getUsMarketHoliday('2025-01-20')).toBe('MLK_DAY');
      });
    });

    describe('大統領の日（Presidents Day）', () => {
      it('2月第3月曜日が休場', () => {
        // 前提: 2024年2月19日は2月第3月曜日
        // 検証: Presidents Dayとして休場
        expect(isUsMarketHoliday('2024-02-19')).toBe(true);
        expect(getUsMarketHoliday('2024-02-19')).toBe('PRESIDENTS_DAY');
        expect(isUsMarketBusinessDay('2024-02-19')).toBe(false);
      });
    });

    describe('聖金曜日（Good Friday）', () => {
      it('2024年のGood Friday', () => {
        // 前提: 2024年のイースターは3月31日、Good Fridayは3月29日
        // 検証: Good Fridayとして休場
        expect(isUsMarketHoliday('2024-03-29')).toBe(true);
        expect(getUsMarketHoliday('2024-03-29')).toBe('GOOD_FRIDAY');
        expect(isUsMarketBusinessDay('2024-03-29')).toBe(false);
      });

      it('2025年のGood Friday', () => {
        // 前提: 2025年のイースターは4月20日、Good Fridayは4月18日
        expect(isUsMarketHoliday('2025-04-18')).toBe(true);
        expect(getUsMarketHoliday('2025-04-18')).toBe('GOOD_FRIDAY');
      });

      it('2026年のGood Friday', () => {
        // 前提: 2026年のイースターは4月5日、Good Fridayは4月3日
        expect(isUsMarketHoliday('2026-04-03')).toBe(true);
        expect(getUsMarketHoliday('2026-04-03')).toBe('GOOD_FRIDAY');
      });
    });

    describe('戦没将兵追悼記念日（Memorial Day）', () => {
      it('5月最終月曜日が休場', () => {
        // 前提: 2024年5月27日は5月最終月曜日
        // 検証: Memorial Dayとして休場
        expect(isUsMarketHoliday('2024-05-27')).toBe(true);
        expect(getUsMarketHoliday('2024-05-27')).toBe('MEMORIAL_DAY');
        expect(isUsMarketBusinessDay('2024-05-27')).toBe(false);
      });
    });

    describe('ジューンティーンス（Juneteenth）', () => {
      it('6月19日が平日の場合、その日が休場', () => {
        // 前提: 2024年6月19日は水曜日
        // 検証: Juneteenthとして休場
        expect(isUsMarketHoliday('2024-06-19')).toBe(true);
        expect(getUsMarketHoliday('2024-06-19')).toBe('JUNETEENTH');
        expect(isUsMarketBusinessDay('2024-06-19')).toBe(false);
      });

      it('6月19日が土曜日の場合、6月18日（金）が休場', () => {
        // 前提: 2021年6月19日は土曜日
        // 検証: 6月18日（金）が休場
        expect(isUsMarketHoliday('2021-06-18')).toBe(true);
        expect(getUsMarketHoliday('2021-06-18')).toBe('JUNETEENTH');
      });

      it('6月19日が日曜日の場合、6月20日（月）が休場', () => {
        // 前提: 2022年6月19日は日曜日
        // 検証: 6月20日（月）が休場
        expect(isUsMarketHoliday('2022-06-20')).toBe(true);
        expect(getUsMarketHoliday('2022-06-20')).toBe('JUNETEENTH');
      });
    });

    describe('独立記念日（Independence Day）', () => {
      it('7月4日が平日の場合、その日が休場', () => {
        // 前提: 2024年7月4日は木曜日
        // 検証: Independence Dayとして休場
        expect(isUsMarketHoliday('2024-07-04')).toBe(true);
        expect(getUsMarketHoliday('2024-07-04')).toBe('INDEPENDENCE_DAY');
        expect(isUsMarketBusinessDay('2024-07-04')).toBe(false);
      });

      it('7月4日が土曜日の場合、7月3日（金）が休場', () => {
        // 前提: 2026年7月4日は土曜日
        // 検証: 7月3日（金）が休場
        expect(isUsMarketHoliday('2026-07-03')).toBe(true);
        expect(getUsMarketHoliday('2026-07-03')).toBe('INDEPENDENCE_DAY');
      });

      it('7月4日が日曜日の場合、7月5日（月）が休場', () => {
        // 前提: 2021年7月4日は日曜日
        // 検証: 7月5日（月）が休場
        expect(isUsMarketHoliday('2021-07-05')).toBe(true);
        expect(getUsMarketHoliday('2021-07-05')).toBe('INDEPENDENCE_DAY');
      });
    });

    describe('労働者の日（Labor Day）', () => {
      it('9月第1月曜日が休場', () => {
        // 前提: 2024年9月2日は9月第1月曜日
        // 検証: Labor Dayとして休場
        expect(isUsMarketHoliday('2024-09-02')).toBe(true);
        expect(getUsMarketHoliday('2024-09-02')).toBe('LABOR_DAY');
        expect(isUsMarketBusinessDay('2024-09-02')).toBe(false);
      });
    });

    describe('感謝祭（Thanksgiving）', () => {
      it('11月第4木曜日が休場', () => {
        // 前提: 2024年11月28日は11月第4木曜日
        // 検証: Thanksgivingとして休場
        expect(isUsMarketHoliday('2024-11-28')).toBe(true);
        expect(getUsMarketHoliday('2024-11-28')).toBe('THANKSGIVING');
        expect(isUsMarketBusinessDay('2024-11-28')).toBe(false);
      });
    });

    describe('クリスマス（Christmas）', () => {
      it('12月25日が平日の場合、その日が休場', () => {
        // 前提: 2024年12月25日は水曜日
        // 検証: Christmasとして休場
        expect(isUsMarketHoliday('2024-12-25')).toBe(true);
        expect(getUsMarketHoliday('2024-12-25')).toBe('CHRISTMAS');
        expect(isUsMarketBusinessDay('2024-12-25')).toBe(false);
      });

      it('12月25日が土曜日の場合、12月24日（金）が休場', () => {
        // 前提: 2021年12月25日は土曜日
        // 検証: 12月24日（金）が休場
        expect(isUsMarketHoliday('2021-12-24')).toBe(true);
        expect(getUsMarketHoliday('2021-12-24')).toBe('CHRISTMAS');
      });

      it('12月25日が日曜日の場合、12月26日（月）が休場', () => {
        // 前提: 2022年12月25日は日曜日
        // 検証: 12月26日（月）が休場
        expect(isUsMarketHoliday('2022-12-26')).toBe(true);
        expect(getUsMarketHoliday('2022-12-26')).toBe('CHRISTMAS');
      });
    });
  });

  describe('getUsMarketHolidays', () => {
    it('2024年の祝日一覧を正しく取得できる', () => {
      // 前提: 2024年の米国市場祝日（元日は月曜日なので振替なし）
      // 検証: 全ての祝日が含まれている
      const holidays = getUsMarketHolidays(2024);

      expect(holidays).toContain('2024-01-01'); // New Year's Day
      expect(holidays).toContain('2024-01-15'); // MLK Day
      expect(holidays).toContain('2024-02-19'); // Presidents Day
      expect(holidays).toContain('2024-03-29'); // Good Friday
      expect(holidays).toContain('2024-05-27'); // Memorial Day
      expect(holidays).toContain('2024-06-19'); // Juneteenth
      expect(holidays).toContain('2024-07-04'); // Independence Day
      expect(holidays).toContain('2024-09-02'); // Labor Day
      expect(holidays).toContain('2024-11-28'); // Thanksgiving
      expect(holidays).toContain('2024-12-25'); // Christmas

      // 10個の祝日があることを確認
      expect(holidays.length).toBe(10);
    });

    it('元日が土曜日の年は祝日が9個になる', () => {
      // 前提: 2022年1月1日は土曜日なので振替なし
      // 検証: 元日を除く9個の祝日
      const holidays = getUsMarketHolidays(2022);

      // 元日は振替なし
      expect(holidays).not.toContain('2022-01-01');
      expect(holidays).not.toContain('2021-12-31');

      // 9個の祝日があることを確認
      expect(holidays.length).toBe(9);
    });

    it('祝日一覧は日付順にソートされている', () => {
      // 前提: getUsMarketHolidaysの結果
      // 検証: 日付の昇順でソートされている
      const holidays = getUsMarketHolidays(2024);

      for (let i = 1; i < holidays.length; i++) {
        const prev = holidays[i - 1];
        const curr = holidays[i];
        expect(prev !== undefined && curr !== undefined && prev < curr).toBe(true);
      }
    });
  });

  describe('getLastBusinessDay', () => {
    it('営業日の場合はその日を返す', () => {
      // 前提: 2024年1月8日は月曜日で営業日
      // 検証: 同日を返す
      expect(getLastBusinessDay('2024-01-08')).toBe('2024-01-08');
    });

    it('土曜日の場合は直前の金曜日を返す', () => {
      // 前提: 2024年1月13日は土曜日
      // 検証: 2024年1月12日（金）を返す
      expect(getLastBusinessDay('2024-01-13')).toBe('2024-01-12');
    });

    it('日曜日の場合は直前の金曜日を返す', () => {
      // 前提: 2024年1月14日は日曜日
      // 検証: 2024年1月12日（金）を返す
      expect(getLastBusinessDay('2024-01-14')).toBe('2024-01-12');
    });

    it('月曜日が祝日の場合は直前の金曜日を返す', () => {
      // 前提: 2024年1月15日はMLK Day（月曜日）
      // 検証: 2024年1月12日（金）を返す
      expect(getLastBusinessDay('2024-01-15')).toBe('2024-01-12');
    });

    it('3連休の最終日からは直前の営業日を返す', () => {
      // 前提: 2024年1月13-15日は土日+MLK Dayの3連休
      // 検証: いずれの日からも2024年1月12日（金）を返す
      expect(getLastBusinessDay('2024-01-13')).toBe('2024-01-12');
      expect(getLastBusinessDay('2024-01-14')).toBe('2024-01-12');
      expect(getLastBusinessDay('2024-01-15')).toBe('2024-01-12');
    });

    it('無効な日付の場合はnullを返す', () => {
      // 前提: 不正な日付形式
      // 検証: nullを返す
      expect(getLastBusinessDay('invalid')).toBeNull();
      expect(getLastBusinessDay('')).toBeNull();
    });
  });
});
