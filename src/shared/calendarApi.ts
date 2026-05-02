import { WORK_HOURS_EXTENSION_KEY, WORK_HOURS_EXTENSION_VALUE } from "./constants";
import type { CalendarEvent } from "./types";

const BASE_URL = "https://www.googleapis.com/calendar/v3";

export async function getAuthToken(interactive = true): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message ?? "No token"));
      } else {
        resolve(token);
      }
    });
  });
}

async function removeCachedAuthToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  let lastError: Error = new Error("Unknown error");
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err as Error;
      await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
  throw lastError;
}

export async function fetchEvents(
  token: string,
  timeMin: string,
  timeMax: string,
  extraParams: Record<string, string> = {},
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin,
    timeMax,
    ...extraParams,
  });
  const baseUrl = `${BASE_URL}/calendars/primary/events`;
  const url = `${baseUrl}?${params}`;

  let res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 401) {
    await removeCachedAuthToken(token);
    const newToken = await getAuthToken(false);
    res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${newToken}` } });
  }

  if (!res.ok) throw new Error(`fetchEvents failed: HTTP ${res.status}`);

  const data = await res.json();
  let items: CalendarEvent[] = data.items ?? [];

  let pageToken: string | undefined = data.nextPageToken;
  while (pageToken) {
    const pagedRes = await fetchWithRetry(`${baseUrl}?${params}&pageToken=${encodeURIComponent(pageToken)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pagedRes.ok) break;
    const pagedData = await pagedRes.json();
    items = items.concat(pagedData.items ?? []);
    pageToken = pagedData.nextPageToken;
  }

  return items;
}

export async function listExtensionEvents(
  token: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  return fetchEvents(token, timeMin, timeMax, {
    privateExtendedProperty: `${WORK_HOURS_EXTENSION_KEY}=${WORK_HOURS_EXTENSION_VALUE}`,
  });
}

export async function createEvent(
  token: string,
  dateStr: string,
  title: string,
): Promise<CalendarEvent> {
  const body = buildEventBody(dateStr, title);
  const res = await fetchWithRetry(`${BASE_URL}/calendars/primary/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createEvent failed: HTTP ${res.status}`);
  return res.json();
}

export async function updateEvent(
  token: string,
  eventId: string,
  dateStr: string,
  title: string,
): Promise<CalendarEvent> {
  const body = buildEventBody(dateStr, title);
  const res = await fetchWithRetry(`${BASE_URL}/calendars/primary/events/${eventId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateEvent failed: HTTP ${res.status}`);
  return res.json();
}

export async function deleteEvent(token: string, eventId: string): Promise<void> {
  const res = await fetchWithRetry(`${BASE_URL}/calendars/primary/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteEvent failed: HTTP ${res.status}`);
  }
}

function buildEventBody(dateStr: string, title: string) {
  return {
    summary: title,
    start: { date: dateStr },
    end: { date: dateStr },
    extendedProperties: {
      private: { [WORK_HOURS_EXTENSION_KEY]: WORK_HOURS_EXTENSION_VALUE },
    },
  };
}
