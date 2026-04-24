import {
  DEFAULT_WORKING_HOURS,
  DEFAULT_WEEK_START_DAY,
  STORAGE_KEY_WORKING_HOURS,
  STORAGE_KEY_WEEK_START_DAY,
  STORAGE_KEY_EXCLUDE_KEYWORDS,
  STORAGE_KEY_CACHE,
  MSG_TRIGGER_WEEKLY_UPDATE,
  MSG_GET_TODAY_REMAINING,
  ERR_AUTH_REQUIRED,
  ERR_API_ERROR,
  ERR_NETWORK_ERROR,
} from "../shared/constants.js";
import {
  getTargetWeek,
  getWorkDayNumbers,
  getWriteTargetDays,
  parseLocalTime,
  calcWorkableMinutes,
  calcRemainingWorkable,
  hasNonExtensionAllDayEvent,
  floorToFiveMinutes,
  formatWorkable,
  toDateString,
  weekTimeRange,
  dayTimeRange,
  groupEventsByDate,
} from "../shared/timeUtils.js";
import {
  getAuthToken,
  fetchEvents,
  listExtensionEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from "../shared/calendarApi.js";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === MSG_TRIGGER_WEEKLY_UPDATE) {
    handleWeeklyUpdate().then(sendResponse).catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
  if (msg.type === MSG_GET_TODAY_REMAINING) {
    handleGetTodayRemaining().then(sendResponse).catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
});

async function getWorkingHours() {
  const data = await chrome.storage.sync.get(STORAGE_KEY_WORKING_HOURS);
  const wh = data[STORAGE_KEY_WORKING_HOURS] || DEFAULT_WORKING_HOURS;
  if (!isValidWorkingHours(wh)) return DEFAULT_WORKING_HOURS;
  return wh;
}

async function getWeekStartDay() {
  const data = await chrome.storage.sync.get(STORAGE_KEY_WEEK_START_DAY);
  const val = data[STORAGE_KEY_WEEK_START_DAY];
  const parsed = Number(val);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) return parsed;
  return DEFAULT_WEEK_START_DAY;
}

async function getExcludeKeywords() {
  const data = await chrome.storage.sync.get(STORAGE_KEY_EXCLUDE_KEYWORDS);
  const raw = data[STORAGE_KEY_EXCLUDE_KEYWORDS];
  if (!Array.isArray(raw)) return [];
  return raw.filter((kw) => typeof kw === "string" && kw.trim() !== "");
}

function isValidWorkingHours(wh) {
  if (!wh?.start || !wh?.end) return false;
  const [sh, sm] = wh.start.split(":").map(Number);
  const [eh, em] = wh.end.split(":").map(Number);
  return sh * 60 + sm < eh * 60 + em;
}

