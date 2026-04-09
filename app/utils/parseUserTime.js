//This function cleans and parses the user input, we only care about numbers and :, everything else is scrubbed
export function parseUserTime(input) {
  if (!input) return "";
  let s = String(input)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\./g, "");
  if (s === "noon") return "12:00";
  if (s === "midnight") return "00:00";
  let ampm = null;
  if (s.endsWith("am")) {
    ampm = "am";
    s = s.slice(0, -2);
  } else if (s.endsWith("pm")) {
    ampm = "pm";
    s = s.slice(0, -2);
  }
  s = s.replace(/[^0-9:]/g, "");
  let hh = 0,
    mm = 0;
  if (s.includes(":")) {
    const [hStr, mStr = "0"] = s.split(":");
    if (!/^\d+$/.test(hStr) || !/^\d+$/.test(mStr)) return null;
    hh = parseInt(hStr, 10);
    mm = parseInt(mStr.padEnd(2, "0").slice(0, 2), 10);
  } else {
    if (!/^\d+$/.test(s)) return null;
    if (s.length <= 2) {
      hh = parseInt(s, 10);
      mm = 0;
    } else if (s.length === 3) {
      hh = parseInt(s.slice(0, 1), 10);
      mm = parseInt(s.slice(1), 10);
    } else {
      hh = parseInt(s.slice(0, -2), 10);
      mm = parseInt(s.slice(-2), 10);
    }
  }

  //error handling for if minutes are out of bounds
  if (isNaN(hh) || isNaN(mm) || mm < 0 || mm > 59) return null;

  //error handling for if user types in am/pm to check that hours are within bounds
  if (ampm) {
    if (hh < 1 || hh > 12) return null;
    if (ampm === "am") {
      if (hh === 12) hh = 0;
    } else {
      if (hh !== 12) hh += 12;
    }
  } else {
    if (hh < 0 || hh > 23) return null;
  }
  //This is what we care about most, returns a string in 24hr format with hh:mm
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}