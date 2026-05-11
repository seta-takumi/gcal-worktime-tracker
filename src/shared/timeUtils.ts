import { LUNCH_KEYWORD, ROUND_MINUTES } from "./constants";
import type { CalendarEvent, Interval } from "./types";

export function getWorkDayNumbers(weekStartDay = 1): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7).filter(
    (dow) => dow !== 0 && dow !== 6,
  );
}

export function getWeekStart(date: Date, weekStartDay = 1): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const daysBack = (d.getDay() - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - daysBack);
  return d;
}

export function getMultiWeekDays(date: Date, weekStartDay = 1, count = 1): Date[][] {
  const weekStart = getWeekStart(date, weekStartDay);
  const weeks: Date[][] = [];
  for (let i = 0; i < count; i++) {
    const start = new Date(weekStart);
    start.setDate(weekStart.getDate() + i * 7);
    weeks.push(buildWorkWeekDays(start));
  }
  return weeks;
}

export function getTargetWeek(
  date: Date,
  weekStartDay = 1,
): { isWeekend: boolean; weekDays: Date[] } {
  const today = new Date(date);
  today.setHours(0, 0, 0, 0);

  const dayOfWeek = today.getDay();
  const daysBack = (dayOfWeek - weekStartDay + 7) % 7;
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - daysBack);

  const thisWeekDays = buildWorkWeekDays(thisWeekStart);
  const remainingThisWeek = thisWeekDays.filter((d) => d >= today);

  if (remainingThisWeek.length > 0) {
    const isNonWorkDay = !thisWeekDays.some((d) => d.getTime() === today.getTime());
    return { isWeekend: isNonWorkDay, weekDays: thisWeekDays };
  }

  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setDate(thisWeekStart.getDate() + 7);
  return { isWeekend: true, weekDays: buildWorkWeekDays(nextWeekStart) };
}

function buildWorkWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  }).filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
}

export function getWriteTargetDays(weekDays: Date[], today: Date): Date[] {
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  return weekDays.filter((d) => d >= todayStart);
}

export function parseLocalTime(timeStr: string, baseDate: Date): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [sorted[0]];
  for (const iv of sorted.slice(1)) {
    const last = merged.at(-1)!;
    if (iv.start <= last.end) {
      last.end = new Date(Math.max(last.end.getTime(), iv.end.getTime()));
    } else {
      merged.push({ start: iv.start, end: iv.end });
    }
  }
  return merged;
}

export function calcWorkableMinutes(
  events: CalendarEvent[],
  workStart: Date,
  workEnd: Date,
  excludeKeywords: string[] = [],
): number {
  const workDurationMs = workEnd.getTime() - workStart.getTime();
  const busyIntervals = buildBusyIntervals(events, workStart, workEnd, excludeKeywords);
  const merged = mergeIntervals(busyIntervals);
  const busyMs = merged.reduce((sum, iv) => sum + (iv.end.getTime() - iv.start.getTime()), 0);
  return Math.floor(Math.max(0, workDurationMs - busyMs) / 60000);
}

function buildBusyIntervals(
  events: CalendarEvent[],
  workStart: Date,
  workEnd: Date,
  excludeKeywords: string[] = [],
): Interval[] {
  const intervals: Interval[] = [];
  for (const ev of events) {
    if (isAllDayEvent(ev)) continue;
    const title = (ev.summary ?? "").toLowerCase();
    const isLunch = title.includes(LUNCH_KEYWORD);
    if (excludeKeywords.some((kw) => title.includes(kw.toLowerCase()))) continue;
    if (ev.transparency === "transparent" && !isLunch) continue;
    if (!isLunch && !isSelfAccepted(ev)) continue;

    const evStart = new Date(ev.start.dateTime!);
    const evEnd = new Date(ev.end.dateTime!);
    const overlapStart = new Date(Math.max(evStart.getTime(), workStart.getTime()));
    const overlapEnd = new Date(Math.min(evEnd.getTime(), workEnd.getTime()));

    if (overlapStart < overlapEnd) {
      intervals.push({ start: overlapStart, end: overlapEnd });
    }
  }
  return intervals;
}

function isSelfAccepted(ev: CalendarEvent): boolean {
  if (!ev.attendees || ev.attendees.length === 0) return true;
  const self = ev.attendees.find((a) => a.self === true);
  if (!self) return true;
  return self.responseStatus === "accepted";
}

function isAllDayEvent(ev: CalendarEvent): boolean {
  return Boolean(ev.start.date && !ev.start.dateTime);
}

export function hasNonExtensionAllDayEvent(events: CalendarEvent[]): boolean {
  return events.some((ev) => {
    if (!isAllDayEvent(ev)) return false;
    if (ev.transparency === "transparent") return false;
    if (ev.eventType === "workingLocation") return false;
    if (ev.eventType === "outOfOffice") return false;
    const props = ev.extendedProperties?.private;
    return !props?.workHoursExtension;
  });
}

export function hasOooOnDate(allEvents: CalendarEvent[], dateStr: string): boolean {
  return allEvents.some((ev) => {
    if (ev.eventType !== "outOfOffice") return false;
    if (ev.start.date) {
      return ev.start.date <= dateStr && dateStr < ev.end.date!;
    }
    const startDateStr = toDateString(new Date(ev.start.dateTime!));
    const endDateStr = toDateString(new Date(ev.end.dateTime!));
    return startDateStr <= dateStr && dateStr < endDateStr;
  });
}

export function floorToFiveMinutes(minutes: number): number {
  return Math.floor(minutes / ROUND_MINUTES) * ROUND_MINUTES;
}

export function formatWorkable(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

export function calcRemainingWorkable(
  events: CalendarEvent[],
  workStart: Date,
  workEnd: Date,
  now: Date,
  excludeKeywords: string[] = [],
): number {
  if (now >= workEnd) return 0;
  const effectiveStart = now < workStart ? workStart : now;
  const busyIntervals = buildBusyIntervals(events, effectiveStart, workEnd, excludeKeywords);
  const merged = mergeIntervals(busyIntervals);
  const busyMs = merged.reduce((sum, iv) => sum + (iv.end.getTime() - iv.start.getTime()), 0);
  return Math.floor(Math.max(0, workEnd.getTime() - effectiveStart.getTime() - busyMs) / 60000);
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dayTimeRange(dateStr: string): { timeMin: string; timeMax: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

export function weekTimeRange(weekDays: Date[]): { timeMin: string; timeMax: string } {
  const monday = weekDays[0];
  const friday = weekDays[weekDays.length - 1];
  const timeMin = new Date(monday);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(friday);
  timeMax.setHours(23, 59, 59, 999);
  return { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() };
}

export function groupEventsByDate(events: CalendarEvent[]): Partial<Record<string, CalendarEvent[]>> {
  return Object.groupBy(events, (ev) =>
    ev.start.dateTime ? toDateString(new Date(ev.start.dateTime)) : ev.start.date!,
  );
}
