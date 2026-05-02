import { MSG_GET_TODAY_REMAINING, ERR_AUTH_REQUIRED, ERR_API_ERROR, ERR_NETWORK_ERROR } from "../shared/constants";
import { formatWorkable } from "../shared/timeUtils";
import type { TodayRemainingResponse } from "../shared/types";

document.addEventListener("DOMContentLoaded", () => {
  const timeDisplay = document.getElementById("time-display")!;
  const label = document.getElementById("label")!;
  const subLabel = document.getElementById("sub-label")!;
  const errorMsg = document.getElementById("error-msg")!;
  const optionsLink = document.getElementById("options-link")!;

  optionsLink.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.runtime.sendMessage({ type: MSG_GET_TODAY_REMAINING }, (res: TodayRemainingResponse) => {
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

    if (res.minutes != null) {
      timeDisplay.textContent = formatWorkable(res.minutes);
      if (res.fromCache) {
        subLabel.textContent = "※ キャッシュデータ";
      }
    }

    if (!res.ok && res.error) {
      errorMsg.hidden = false;
      const msgs: Record<string, string> = {
        [ERR_AUTH_REQUIRED]: "認証が必要です。再度クリックしてください。",
        [ERR_API_ERROR]: "APIエラーが発生しました。",
        [ERR_NETWORK_ERROR]: "ネットワークエラーが発生しました。",
      };
      errorMsg.textContent = msgs[res.error] ?? `エラー: ${res.error}`;
      if (res.minutes === null) {
        timeDisplay.textContent = "--";
        timeDisplay.classList.add("inactive");
      }
    }
  });
});
