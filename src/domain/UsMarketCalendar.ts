/**
 * 米国市場営業日判定モジュール。
 *
 * 米国株式市場（NYSE/NASDAQ）の営業日を判定する。
 * 以下のルールに基づいて非営業日を判定する：
 * - 土曜日・日曜日
 * - 米国連邦祝日（市場が休場となるもの）
 *
 * 注意: このモジュールは米国東部時間（ET）ベースで動作する。
 * 日本時間から呼び出す場合は、米国日付への変換が必要。
 */

/**
 * 米国市場の休場日（祝日）の種類。
 */
export type UsMarketHoliday =
  | 'NEW_YEARS_DAY'
  | 'MLK_DAY'
  | 'PRESIDENTS_DAY'
  | 'GOOD_FRIDAY'
  | 'MEMORIAL_DAY'
  | 'JUNETEENTH'
  | 'INDEPENDENCE_DAY'
  | 'LABOR_DAY'
  | 'THANKSGIVING'
  | 'CHRISTMAS';

/**
 * 指定された日付が米国市場の営業日かどうかを判定する。
 *
 * @param date YYYY-MM-DD形式の日付文字列（米国東部時間ベース）
 * @returns 営業日の場合true、休場日（土日・祝日）の場合false
 */
export function isUsMarketBusinessDay(date: string): boolean {
  const parsedDate = parseDate(date);
  if (parsedDate === null) {
    return false;
  }

  // 土日チェック
  if (isWeekend(parsedDate)) {
    return false;
  }

  // 祝日チェック
  if (isUsMarketHoliday(date)) {
    return false;
  }

  return true;
}

/**
 * 指定された日付が米国市場の祝日かどうかを判定する。
 *
 * @param date YYYY-MM-DD形式の日付文字列
 * @returns 祝日の場合その種類、祝日でない場合null
 */
export function getUsMarketHoliday(date: string): UsMarketHoliday | null {
  const parsedDate = parseDate(date);
  if (parsedDate === null) {
    return null;
  }

  const year = parsedDate.getFullYear();
  const month = parsedDate.getMonth() + 1;
  const day = parsedDate.getDate();

  // 元日（1月1日）
  // 日曜日の場合は月曜に振替。土曜日の場合は振替なし（前年に振り替えない）。
  const newYearsDay = getObservedDateNoSaturdayShift(year, 1, 1);
  if (newYearsDay !== null && month === newYearsDay.month && day === newYearsDay.day) {
    return 'NEW_YEARS_DAY';
  }

  // マーティン・ルーサー・キング・ジュニアの日（1月第3月曜日）
  const mlkDay = getNthWeekdayOfMonth(year, 1, 1, 3);
  if (month === 1 && day === mlkDay) {
    return 'MLK_DAY';
  }

  // 大統領の日（2月第3月曜日）
  const presidentsDay = getNthWeekdayOfMonth(year, 2, 1, 3);
  if (month === 2 && day === presidentsDay) {
    return 'PRESIDENTS_DAY';
  }

  // 聖金曜日（イースター前の金曜日）
  const goodFriday = calculateGoodFriday(year);
  if (month === goodFriday.month && day === goodFriday.day) {
    return 'GOOD_FRIDAY';
  }

  // 戦没将兵追悼記念日（5月最終月曜日）
  const memorialDay = getLastWeekdayOfMonth(year, 5, 1);
  if (month === 5 && day === memorialDay) {
    return 'MEMORIAL_DAY';
  }

  // ジューンティーンス（6月19日、土曜なら金曜に、日曜なら月曜に振替）
  const juneteenth = getObservedDate(year, 6, 19);
  if (month === juneteenth.month && day === juneteenth.day) {
    return 'JUNETEENTH';
  }

  // 独立記念日（7月4日、土曜なら金曜に、日曜なら月曜に振替）
  const independenceDay = getObservedDate(year, 7, 4);
  if (month === independenceDay.month && day === independenceDay.day) {
    return 'INDEPENDENCE_DAY';
  }

  // 労働者の日（9月第1月曜日）
  const laborDay = getNthWeekdayOfMonth(year, 9, 1, 1);
  if (month === 9 && day === laborDay) {
    return 'LABOR_DAY';
  }

  // 感謝祭（11月第4木曜日）
  const thanksgiving = getNthWeekdayOfMonth(year, 11, 4, 4);
  if (month === 11 && day === thanksgiving) {
    return 'THANKSGIVING';
  }

  // クリスマス（12月25日、土曜なら金曜に、日曜なら月曜に振替）
  const christmas = getObservedDate(year, 12, 25);
  if (month === christmas.month && day === christmas.day) {
    return 'CHRISTMAS';
  }

  return null;
}

