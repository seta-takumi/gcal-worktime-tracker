import { LUNCH_KEYWORD, ROUND_MINUTES } from "./constants.js";

/**
 * 週開始曜日から7日間のうち土日以外の曜日番号配列を返す。
 * 例: weekStartDay=3（水）→ [3,4,5,1,2]（水木金月火）
 */
export function getWorkDayNumbers(weekStartDay = 1) {
  const result = [];
  for (let i = 0; i < 7; i++) {
    const dow = (weekStartDay + i) % 7;
    if (dow !== 0 && dow !== 6) result.push(dow);
  }
  return result;
}

/**
 * 指定日が属する週の開始日（weekStartDay 曜日）を返す。
 */
export function getWeekStart(date, weekStartDay = 1) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const daysBack = (d.getDay() - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - daysBack);
  return d;
}

/**
 * 指定日が属する週から count 週分の weekDays 配列を返す。
 * 各要素は buildWorkWeekDays が返す平日 Date 配列。
 */
export function getMultiWeekDays(date, weekStartDay = 1, count = 1) {
  const weekStart = getWeekStart(date, weekStartDay);
  const weeks = [];
  for (let i = 0; i < count; i++) {
    const start = new Date(weekStart);
    start.setDate(weekStart.getDate() + i * 7);
    weeks.push(buildWorkWeekDays(start));
  }
  return weeks;
}

/**
 * 指定日が属する対象週の Date 配列を返す。
 * 週の開始曜日は weekStartDay で指定（デフォルト: 1=月曜）。
 * 対象日は週開始曜日から7日間のうち土日以外の5日間。
 * 今週の残り対象日がなければ翌週を返す。
 */
export function getTargetWeek(date, weekStartDay = 1) {
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

function buildWorkWeekDays(weekStart) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(d);
  }
  return days;
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
 * @param {string[]} [excludeKeywords] タイトルに含まれる場合に除外するキーワード
 * @returns {number} 作業可能分数（0以上）
 */
export function calcWorkableMinutes(events, workStart, workEnd, excludeKeywords = []) {
  const workDurationMs = workEnd - workStart;

  const busyIntervals = buildBusyIntervals(events, workStart, workEnd, excludeKeywords);
  const merged = mergeIntervals(busyIntervals);

  const busyMs = merged.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
  const workableMs = Math.max(0, workDurationMs - busyMs);
  return Math.floor(workableMs / 60000);
}

/**
 * 就業時間帯内の busy 区間を構築する。
 */
function buildBusyIntervals(events, workStart, workEnd, excludeKeywords = []) {
  const intervals = [];
  for (const ev of events) {
    if (isAllDayEvent(ev)) continue;
    const title = (ev.summary || "").toLowerCase();
    const isLunch = title.includes(LUNCH_KEYWORD);
    if (excludeKeywords.some((kw) => title.includes(kw.toLowerCase()))) continue;
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
 * @param {string[]} [excludeKeywords] タイトルに含まれる場合に除外するキーワード
 * @returns {number} 残り作業可能分数
 */
export function calcRemainingWorkable(events, workStart, workEnd, now, excludeKeywords = []) {
  if (now >= workEnd) return 0;
  const effectiveStart = now < workStart ? workStart : now;
  const busyIntervals = buildBusyIntervals(events, effectiveStart, workEnd, excludeKeywords);
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
 * 対象週の timeMin（週初日 00:00）と timeMax（週末日 23:59）を生成する。
 */
export function weekTimeRange(weekDays) {
  const monday = weekDays[0];
  const friday = weekDays[weekDays.length - 1];
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
