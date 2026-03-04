export function validateStartIsInFuture(startDateStr, startTimeStr = "00:00") {
  let dateError = "";
  let timeError = "";

  if (!startDateStr) {
    return { dateError, timeError };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDate = new Date(`${startDateStr}T00:00:00`);

  if (selectedDate < today) {
    dateError = "Start date cannot be in the past";
    return { dateError, timeError: "" };
  }

  const isToday = selectedDate.getTime() === today.getTime();

  if (isToday) {
    const startDateTime = new Date(
      `${startDateStr}T${startTimeStr || "00:00"}`,
    );
    const now = new Date(); // The *actual* current time

    if (startDateTime <= now) {
      timeError = "Start time must be in the future";
    }
  }
  return { dateError, timeError };
}