/**
 * 指定された日付が米国市場の祝日かどうかを判定する。
 *
 * @param date YYYY-MM-DD形式の日付文字列
 * @returns 祝日の場合true
 */
export function isUsMarketHoliday(date: string): boolean {
  return getUsMarketHoliday(date) !== null;
}

/**
 * 指定された日付から直近の営業日を取得する。
 * 指定日が営業日ならその日を、休場日なら直前の営業日を返す。
 *
 * @param date YYYY-MM-DD形式の日付文字列
 * @returns 直近の営業日（YYYY-MM-DD形式）、入力が不正な場合はnull
 */
export function getLastBusinessDay(date: string): string | null {
  const parsedDate = parseDate(date);
  if (parsedDate === null) {
    return null;
  }

  // 最大10日間遡る（連休でも十分）
  for (let i = 0; i < 10; i++) {
    const currentDate = new Date(parsedDate);
    currentDate.setDate(currentDate.getDate() - i);
    const dateStr = formatDate(currentDate);
    if (isUsMarketBusinessDay(dateStr)) {
      return dateStr;
    }
  }

  return null;
}

/**
 * 指定された年の米国市場休場日一覧を取得する。
 *
 * @param year 年
 * @returns 休場日の配列（YYYY-MM-DD形式、日付順）
 */
export function getUsMarketHolidays(year: number): string[] {
  const holidays: string[] = [];

  // 元日（土曜日の場合は振替なし）
  const newYearsDay = getObservedDateNoSaturdayShift(year, 1, 1);
  if (newYearsDay !== null) {
    holidays.push(formatDateParts(year, newYearsDay.month, newYearsDay.day));
  }

  // MLK Day
  const mlkDay = getNthWeekdayOfMonth(year, 1, 1, 3);
  holidays.push(formatDateParts(year, 1, mlkDay));

  // Presidents Day
  const presidentsDay = getNthWeekdayOfMonth(year, 2, 1, 3);
  holidays.push(formatDateParts(year, 2, presidentsDay));

  // Good Friday
  const goodFriday = calculateGoodFriday(year);
  holidays.push(formatDateParts(year, goodFriday.month, goodFriday.day));

  // Memorial Day
  const memorialDay = getLastWeekdayOfMonth(year, 5, 1);
  holidays.push(formatDateParts(year, 5, memorialDay));

  // Juneteenth
  const juneteenth = getObservedDate(year, 6, 19);
  holidays.push(formatDateParts(year, juneteenth.month, juneteenth.day));

  // Independence Day
  const independenceDay = getObservedDate(year, 7, 4);
  holidays.push(formatDateParts(year, independenceDay.month, independenceDay.day));

  // Labor Day
  const laborDay = getNthWeekdayOfMonth(year, 9, 1, 1);
  holidays.push(formatDateParts(year, 9, laborDay));

  // Thanksgiving
  const thanksgiving = getNthWeekdayOfMonth(year, 11, 4, 4);
  holidays.push(formatDateParts(year, 11, thanksgiving));

  // Christmas
  const christmas = getObservedDate(year, 12, 25);
  holidays.push(formatDateParts(year, christmas.month, christmas.day));

  return holidays.sort();
}

// ============================================
// 内部ヘルパー関数
// ============================================

/**
 * YYYY-MM-DD形式の文字列をDateオブジェクトにパースする。
 */
function parseDate(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (match === null) {
    return null;
  }
  // 正規表現がマッチした場合、キャプチャグループは必ず存在する
  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  const date = new Date(year, month, day);

  // 日付の妥当性チェック
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }

  return date;
}

