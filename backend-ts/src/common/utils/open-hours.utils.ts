import { BadRequestException } from '@nestjs/common';

export const DEFAULT_VENUE_OPEN_HOURS = '08:00-22:00';

type OpenHoursRule = {
  days: number[];
  startMinutes: number;
  endMinutes: number;
  crossDay: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const CHINESE_DAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};
const ENGLISH_DAY_MAP: Record<string, number> = {
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
  sun: 0,
  sunday: 0,
};

const DAILY_PATTERN =
  /(每天|每日|全天|24\s*小时|all\s*day|every\s*day|daily|always)/i;
const WEEKDAY_PATTERN =
  /(工作日|周一至周五|周一到周五|星期一至星期五|weekday|weekdays)/i;
const WEEKEND_PATTERN =
  /(周末|双休日|周六至周日|周六到周日|星期六至星期日|weekend|weekends)/i;
const TIME_RANGE_PATTERN =
  /([01]?\d|2[0-4])[:：]([0-5]\d)\s*(?:到|至|-|~|～|—|–)\s*([01]?\d|2[0-4])[:：]([0-5]\d)/i;

function normalizeOpenHoursValue(input?: string | null): string {
  return String(input || '').trim();
}

function parseClockToMinutes(
  hourText: string,
  minuteText: string,
  allow24: boolean,
): number | null {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (minute < 0 || minute > 59) return null;

  if (hour === 24) {
    if (!allow24 || minute !== 0) return null;
    return 24 * 60;
  }
  if (hour < 0 || hour > 23) return null;
  return hour * 60 + minute;
}

function expandDayRange(startDay: number, endDay: number): number[] {
  if (startDay === endDay) return [startDay];
  const days: number[] = [startDay];
  let cursor = startDay;
  for (let guard = 0; guard < 7; guard += 1) {
    cursor = (cursor + 1) % 7;
    days.push(cursor);
    if (cursor === endDay) break;
  }
  return days;
}

function normalizeEnglishDayToken(token: string): string {
  return String(token || '').trim().toLowerCase();
}

function parseDaySet(segment: string): Set<number> {
  const days = new Set<number>();
  const text = String(segment || '');

  if (DAILY_PATTERN.test(text)) {
    ALL_DAYS.forEach((day) => days.add(day));
    return days;
  }

  if (WEEKDAY_PATTERN.test(text)) {
    [1, 2, 3, 4, 5].forEach((day) => days.add(day));
  }
  if (WEEKEND_PATTERN.test(text)) {
    [0, 6].forEach((day) => days.add(day));
  }

  const cnRangeRe =
    /(?:周|星期)\s*([一二三四五六日天])\s*(?:到|至|-|~|～|—|–)\s*(?:周|星期)?\s*([一二三四五六日天])/g;
  let cnRangeMatch: RegExpExecArray | null;
  while ((cnRangeMatch = cnRangeRe.exec(text)) !== null) {
    const startDay = CHINESE_DAY_MAP[cnRangeMatch[1]];
    const endDay = CHINESE_DAY_MAP[cnRangeMatch[2]];
    if (startDay === undefined || endDay === undefined) continue;
    expandDayRange(startDay, endDay).forEach((day) => days.add(day));
  }

  const enRangeRe =
    /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b\s*(?:to|到|至|-|~|～|—|–)\s*\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi;
  let enRangeMatch: RegExpExecArray | null;
  while ((enRangeMatch = enRangeRe.exec(text)) !== null) {
    const startToken = normalizeEnglishDayToken(enRangeMatch[1]);
    const endToken = normalizeEnglishDayToken(enRangeMatch[2]);
    const startDay = ENGLISH_DAY_MAP[startToken];
    const endDay = ENGLISH_DAY_MAP[endToken];
    if (startDay === undefined || endDay === undefined) continue;
    expandDayRange(startDay, endDay).forEach((day) => days.add(day));
  }

  const cnSingleRe = /(?:周|星期)\s*([一二三四五六日天])/g;
  let cnSingleMatch: RegExpExecArray | null;
  while ((cnSingleMatch = cnSingleRe.exec(text)) !== null) {
    const day = CHINESE_DAY_MAP[cnSingleMatch[1]];
    if (day !== undefined) days.add(day);
  }

  const enSingleRe =
    /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi;
  let enSingleMatch: RegExpExecArray | null;
  while ((enSingleMatch = enSingleRe.exec(text)) !== null) {
    const token = normalizeEnglishDayToken(enSingleMatch[1]);
    const day = ENGLISH_DAY_MAP[token];
    if (day !== undefined) days.add(day);
  }

  return days;
}

