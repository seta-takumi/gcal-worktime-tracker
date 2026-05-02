import { MSG_GET_TODAY_REMAINING, MSG_TRIGGER_WEEKLY_UPDATE } from "../shared/constants";
import { formatWorkable } from "../shared/timeUtils";
import type { TodayRemainingResponse } from "../shared/types";

const OVERLAY_ID = "gwt-worktime-overlay";

function createOverlay(): HTMLDivElement {
  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "9999",
    background: "#fff",
    border: "1px solid #dadce0",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    padding: "8px 14px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: "13px",
    color: "#202124",
    cursor: "default",
    userSelect: "none",
    minWidth: "100px",
    textAlign: "center",
  });
  document.body.appendChild(el);
  return el;
}

function getOrCreateOverlay(): HTMLElement {
  return document.getElementById(OVERLAY_ID) ?? createOverlay();
}

function renderOverlay(res: TodayRemainingResponse | null): void {
  const el = getOrCreateOverlay();

  if (!res || (!res.ok && res.error === "AUTH_REQUIRED" && res.minutes === null)) {
    el.style.display = "none";
    return;
  }

  el.style.display = "block";

  if (res.isWeekend || res.isHoliday) {
    el.style.color = "#9aa0a6";
    el.innerHTML = "🏖 本日休日";
    return;
  }

  if (res.isAfterWork) {
    el.style.color = "#9aa0a6";
    el.innerHTML = "✅ 本日終了";
    return;
  }

  if (res.minutes != null) {
    el.style.color = "#1a73e8";
    const cacheNote = res.fromCache
      ? ' <span style="font-size:10px;color:#9aa0a6">(cache)</span>'
      : "";
    el.innerHTML = `🧑‍💻 残り <strong>${formatWorkable(res.minutes)}</strong>${cacheNote}`;
  }
}

function updateOverlay(): void {
  chrome.runtime.sendMessage({ type: MSG_GET_TODAY_REMAINING }, (res: TodayRemainingResponse) => {
    if (chrome.runtime.lastError) return;
    renderOverlay(res);
  });
}

function triggerWeeklyUpdate(): void {
  chrome.runtime.sendMessage({ type: MSG_TRIGGER_WEEKLY_UPDATE }, () => {
    if (chrome.runtime.lastError) return;
    updateOverlay();
  });
}

function observeSpaNavigation(): void {
  let lastUrl = location.href;

  const _push = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    _push(...args);
    window.dispatchEvent(new Event("gwt-spa-navigate"));
  };

  const _replace = history.replaceState.bind(history);
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    _replace(...args);
    window.dispatchEvent(new Event("gwt-spa-navigate"));
  };

  window.addEventListener("popstate", () => {
    window.dispatchEvent(new Event("gwt-spa-navigate"));
  });

  window.addEventListener("gwt-spa-navigate", () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      updateOverlay();
    }
  });
}

function init(): void {
  getOrCreateOverlay();
  triggerWeeklyUpdate();
  observeSpaNavigation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
