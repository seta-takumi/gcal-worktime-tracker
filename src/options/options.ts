import {
  STORAGE_KEY_WORKING_HOURS,
  STORAGE_KEY_WEEK_START_DAY,
  STORAGE_KEY_WEEK_COUNT,
  STORAGE_KEY_EXCLUDE_KEYWORDS,
  DEFAULT_WORKING_HOURS,
  DEFAULT_WEEK_START_DAY,
  DEFAULT_WEEK_COUNT,
} from "../shared/constants";
import type { WorkingHours } from "../shared/types";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("options-form") as HTMLFormElement;
  const weekStartDaySelect = document.getElementById("week-start-day") as HTMLSelectElement;
  const weekCountSelect = document.getElementById("week-count") as HTMLSelectElement;
  const startInput = document.getElementById("start") as HTMLInputElement;
  const endInput = document.getElementById("end") as HTMLInputElement;
  const excludeKeywordsTextarea = document.getElementById("exclude-keywords") as HTMLTextAreaElement;
  const validationError = document.getElementById("validation-error") as HTMLElement;
  const statusMsg = document.getElementById("status-msg") as HTMLElement;

  chrome.storage.sync.get(
    [STORAGE_KEY_WORKING_HOURS, STORAGE_KEY_WEEK_START_DAY, STORAGE_KEY_WEEK_COUNT, STORAGE_KEY_EXCLUDE_KEYWORDS],
    (data) => {
      const wh = (data[STORAGE_KEY_WORKING_HOURS] as WorkingHours | undefined) ?? DEFAULT_WORKING_HOURS;
      startInput.value = wh.start;
      endInput.value = wh.end;

      const wsd = (data[STORAGE_KEY_WEEK_START_DAY] as number | undefined) ?? DEFAULT_WEEK_START_DAY;
      weekStartDaySelect.value = String(wsd);

      const wc = (data[STORAGE_KEY_WEEK_COUNT] as number | undefined) ?? DEFAULT_WEEK_COUNT;
      weekCountSelect.value = String(wc);

      const keywords = (data[STORAGE_KEY_EXCLUDE_KEYWORDS] as string[] | undefined) ?? [];
      excludeKeywordsTextarea.value = keywords.join("\n");
    },
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    validationError.hidden = true;
    statusMsg.hidden = true;

    const start = startInput.value;
    const end = endInput.value;

    if (!isStartBeforeEnd(start, end)) {
      validationError.hidden = false;
      return;
    }

    const weekStartDay = Number(weekStartDaySelect.value);
    const weekCount = Number(weekCountSelect.value);
    const excludeKeywords = excludeKeywordsTextarea.value
      .split("\n")
      .map((kw) => kw.trim())
      .filter((kw) => kw !== "");

    chrome.storage.sync.set(
      {
        [STORAGE_KEY_WORKING_HOURS]: { start, end },
        [STORAGE_KEY_WEEK_START_DAY]: weekStartDay,
        [STORAGE_KEY_WEEK_COUNT]: weekCount,
        [STORAGE_KEY_EXCLUDE_KEYWORDS]: excludeKeywords,
      },
      () => {
        statusMsg.textContent = "保存しました。次回ロード時に反映されます。";
        statusMsg.hidden = false;
        setTimeout(() => {
          statusMsg.hidden = true;
        }, 3000);
      },
    );
  });
});

function isStartBeforeEnd(start: string, end: string): boolean {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toMinutes(start) < toMinutes(end);
}
