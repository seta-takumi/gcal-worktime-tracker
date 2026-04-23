(function () {
  "use strict";

  const OVERLAY_ID = "gwt-worktime-overlay";

  function formatWorkable(minutes) {
    if (minutes <= 0) return "0h";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h${m}m`;
  }

  function createOverlay() {
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

  function getOrCreateOverlay() {
    return document.getElementById(OVERLAY_ID) || createOverlay();
  }

  function renderOverlay(res) {
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

    if (res.minutes !== null && res.minutes !== undefined) {
      el.style.color = "#1a73e8";
      const cacheNote = res.fromCache ? ' <span style="font-size:10px;color:#9aa0a6">(cache)</span>' : "";
      el.innerHTML = `🧑‍💻 残り <strong>${formatWorkable(res.minutes)}</strong>${cacheNote}`;
    }
  }

  function updateOverlay() {
    chrome.runtime.sendMessage({ type: "GET_TODAY_REMAINING" }, (res) => {
      if (chrome.runtime.lastError) return;
      renderOverlay(res);
    });
  }

  function triggerWeeklyUpdate() {
    chrome.runtime.sendMessage({ type: "TRIGGER_WEEKLY_UPDATE" }, () => {
      if (chrome.runtime.lastError) return;
      updateOverlay();
    });
  }

  function observeSpaNavigation() {
    let lastUrl = location.href;

    const _push = history.pushState.bind(history);
    history.pushState = function (...args) {
      _push(...args);
      window.dispatchEvent(new Event("gwt-spa-navigate"));
    };

    const _replace = history.replaceState.bind(history);
    history.replaceState = function (...args) {
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

  function init() {
    getOrCreateOverlay();
    triggerWeeklyUpdate();
    observeSpaNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
