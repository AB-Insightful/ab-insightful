// convert a local date (YYYY-MM-DD) and local time (HH:MM) into a UTC ISO string
export function localDateTimeToISOString(dateStr, timeStr = "00:00") {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh = 0, mm = 0] = (timeStr || "00:00").split(":").map(Number);
  // construct a local Date from components (guaranteed local interpretation)
  const local = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  return local.toISOString(); // canonical UTC instant
}