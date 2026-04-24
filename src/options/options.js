const STORAGE_KEY = "workingHours";
const STORAGE_KEY_WEEK_START_DAY = "weekStartDay";
const DEFAULT = { start: "10:00", end: "19:00" };
const DEFAULT_WEEK_START_DAY = 1;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("options-form");
  const weekStartDaySelect = document.getElementById("week-start-day");
  const startInput = document.getElementById("start");
  const endInput = document.getElementById("end");
  const validationError = document.getElementById("validation-error");
  const statusMsg = document.getElementById("status-msg");

  chrome.storage.sync.get([STORAGE_KEY, STORAGE_KEY_WEEK_START_DAY], (data) => {
    const wh = data[STORAGE_KEY] || DEFAULT;
    startInput.value = wh.start;
    endInput.value = wh.end;

    const wsd = data[STORAGE_KEY_WEEK_START_DAY] ?? DEFAULT_WEEK_START_DAY;
    weekStartDaySelect.value = String(wsd);
  });

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
    chrome.storage.sync.set(
      { [STORAGE_KEY]: { start, end }, [STORAGE_KEY_WEEK_START_DAY]: weekStartDay },
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