async function handleWeeklyUpdate() {
  const now = new Date();
  const weekStartDay = await getWeekStartDay();
  const { isWeekend, weekDays } = getTargetWeek(now, weekStartDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const writeDays = getWriteTargetDays(weekDays, today);
  console.log("[gwt] handleWeeklyUpdate start", { isWeekend, writeDays: writeDays.map(toDateString) });

  let token;
  try {
    token = await getAuthToken();
    console.log("[gwt] auth ok");
  } catch (err) {
    console.error("[gwt] auth failed", err);
    throw Object.assign(new Error(ERR_AUTH_REQUIRED), { cause: err });
  }

  const { timeMin, timeMax } = weekTimeRange(weekDays);
  console.log("[gwt] fetching events", { timeMin, timeMax });

  let allEvents;
  try {
    allEvents = await fetchEvents(token, timeMin, timeMax);
    console.log("[gwt] fetched events count:", allEvents.length);
  } catch (err) {
    console.error("[gwt] fetchEvents failed", err);
    throw Object.assign(new Error(ERR_API_ERROR), { cause: err });
  }

  const eventsByDate = groupEventsByDate(allEvents);
  const workingHours = await getWorkingHours();
  const excludeKeywords = await getExcludeKeywords();
  console.log("[gwt] workingHours:", workingHours);

  const cacheResult = {};

  for (const day of writeDays) {
    const dateStr = toDateString(day);
    const dayEvents = eventsByDate[dateStr] || [];
    console.log(`[gwt] processing ${dateStr}, events:`, dayEvents.length);

    const { timeMin: dMin, timeMax: dMax } = dayTimeRange(dateStr);
    let extEvents;
    try {
      extEvents = await listExtensionEvents(token, dMin, dMax);
      console.log(`[gwt] ${dateStr} extEvents:`, extEvents.length);
    } catch (err) {
      console.warn(`[gwt] ${dateStr} listExtensionEvents failed`, err);
      extEvents = [];
    }

    const hasHoliday = hasNonExtensionAllDayEvent(dayEvents);
    console.log(`[gwt] ${dateStr} hasHoliday:`, hasHoliday);

    if (hasHoliday) {
      for (const ev of extEvents) {
        await deleteEvent(token, ev.id).catch(() => {});
      }
      cacheResult[dateStr] = { workableMinutes: 0, skipped: true };
      continue;
    }

    const workStart = parseLocalTime(workingHours.start, day);
    const workEnd = parseLocalTime(workingHours.end, day);

    const rawMinutes = calcWorkableMinutes(dayEvents, workStart, workEnd, excludeKeywords);
    const workableMinutes = floorToFiveMinutes(rawMinutes);
    const title = `🧑‍💻 作業可能 ${formatWorkable(workableMinutes)}`;
    console.log(`[gwt] ${dateStr} workable: ${workableMinutes}min, title: ${title}`);

    try {
      if (extEvents.length === 0) {
        await createEvent(token, dateStr, title);
        console.log(`[gwt] ${dateStr} created`);
      } else if (extEvents.length === 1) {
        await updateEvent(token, extEvents[0].id, dateStr, title);
        console.log(`[gwt] ${dateStr} updated`);
      } else {
        await updateEvent(token, extEvents[0].id, dateStr, title);
        for (const ev of extEvents.slice(1)) {
          await deleteEvent(token, ev.id).catch(() => {});
        }
        console.log(`[gwt] ${dateStr} updated + deleted duplicates`);
      }
    } catch (err) {
      console.error(`[gwt] ${dateStr} write failed`, err);
    }

    cacheResult[dateStr] = { workableMinutes, skipped: false };
  }

  const weekKey = toDateString(weekDays[0]);
  await chrome.storage.local.set({
    [STORAGE_KEY_CACHE]: {
      weekKey,
      updatedAt: Date.now(),
      days: cacheResult,
    },
  });

  console.log("[gwt] handleWeeklyUpdate done", cacheResult);
  return { ok: true };
}

async function handleGetTodayRemaining() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const weekStartDay = await getWeekStartDay();
  const workDayNumbers = getWorkDayNumbers(weekStartDay);
  const isNonWorkDay = !workDayNumbers.includes(dayOfWeek);

  if (isNonWorkDay) {
    return { ok: true, isWeekend: true, minutes: 0, fromCache: false };
  }

  const workingHours = await getWorkingHours();
  const workStart = parseLocalTime(workingHours.start, now);
  const workEnd = parseLocalTime(workingHours.end, now);

  const isAfterWork = now >= workEnd;
  if (isAfterWork) {
    return { ok: true, isAfterWork: true, minutes: 0, fromCache: false };
  }

  let token;
  try {
    token = await getAuthToken(false);
  } catch {
    return await getCachedTodayResult(now, ERR_AUTH_REQUIRED);
  }

  const dateStr = toDateString(now);
  const { timeMin, timeMax } = dayTimeRange(dateStr);

  let events;
  try {
    events = await fetchEvents(token, timeMin, timeMax);
  } catch (err) {
    const isNetwork = err.message.includes("fetch");
    return await getCachedTodayResult(now, isNetwork ? ERR_NETWORK_ERROR : ERR_API_ERROR);
  }

  const isHoliday = hasNonExtensionAllDayEvent(events);
  if (isHoliday) {
    return { ok: true, isHoliday: true, minutes: 0, fromCache: false };
  }

  const excludeKeywords = await getExcludeKeywords();
  const rawMinutes = calcRemainingWorkable(events, workStart, workEnd, now, excludeKeywords);
  const minutes = floorToFiveMinutes(rawMinutes);

  return { ok: true, minutes, isWeekend: false, isHoliday: false, isAfterWork: false, fromCache: false };
}

async function getCachedTodayResult(now, error) {
  const data = await chrome.storage.local.get(STORAGE_KEY_CACHE);
  const cache = data[STORAGE_KEY_CACHE];
  const dateStr = toDateString(now);

  if (cache?.days?.[dateStr] !== undefined) {
    const cached = cache.days[dateStr];
    return {
      ok: false,
      error,
      minutes: cached.workableMinutes,
      isHoliday: cached.skipped,
      fromCache: true,
    };
  }

  return { ok: false, error, minutes: null, fromCache: false };
}
