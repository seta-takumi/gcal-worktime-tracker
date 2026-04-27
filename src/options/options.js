const STORAGE_KEY = "workingHours";
const STORAGE_KEY_WEEK_START_DAY = "weekStartDay";
const STORAGE_KEY_WEEK_COUNT = "weekCount";
const STORAGE_KEY_EXCLUDE_KEYWORDS = "excludeKeywords";
const DEFAULT = { start: "10:00", end: "19:00" };
const DEFAULT_WEEK_START_DAY = 1;
const DEFAULT_WEEK_COUNT = 1;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("options-form");
  const weekStartDaySelect = document.getElementById("week-start-day");
  const weekCountSelect = document.getElementById("week-count");
  const startInput = document.getElementById("start");
  const endInput = document.getElementById("end");
  const excludeKeywordsTextarea = document.getElementById("exclude-keywords");
  const validationError = document.getElementById("validation-error");
  const statusMsg = document.getElementById("status-msg");

  chrome.storage.sync.get(
    [STORAGE_KEY, STORAGE_KEY_WEEK_START_DAY, STORAGE_KEY_WEEK_COUNT, STORAGE_KEY_EXCLUDE_KEYWORDS],
    (data) => {
      const wh = data[STORAGE_KEY] || DEFAULT;
      startInput.value = wh.start;
      endInput.value = wh.end;

      const wsd = data[STORAGE_KEY_WEEK_START_DAY] ?? DEFAULT_WEEK_START_DAY;
      weekStartDaySelect.value = String(wsd);

      const wc = data[STORAGE_KEY_WEEK_COUNT] ?? DEFAULT_WEEK_COUNT;
      weekCountSelect.value = String(wc);

      const keywords = data[STORAGE_KEY_EXCLUDE_KEYWORDS] || [];
      excludeKeywordsTextarea.value = keywords.join("\n");
    }
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
        [STORAGE_KEY]: { start, end },
        [STORAGE_KEY_WEEK_START_DAY]: weekStartDay,
        [STORAGE_KEY_WEEK_COUNT]: weekCount,
        [STORAGE_KEY_EXCLUDE_KEYWORDS]: excludeKeywords,
      },
      () => {
        statusMsg.textContent = "保存しました。次回ロード時に反映されます。";
        statusMsg.hidden = false;
        setTimeout(() => { statusMsg.hidden = true; }, 3000);
      }
    );
  });
});

function isStartBeforeEnd(start, end) {
  const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toMinutes(start) < toMinutes(end);
}
