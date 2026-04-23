import { LUNCH_KEYWORD, ROUND_MINUTES } from "./constants.js";

/**
 * 指定日が属する対象週（月〜金）の Date 配列を返す。
 * 土日の場合は翌週の月〜金を返す。
 */
export function getTargetWeek(date) {
  const day = date.getDay(); // 0=日, 1=月, ..., 6=土
  const isWeekend = day === 0 || day === 6;

  const monday = new Date(date);
  if (day === 0) {
    // 日曜: 翌日が月曜
    monday.setDate(date.getDate() + 1);
  } else if (day === 6) {
    // 土曜: +2日が月曜
    monday.setDate(date.getDate() + 2);
  } else {
    // 平日: 今週の月曜
    monday.setDate(date.getDate() - (day - 1));
  }
  monday.setHours(0, 0, 0, 0);

  return { isWeekend, weekDays: buildWeekDays(monday) };
}

function buildWeekDays(monday) {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/**
 * 対象週の日付配列から today 以降の日のみを返す。
 */
export function getWriteTargetDays(weekDays, today) {
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  return weekDays.filter((d) => d >= todayStart);
}

/**
 * "HH:mm" 形式の文字列と基準 Date から、その日のローカル時刻 Date を生成する。
 */
export function parseLocalTime(timeStr, baseDate) {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * 重複するインターバルをマージする。
 * @param {Array<{start: Date, end: Date}>} intervals
 * @returns {Array<{start: Date, end: Date}>}
 */
export function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = new Date(Math.max(last.end, sorted[i].end));
    } else {
      merged.push({ start: sorted[i].start, end: sorted[i].end });
    }
  }
  return merged;
}

/**
 * イベント一覧と就業時間帯から作業可能分数を計算する。
 * @param {Array} events Google Calendar イベントオブジェクトの配列（1日分）
 * @param {Date} workStart 就業開始 Date
 * @param {Date} workEnd 就業終了 Date
 * @returns {number} 作業可能分数（0以上）
 */
export function calcWorkableMinutes(events, workStart, workEnd) {
  const workDurationMs = workEnd - workStart;

  const busyIntervals = buildBusyIntervals(events, workStart, workEnd);
  const merged = mergeIntervals(busyIntervals);

  const busyMs = merged.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
  const workableMs = Math.max(0, workDurationMs - busyMs);
  return Math.floor(workableMs / 60000);
}

/**
 * 就業時間帯内の busy 区間を構築する。
 */
function buildBusyIntervals(events, workStart, workEnd) {
  const intervals = [];
  for (const ev of events) {
    if (isAllDayEvent(ev)) continue;
    const title = (ev.summary || "").toLowerCase();
    const isLunch = title.includes(LUNCH_KEYWORD);
    // lunch は transparent でも差し引く（休憩扱い）
    if (ev.transparency === "transparent" && !isLunch) continue;
    // 「参加」していない会議は差し引かない（lunch は参加判定をスキップ）
    if (!isLunch && !isSelfAccepted(ev)) continue;

    const evStart = new Date(ev.start.dateTime);
    const evEnd = new Date(ev.end.dateTime);

    const overlapStart = new Date(Math.max(evStart, workStart));
    const overlapEnd = new Date(Math.min(evEnd, workEnd));

    if (overlapStart < overlapEnd) {
      intervals.push({ start: overlapStart, end: overlapEnd });
    }
  }
  return intervals;
}

/**
 * 自分が「参加」(accepted) しているイベントか判定する。
 * attendees がない（自分だけの予定）場合は参加とみなす。
 */
function isSelfAccepted(ev) {
  if (!ev.attendees || ev.attendees.length === 0) return true;
  const self = ev.attendees.find((a) => a.self === true);
  if (!self) return true;
  return self.responseStatus === "accepted";
}

/**
 * 終日イベントかどうか判定する。
 */
function isAllDayEvent(ev) {
  return Boolean(ev.start.date && !ev.start.dateTime);
}

/**
 * その日のイベント一覧に終日予定（祝日・OOO 等）が含まれるか判定する。
 * 拡張機能が作成した終日予定は除外する。
 */
export function hasNonExtensionAllDayEvent(events) {
  return events.some((ev) => {
    if (!isAllDayEvent(ev)) return false;
    if (ev.transparency === "transparent") return false;
    if (ev.eventType === "workingLocation") return false;
    const props = ev.extendedProperties?.private;
    return !props?.workHoursExtension;
  });
}

/**
 * 5 分単位で切り下げる。
 */
export function floorToFiveMinutes(minutes) {
  return Math.floor(minutes / ROUND_MINUTES) * ROUND_MINUTES;
}

/**
 * 分数を "6h30m"、"7h"、"30m"、"0h" 形式に変換する。
 */
export function formatWorkable(minutes) {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

/**
 * ポップアップ用: 現在時刻以降の残り作業可能時間を計算する。
 * @param {Array} events 1日分のイベント
 * @param {Date} workStart
 * @param {Date} workEnd
 * @param {Date} now 現在時刻
 * @returns {number} 残り作業可能分数
 */
export function calcRemainingWorkable(events, workStart, workEnd, now) {
  if (now >= workEnd) return 0;
  const effectiveStart = now < workStart ? workStart : now;
  const busyIntervals = buildBusyIntervals(events, effectiveStart, workEnd);
  const merged = mergeIntervals(busyIntervals);
  const busyMs = merged.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
  const remainMs = Math.max(0, (workEnd - effectiveStart) - busyMs);
  return Math.floor(remainMs / 60000);
}

/**
 * YYYY-MM-DD 形式の文字列を返す（ローカル時刻ベース）。
 */
export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 日付文字列 "YYYY-MM-DD" から対象日の timeMin/timeMax（RFC 3339）を生成する。
 */
export function dayTimeRange(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

/**
 * 対象週の timeMin（月曜 00:00）と timeMax（金曜 23:59）を生成する。
 */
export function weekTimeRange(weekDays) {
  const monday = weekDays[0];
  const friday = weekDays[4];
  const timeMin = new Date(monday);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(friday);
  timeMax.setHours(23, 59, 59, 999);
  return { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() };
}

/**
 * イベント一覧を日付文字列（"YYYY-MM-DD"）でグループ化する。
 */
export function groupEventsByDate(events) {
  const map = {};
  for (const ev of events) {
    const dateStr = ev.start.dateTime
      ? toDateString(new Date(ev.start.dateTime))
      : ev.start.date;
    if (!map[dateStr]) map[dateStr] = [];
    map[dateStr].push(ev);
  }
  return map;
}