function parseSegment(segment: string): OpenHoursRule | null {
  const text = String(segment || '').trim();
  if (!text) return null;

  const timeMatch = text.match(TIME_RANGE_PATTERN);
  const daySet = parseDaySet(text);

  let startMinutes = 0;
  let endMinutes = 24 * 60;

  if (timeMatch) {
    const parsedStart = parseClockToMinutes(timeMatch[1], timeMatch[2], false);
    const parsedEnd = parseClockToMinutes(timeMatch[3], timeMatch[4], true);
    if (parsedStart === null || parsedEnd === null) {
      throw new BadRequestException('open_hours has invalid time range');
    }
    startMinutes = parsedStart;
    endMinutes = parsedEnd;
    if (startMinutes === endMinutes) {
      startMinutes = 0;
      endMinutes = 24 * 60;
    }
  } else if (daySet.size === 0 && !DAILY_PATTERN.test(text)) {
    throw new BadRequestException('open_hours has invalid format');
  }

  const days = daySet.size > 0 ? Array.from(daySet).sort() : [...ALL_DAYS];
  const crossDay = endMinutes < startMinutes;
  return {
    days,
    startMinutes,
    endMinutes,
    crossDay,
  };
}

function parseRulesStrict(openHours: string): OpenHoursRule[] {
  const parts = openHours
    .split(/[;\n；]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new BadRequestException('open_hours is empty');
  }

  const rules: OpenHoursRule[] = [];
  for (const part of parts) {
    const parsed = parseSegment(part);
    if (parsed) {
      rules.push(parsed);
    }
  }
  if (rules.length === 0) {
    throw new BadRequestException('open_hours is invalid');
  }
  return rules;
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

function buildOpenWindows(
  rules: OpenHoursRule[],
  start: Date,
  end: Date,
): Array<{ start: number; end: number }> {
  const windows: Array<{ start: number; end: number }> = [];
  const cursorStart = startOfLocalDay(new Date(start.getTime() - DAY_MS));
  const cursorEnd = startOfLocalDay(new Date(end.getTime() + DAY_MS));

  for (
    let cursor = new Date(cursorStart);
    cursor.getTime() <= cursorEnd.getTime();
    cursor = addDays(cursor, 1)
  ) {
    const day = cursor.getDay();
    for (const rule of rules) {
      if (!rule.days.includes(day)) continue;
      const windowStart = cursor.getTime() + rule.startMinutes * 60 * 1000;
      const windowEnd = rule.crossDay
        ? addDays(cursor, 1).getTime() + rule.endMinutes * 60 * 1000
        : cursor.getTime() + rule.endMinutes * 60 * 1000;
      windows.push({ start: windowStart, end: windowEnd });
    }
  }

  windows.sort((a, b) => a.start - b.start);
  return windows;
}

function isIntervalCoveredByWindows(
  intervalStart: number,
  intervalEnd: number,
  windows: Array<{ start: number; end: number }>,
): boolean {
  let cursor = intervalStart;
  for (const window of windows) {
    if (window.end <= cursor) continue;
    if (window.start > cursor) break;
    cursor = Math.max(cursor, window.end);
    if (cursor >= intervalEnd) {
      return true;
    }
  }
  return false;
}

export function normalizeAndValidateOpenHoursForStorage(
  input?: string | null,
): string {
  const normalized = normalizeOpenHoursValue(input);
  if (!normalized) return '';
  try {
    parseRulesStrict(normalized);
    return normalized;
  } catch {
    throw new BadRequestException(
      'open_hours 格式无效。示例：08:00-22:00；周一至周五 08:00-22:00；周六至周日 09:00-18:00',
    );
  }
}

export function isReservationWithinVenueOpenHours(
  start: Date,
  end: Date,
  openHoursRaw?: string | null,
): boolean {
  if (end.getTime() <= start.getTime()) {
    return false;
  }

  const normalized = normalizeOpenHoursValue(openHoursRaw);
  const effectiveSpec = normalized || DEFAULT_VENUE_OPEN_HOURS;
  let rules: OpenHoursRule[];
  try {
    rules = parseRulesStrict(effectiveSpec);
  } catch {
    // Keep backward compatibility for historical free-text values.
    return true;
  }

  const windows = buildOpenWindows(rules, start, end);
  return isIntervalCoveredByWindows(start.getTime(), end.getTime(), windows);
}