/**
 * DateオブジェクトをYYYY-MM-DD形式の文字列に変換する。
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return formatDateParts(year, month, day);
}

/**
 * 年月日からYYYY-MM-DD形式の文字列を生成する。
 */
function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 指定された日付が土曜日または日曜日かどうかを判定する。
 */
function isWeekend(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * 祝日が土日に当たる場合の振替日を計算する。
 * 土曜日 → 金曜日に振替
 * 日曜日 → 月曜日に振替
 */
function getObservedDate(year: number, month: number, day: number): { month: number; day: number } {
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 6) {
    // 土曜日 → 金曜日
    const friday = new Date(date);
    friday.setDate(friday.getDate() - 1);
    return { month: friday.getMonth() + 1, day: friday.getDate() };
  }
  if (dayOfWeek === 0) {
    // 日曜日 → 月曜日
    const monday = new Date(date);
    monday.setDate(monday.getDate() + 1);
    return { month: monday.getMonth() + 1, day: monday.getDate() };
  }

  return { month, day };
}

/**
 * 祝日が日曜日に当たる場合のみ振替日を計算する。
 * 土曜日の場合は振替なし（年をまたぐ場合に対応するため）。
 * 日曜日 → 月曜日に振替
 *
 * @returns 振替日、または土曜日の場合はnull
 */
function getObservedDateNoSaturdayShift(
  year: number,
  month: number,
  day: number
): { month: number; day: number } | null {
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 6) {
    // 土曜日の場合は振替なし
    return null;
  }
  if (dayOfWeek === 0) {
    // 日曜日 → 月曜日
    const monday = new Date(date);
    monday.setDate(monday.getDate() + 1);
    return { month: monday.getMonth() + 1, day: monday.getDate() };
  }

  return { month, day };
}

/**
 * 指定された月のn番目の特定曜日の日を取得する。
 *
 * @param year 年
 * @param month 月（1-12）
 * @param weekday 曜日（0=日曜, 1=月曜, ..., 6=土曜）
 * @param n 何番目か（1-5）
 * @returns 日（1-31）
 */
function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay();

  // 最初の指定曜日までの日数
  let daysToAdd = weekday - firstDayOfWeek;
  if (daysToAdd < 0) {
    daysToAdd += 7;
  }

  // n番目の指定曜日
  const day = 1 + daysToAdd + (n - 1) * 7;
  return day;
}

/**
 * 指定された月の最後の特定曜日の日を取得する。
 *
 * @param year 年
 * @param month 月（1-12）
 * @param weekday 曜日（0=日曜, 1=月曜, ..., 6=土曜）
 * @returns 日（1-31）
 */
function getLastWeekdayOfMonth(year: number, month: number, weekday: number): number {
  // 翌月の1日から1日引いて月末を取得
  const lastDay = new Date(year, month, 0);
  const lastDayOfWeek = lastDay.getDay();

  // 最後の指定曜日までの日数
  let daysToSubtract = lastDayOfWeek - weekday;
  if (daysToSubtract < 0) {
    daysToSubtract += 7;
  }

  return lastDay.getDate() - daysToSubtract;
}

/**
 * 指定された年のイースターの日付を計算する（グレゴリオ暦）。
 * Anonymous Gregorian Algorithmを使用。
 *
 * @param year 年
 * @returns イースターの月と日
 */
function calculateEaster(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return { month, day };
}

/**
 * 指定された年の聖金曜日（Good Friday）を計算する。
 * イースターの2日前。
 *
 * @param year 年
 * @returns 聖金曜日の月と日
 */
function calculateGoodFriday(year: number): { month: number; day: number } {
  const easter = calculateEaster(year);
  const easterDate = new Date(year, easter.month - 1, easter.day);
  const goodFridayDate = new Date(easterDate);
  goodFridayDate.setDate(goodFridayDate.getDate() - 2);

  return {
    month: goodFridayDate.getMonth() + 1,
    day: goodFridayDate.getDate(),
  };
}
