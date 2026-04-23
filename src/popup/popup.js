function formatWorkable(minutes) {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

document.addEventListener("DOMContentLoaded", () => {
  const timeDisplay = document.getElementById("time-display");
  const label = document.getElementById("label");
  const subLabel = document.getElementById("sub-label");
  const errorMsg = document.getElementById("error-msg");
  const optionsLink = document.getElementById("options-link");

  optionsLink.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.runtime.sendMessage({ type: "GET_TODAY_REMAINING" }, (res) => {
    if (chrome.runtime.lastError) {
      timeDisplay.textContent = "--";
      timeDisplay.classList.add("inactive");
      errorMsg.hidden = false;
      errorMsg.textContent = "拡張機能と通信できませんでした";
      return;
    }

    if (!res) {
      timeDisplay.textContent = "--";
      return;
    }

    if (res.isWeekend || res.isHoliday) {
      label.textContent = "本日の状態";
      timeDisplay.textContent = "本日休日";
      timeDisplay.classList.add("inactive");
      return;
    }

    if (res.isAfterWork) {
      label.textContent = "本日の状態";
      timeDisplay.textContent = "本日終了";
      timeDisplay.classList.add("inactive");
      return;
    }

    if (res.minutes !== null && res.minutes !== undefined) {
      timeDisplay.textContent = formatWorkable(res.minutes);
      if (res.fromCache) {
        subLabel.textContent = "※ キャッシュデータ";
      }
    }

    if (!res.ok && res.error) {
      errorMsg.hidden = false;
      const msgs = {
        AUTH_REQUIRED: "認証が必要です。再度クリックしてください。",
        API_ERROR: "APIエラーが発生しました。",
        NETWORK_ERROR: "ネットワークエラーが発生しました。",
      };
      errorMsg.textContent = msgs[res.error] || `エラー: ${res.error}`;
      if (res.minutes === null) {
        timeDisplay.textContent = "--";
        timeDisplay.classList.add("inactive");
      }
    }
  });
});
