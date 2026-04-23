import { WORK_HOURS_EXTENSION_KEY, WORK_HOURS_EXTENSION_VALUE } from "./constants.js";

const BASE_URL = "https://www.googleapis.com/calendar/v3";

/**
 * OAuth2 トークンを取得する。
 */
export async function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * キャッシュ済みトークンを削除する（401 時に使用）。
 */
async function removeCachedAuthToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

/**
 * 指数バックオフ付きで fetch を実行する。
 */
async function fetchWithRetry(url, options, retries = 3) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status >= 500) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      const delay = Math.pow(2, i) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * カレンダーイベント一覧を取得する。
 */
export async function fetchEvents(token, timeMin, timeMax, extraParams = {}) {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin,
    timeMax,
    ...extraParams,
  });
  const url = `${BASE_URL}/calendars/primary/events?${params}`;

  let res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    await removeCachedAuthToken(token);
    const newToken = await getAuthToken(false);
    res = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
  }

  if (!res.ok) {
    throw new Error(`fetchEvents failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  let items = data.items || [];

  // ページネーション
  let pageToken = data.nextPageToken;
  while (pageToken) {
    const pagedParams = new URLSearchParams({ ...Object.fromEntries(params), pageToken });
    const pagedRes = await fetchWithRetry(url.split("?")[0] + `?${pagedParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pagedRes.ok) break;
    const pagedData = await pagedRes.json();
    items = items.concat(pagedData.items || []);
    pageToken = pagedData.nextPageToken;
  }

  return items;
}

/**
 * 拡張機能が作成した終日予定のみを取得する。
 */
export async function listExtensionEvents(token, timeMin, timeMax) {
  return fetchEvents(token, timeMin, timeMax, {
    privateExtendedProperty: `${WORK_HOURS_EXTENSION_KEY}=${WORK_HOURS_EXTENSION_VALUE}`,
  });
}

/**
 * 終日予定を作成する。
 */
export async function createEvent(token, dateStr, title) {
  const body = buildEventBody(dateStr, title);
  const res = await fetchWithRetry(`${BASE_URL}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createEvent failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * 終日予定を更新する。
 */
export async function updateEvent(token, eventId, dateStr, title) {
  const body = buildEventBody(dateStr, title);
  const res = await fetchWithRetry(`${BASE_URL}/calendars/primary/events/${eventId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateEvent failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * イベントを削除する。
 */
export async function deleteEvent(token, eventId) {
  const res = await fetchWithRetry(`${BASE_URL}/calendars/primary/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteEvent failed: HTTP ${res.status}`);
  }
}

function buildEventBody(dateStr, title) {
  return {
    summary: title,
    start: { date: dateStr },
    end: { date: dateStr },
    extendedProperties: {
      private: {
        [WORK_HOURS_EXTENSION_KEY]: WORK_HOURS_EXTENSION_VALUE,
      },
    },
  };
}
