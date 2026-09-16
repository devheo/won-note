/**
 * WonBee (원비) - 100% Offline Korean Holidays & Calendar Utilities
 * Computes official Korean national holidays & observance days completely offline.
 */

export interface HolidayInfo {
  date: string; // YYYY-MM-DD
  name: string;
  isHoliday: boolean; // True for legal public holidays (red days)
}

// Precomputed major Lunar holidays for 2024 - 2030 (Solar calendar dates)
const LUNAR_HOLIDAYS_MAP: Record<string, string> = {
  // 2024
  '2024-02-09': '설날 연휴',
  '2024-02-10': '설날',
  '2024-02-11': '설날 연휴',
  '2024-02-12': '대체공휴일(설날)',
  '2024-05-15': '부처님오신날',
  '2024-09-16': '추석 연휴',
  '2024-09-17': '추석',
  '2024-09-18': '추석 연휴',

  // 2025
  '2025-01-28': '설날 연휴',
  '2025-01-29': '설날',
  '2025-01-30': '설날 연휴',
  '2025-05-05': '부처님오신날/어린이날',
  '2025-05-06': '대체공휴일',
  '2025-10-05': '추석 연휴',
  '2025-10-06': '추석',
  '2025-10-07': '추석 연휴',
  '2025-10-08': '대체공휴일(추석)',

  // 2026
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일(부처님오신날)',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',

  // 2027
  '2027-02-06': '설날 연휴',
  '2027-02-07': '설날',
  '2027-02-08': '설날 연휴',
  '2027-02-09': '대체공휴일(설날)',
  '2027-05-13': '부처님오신날',
  '2027-09-14': '추석 연휴',
  '2027-09-15': '추석',
  '2027-09-16': '추석 연휴',

  // 2028
  '2028-01-26': '설날 연휴',
  '2028-01-27': '설날',
  '2028-01-28': '설날 연휴',
  '2028-05-02': '부처님오신날',
  '2028-10-02': '추석 연휴',
  '2028-10-03': '추석/개천절',
  '2028-10-04': '추석 연휴',
  '2028-10-05': '대체공휴일(추석)',

  // 2029
  '2029-02-12': '설날 연휴',
  '2029-02-13': '설날',
  '2029-02-14': '설날 연휴',
  '2029-05-20': '부처님오신날',
  '2029-05-21': '대체공휴일(부처님오신날)',
  '2029-09-21': '추석 연휴',
  '2029-09-22': '추석',
  '2029-09-23': '추석 연휴',
  '2029-09-24': '대체공휴일(추석)',

  // 2030
  '2030-02-02': '설날 연휴',
  '2030-02-03': '설날',
  '2030-02-04': '설날 연휴',
  '2030-02-05': '대체공휴일(설날)',
  '2030-05-09': '부처님오신날',
  '2030-09-11': '추석 연휴',
  '2030-09-12': '추석',
  '2030-09-13': '추석 연휴',
};

// Fixed Solar Holidays in Korea (MM-DD)
const FIXED_SOLAR_HOLIDAYS: Record<string, { name: string; isHoliday: boolean }> = {
  '01-01': { name: '신정', isHoliday: true },
  '03-01': { name: '삼일절', isHoliday: true },
  '05-01': { name: '근로자의 날', isHoliday: false },
  '05-05': { name: '어린이날', isHoliday: true },
  '06-06': { name: '현충일', isHoliday: true },
  '08-15': { name: '광복절', isHoliday: true },
  '10-03': { name: '개천절', isHoliday: true },
  '10-09': { name: '한글날', isHoliday: true },
  '12-25': { name: '성탄절', isHoliday: true },
};

/**
 * Returns holiday information for a given YYYY-MM-DD date.
 */
export function getKoreanHoliday(dateStr: string): HolidayInfo | null {
  if (!dateStr || dateStr.length < 10) return null;

  // Check precomputed lunar holidays
  if (LUNAR_HOLIDAYS_MAP[dateStr]) {
    return {
      date: dateStr,
      name: LUNAR_HOLIDAYS_MAP[dateStr],
      isHoliday: true,
    };
  }

  const mmdd = dateStr.slice(5, 10);
  const fixed = FIXED_SOLAR_HOLIDAYS[mmdd];
  if (fixed) {
    return {
      date: dateStr,
      name: fixed.name,
      isHoliday: fixed.isHoliday,
    };
  }

  // Calculate substitute holiday (대체공휴일) for 어린이날, 광복절, 개천절, 한글날 if they fall on weekend
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const d = new Date(year, parseInt(monthStr, 10) - 1, parseInt(dayStr, 10));
  const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, 6 = Sat

  // If this Monday is substitute holiday for a weekend fixed holiday
  if (dayOfWeek === 1) {
    // Check previous Sunday (yesterday)
    const prevSun = new Date(d);
    prevSun.setDate(d.getDate() - 1);
    const sunMMDD = `${String(prevSun.getMonth() + 1).padStart(2, '0')}-${String(prevSun.getDate()).padStart(2, '0')}`;
    
    // Check previous Saturday (2 days ago)
    const prevSat = new Date(d);
    prevSat.setDate(d.getDate() - 2);
    const satMMDD = `${String(prevSat.getMonth() + 1).padStart(2, '0')}-${String(prevSat.getDate()).padStart(2, '0')}`;

    const eligibleForSubstitute = ['03-01', '05-05', '08-15', '10-03', '10-09', '12-25'];
    if (eligibleForSubstitute.includes(sunMMDD) && FIXED_SOLAR_HOLIDAYS[sunMMDD]) {
      return {
        date: dateStr,
        name: `대체공휴일(${FIXED_SOLAR_HOLIDAYS[sunMMDD].name})`,
        isHoliday: true,
      };
    }
    if (eligibleForSubstitute.includes(satMMDD) && FIXED_SOLAR_HOLIDAYS[satMMDD]) {
      return {
        date: dateStr,
        name: `대체공휴일(${FIXED_SOLAR_HOLIDAYS[satMMDD].name})`,
        isHoliday: true,
      };
    }
  }

  return null;
}
