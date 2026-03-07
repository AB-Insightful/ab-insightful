export function validateEndIsAfterStart(
  startDateStr,
  startTimeStr = "00:00",
  endDateStr,
  endTimeStr,
) {
  // return both a date-level error and a time-level error so UI can show the right one
  let dateError = "";
  let timeError = "";

  if (!startDateStr || !endDateStr) {
    return { dateError, timeError };
  }

  const effectiveEndTime = endTimeStr || "23:59";
  const startDateTime = new Date(`${startDateStr}T${startTimeStr || "00:00"}`);
  const endDateTime = new Date(`${endDateStr}T${effectiveEndTime}`);

  if (endDateTime <= startDateTime) {
    const startDateOnly = new Date(`${startDateStr}T00:00:00`);
    const endDateOnly = new Date(`${endDateStr}T00:00:00`);
    // if end date precedes start date -> show error on date
    if (endDateOnly.getTime() < startDateOnly.getTime()) {
      dateError = "End date must be after the start date";
    } else {
      // same day but time invalid -> show error on time
      timeError = "End time must be after the start time";
    }
  }
  return { dateError, timeError };
}