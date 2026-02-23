//suppress react hydration warnings
//known issue between polaris web components and React hydration
if (typeof window !== "undefined") {
  const originalError = console.error;
  console.error = (...args) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Extra attributes from the server")
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
}

import { authenticate } from "../shopify.server";
import { useFetcher, redirect, useLoaderData } from "react-router";
import { useState, useEffect } from "react";
import db from "../db.server";

// Server side code
export const action = async ({ request }) => {
  // Authenticate request
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  // Get POST request form data & create experiment
  const name = (formData.get("name") || "").trim();
  const description = (formData.get("description") || "").trim();
  const sectionId = (formData.get("sectionId") || "").trim();
  const controlSectionId = (formData.get("controlSectionId") || "").trim();
  const variantSectionId = (formData.get("variantSectionId") || "").trim();
  const variantEnabled = formData.get("variant") === "true";
  const goalValue = (formData.get("goal") || "").trim();
  const endCondition = (formData.get("endCondition") || "").trim();
  const trafficSplitStr = (formData.get("trafficSplit") || "50").trim(); // Default to "0"
  const probabilityToBeBestStr = (
    formData.get("probabilityToBeBest") || ""
  ).trim();
  const durationStr = (formData.get("duration") || "").trim();
  const timeUnitValue = (formData.get("timeUnit") || "").trim();

  // Date/Time Fields (accepts both client-side UTC strings or separate date/time fields)
  const startDateUTC = (formData.get("startDateUTC") || "").trim();
  const endDateUTC = (formData.get("endDateUTC") || "").trim();
  const startDateStr = (formData.get("startDate") || "").trim();
  const startTimeStr = (formData.get("startTime") || "").trim();
  const endDateStr = (formData.get("endDate") || "").trim();
  const endTimeStr = (formData.get("endTime") || "").trim();

  // Storage Validation Errors
  const errors = {}; // will be length 0 when there are no errors

  if (!name) errors.name = "Name is required";
  if (!description) errors.description = "Description is required";
  if (!sectionId) errors.sectionId = "Section Id is required";
  if (variantEnabled && !variantSectionId)
    errors.variantSectionId = "Variant Section Id is required"; //only validate if variant is true
  if (!startDateStr && !startDateUTC)
    errors.startDate = "Start Date is required";
  if (endCondition === "stableSuccessProbability" && !probabilityToBeBestStr)
    errors.probabilityToBeBest = "Probability is required";
  if (endCondition === "stableSuccessProbability" && !durationStr)
    errors.duration = "Duration is required";

  // helper to build a Date from local date + time components
  const combineLocalToDate = (dateStr, timeStr = "00:00") => {
    if (!dateStr) return null;
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return null;
    const [y, m, d] = parts;
    const [hh = 0, mm = 0] = (timeStr || "00:00").split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    const dt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };

  //build startDateTime
  let startDateTime = null;
  if (startDateUTC) {
    startDateTime = new Date(startDateUTC);
    if (Number.isNaN(startDateTime.getTime())) startDateTime = null;
  } else {
    startDateTime = combineLocalToDate(startDateStr, startTimeStr);
  }

  // validate startDateTime is present and in the future
  const now = new Date();
  if (!startDateTime) {
    errors.startDate = "Start date is required";
  } else if (startDateTime <= now) {
    errors.startDate = "Start date/time must be in the future";
  }

  // If endCondition is "endDate", build and validate endDateTime
  let endDateTime = null;
  if (endCondition === "endDate") {
    if (endDateUTC) {
      endDateTime = new Date(endDateUTC);
      if (Number.isNaN(endDateTime.getTime())) endDateTime = null;
    } else {
      const effectiveEndTimeStr = endTimeStr || "23:59";
      endDateTime = combineLocalToDate(endDateStr, effectiveEndTimeStr);
    }
    if (!endDateTime) {
      errors.endDate = "End date is required";
    } else if (!startDateTime) {
      // skip further validation if startDateTime is invalid/missing
    } else if (endDateTime <= startDateTime) {
      errors.endDate = "End must be after start date/time";
    }
  }
  // Only validates endDate if endCondition is 'End date'
  const isEndDate = endCondition === "endDate";
  if (isEndDate) {
    if (!endDateStr) {
      errors.endDate = "End date is required";
    }
  }

  // Only validates probability to be best if endCondition is set to Stable Success Probability
  const isStableSuccessProbability =
    endCondition === "stableSuccessProbability";
  if (isStableSuccessProbability) {
    if (probabilityToBeBestStr === "") {
      errors.probabilityToBeBest = "Probability is required";
    } else {
      const num = Number(probabilityToBeBestStr);
      if (!Number.isInteger(num)) {
        errors.probabilityToBeBest = "Probability must be a whole numer";
      } else if (num < 51 || num > 100) {
        errors.probabilityToBeBest = "Probability must be between 51-100";
      }
    }
    if (durationStr === "") {
      errors.duration = "Duration is required";
    } else {
      const dur = Number(durationStr);
      if (!Number.isInteger(dur)) {
        errors.duration = "Duration must be a whole number";
      } else if (dur < 1) {
        errors.duration = "Duration must be at least 1";
      }
    }
    if (!timeUnitValue) {
      errors.timeUnit = "Time unit is required";
    }
  }

  if (Object.keys(errors).length) return { errors };

  // Find or create a parent Project for this shop
  const shop = session.shop;
  const project = await db.project.upsert({
    where: { shop: shop },
    update: {},
    create: { shop: shop, name: `${shop} Project` },
  });
  const projectId = project.id;

  // Map client-side goal value ('view-page') to DB goal name
  const goalNameMap = {
    viewPage: "Viewed Page",
    startCheckout: "Started Checkout",
    addToCart: "Added Product to Cart",
    completedCheckout: "Completed Checkout",
  };
  const goalName = goalNameMap[goalValue];

  // Find the corresponding Goal record ID
  const goalRecord = await db.goal.findUnique({
    where: { name: goalName },
  });

  if (!goalRecord) {
    return { errors: { goal: "Could not find matching goal in the database" } };
  }

  // Convert form data strings to schema-ready types
  const goalId = goalRecord.id;
  const trafficSplit = parseFloat(trafficSplitStr) / 100.0;

  // Converts the date string to a Date object for Prisma
  // If no date was provided, set to null
  const startDate = startDateTime;
  const endDate = endDateTime || null;

  //convert stable success probability variables to schema-ready types
  const probabilityToBeBest = probabilityToBeBestStr
    ? Number(probabilityToBeBestStr)
    : null;
  const duration = durationStr ? Number(durationStr) : null;
  const timeUnit = timeUnitValue || null;

  // Assembles the final data object for Prisma
  const experimentData = {
    name: name,
    description: description,
    status: "draft",
    trafficSplit: trafficSplit,
    endCondition: endCondition,
    startDate: startDate,
    endDate: endDate,
    sectionId: sectionId,
    controlSectionId: controlSectionId,
    project: {
      // Connect to the parent project
      connect: {
        id: projectId,
      },
    },
    experimentGoals: {
      // Create the related goal
      create: [
        {
          goalId: goalId,
          goalRole: "primary",
        },
      ],
    },
  };

  if (isStableSuccessProbability) {
    Object.assign(experimentData, {
      probabilityToBeBest,
      duration,
      timeUnit,
    });
  }

  const { createExperiment } = await import("../services/experiment.server");
  const experiment = await createExperiment(experimentData);

  return redirect(`/app/experiments/${experiment.id}`);
};

//pull the default goal stored in database, completedCheckout if empty
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const project = await db.project.findUnique({
    where: { shop: session.shop },
    select: { defaultGoal: true },
  });
  return { defaultGoal: project?.defaultGoal ?? "completedCheckout" };
};

//--------------------------- client side ----------------------------------------

function TimeSelect({
  id = "selectTime",
  label = "Select time",
  value,
  onChange,
  error,
  invalidMessage = 'Enter a time like "1:30 PM" or "13:30"',
}) {
  // controlled display value (human readable like "1:30 PM")
  const times = [];
  const popoverId = `${id}-popover`;
  // build times list once
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour24 = h.toString().padStart(2, "0");
      const minute = m.toString().padStart(2, "0");
      const value24 = `${hour24}:${minute}`;
      const suffix = h >= 12 ? "PM" : "AM";
      const hour12 = ((h + 11) % 12) + 1;
      const label12 = `${hour12}:${minute} ${suffix}`;
      times.push({ value: value24, label: label12 });
    }
  }

  const labelFor = (hhmm) => {
    if (!hhmm) return "";
    const hit = times.find((t) => t.value === hhmm);
    if (hit) return hit.label;
    const [H, M] = hhmm.split(":").map((n) => parseInt(n, 10));
    const am = H < 12;
    const h12 = ((H + 11) % 12) + 1;
    return `${h12}:${String(M).padStart(2, "0")} ${am ? "AM" : "PM"}`;
  };

  // local display state so we can show the friendly label while remaining controlled
  const [display, setDisplay] = useState(value ? labelFor(value) : "");
  useEffect(() => {
    // sync whenever parent value changes (including when validation sets an error)
    setDisplay(value ? labelFor(value) : "");
  }, [value]);

  const openPopover = (el) =>
    el?.querySelector(`#${popoverId}Trigger`)?.click();

  const commitFromField = (raw) => {
    const parsed = parseUserTime(raw);
    if (!parsed) {
      // notify parent by passing null / empty so parent can set error string
      onChange("");
      return;
    }
    onChange(parsed);
    setDisplay(labelFor(parsed));
  };

  return (
    <div>
      {/* This section is what will visually display when the function is called */}
      <s-text-field
        label={label}
        id={`${id}-input`}
        icon="clock"
        value={display}
        placeholder="Choose a time"
        error={error}
        onFocus={(e) => openPopover(e.currentTarget.parentElement)}
        onClick={(e) => openPopover(e.currentTarget.parentElement)}
        onInput={(e) => setDisplay(e.currentTarget.value)}
        onBlur={(e) => commitFromField(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitFromField(e.currentTarget.value);
          }
        }}
      >
        <s-button
          slot="accessory"
          variant="tertiary"
          disclosure="down"
          commandFor={popoverId}
          icon="chevron-down"
          accessibilityLabel="Select time"
        />
      </s-text-field>

      {/* This is the popover styling and the button population */}
      <s-popover id={popoverId} maxBlockSize="200px">
        <s-stack direction="block">
          {times.map((t) => (
            <s-button
              key={t.value}
              fullWidth
              variant="tertiary"
              commandFor={popoverId}
              onClick={() => {
                onChange(t.value);
                setDisplay(labelFor(t.value));
              }}
            >
              {t.label}
            </s-button>
          ))}
        </s-stack>
      </s-popover>
    </div>
  );
}

//This function cleans and parses the user input, we only care about numbers and :, everything else is scrubbed
function parseUserTime(input) {
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

function validateStartIsInFuture(startDateStr, startTimeStr = "00:00") {
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

function validateEndIsAfterStart(
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

// convert a local date (YYYY-MM-DD) and local time (HH:MM) into a UTC ISO string
function localDateTimeToISOString(dateStr, timeStr = "00:00") {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh = 0, mm = 0] = (timeStr || "00:00").split(":").map(Number);
  // construct a local Date from components (guaranteed local interpretation)
  const local = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  return local.toISOString(); // canonical UTC instant
}

export default function CreateExperiment() {
  //fetcher stores the data in the fields into a form that can be retrieved
  const fetcher = useFetcher();
  const { defaultGoal } = useLoaderData();

  //state variables (special variables that remember across re-renders (e.g. user input, counters))
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(null);
  const [description, setDescription] = useState("");
  const [emptyDescriptionError, setDescriptionError] = useState(null);
  const [sectionId, setSectionId] = useState("");
  const [addControlSection, setAddControlSection] = useState(false);
  const [controlSectionId, setControlSectionId] = useState("");
  const [emptySectionIdError, setSectionIdError] = useState(null);
  const [emptySectionIdVariantError, setSectionIdVariantError] = useState(null);
  const [emptyStartDateError, setEmptyStartDateError] = useState(null);
  const [emptyEndDateError, setEmptyEndDateError] = useState(null);
  const [endDate, setEndDate] = useState("");
  const [endDateError, setEndDateError] = useState("");
  const [experimentChance, setExperimentChance] = useState(50);
  const [endCondition, setEndCondition] = useState("manual");
  const [goalSelected, setGoalSelected] = useState(defaultGoal);
  const [customerSegment, setCustomerSegment] = useState("allSegments");
  const [variant, setVariant] = useState(false);
  const [variantDisplay, setVariantDisplay] = useState("none");
  const [variantSectionId, setVariantSectionId] = useState("");
  const [variantExperimentChance, setVariantExperimentChance] = useState(50);
  const [startDate, setStartDate] = useState("");
  const [startDateError, setStartDateError] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [startTimeError, setStartTimeError] = useState("");
  const [endTimeError, setEndTimeError] = useState("");

  // keep all date/time errors in sync whenever any date/time value changes
  useEffect(() => {
    const errors = validateAllDateTimes(startDate, startTime, endDate, endTime);
    if (errors.startDateError !== startDateError)
      setStartDateError(errors.startDateError);
    if (errors.startTimeError !== startTimeError)
      setStartTimeError(errors.startTimeError);
    if (errors.endDateError !== endDateError)
      setEndDateError(errors.endDateError);
    if (errors.endTimeError !== endTimeError)
      setEndTimeError(errors.endTimeError);
  }, [startDate, startTime, endDate, endTime, endCondition]);

  // clear end fields / errors when user switches end condition away from "endDate"
  useEffect(() => {
    if (endCondition !== "endDate") {
      // Condition is 'manual' or 'stableSuccessProbability', so clear fields
      if (endDate !== "") setEndDate("");
      if (endTime !== "") setEndTime("");
      if (endDateError !== "") setEndDateError("");
      if (endTimeError !== "") setEndTimeError("");
    }
  }, [endCondition]); // The dependency [endCondition] is correct
  const [probabilityToBeBestError, setProbabilityToBeBestError] = useState("");
  const [durationError, setDurationError] = useState("");
  const [probabilityToBeBest, setProbabilityToBeBest] = useState("");
  const [duration, setDuration] = useState("");
  const [timeUnit, setTimeUnit] = useState("days");
  const [timeUnitError, setTimeUnitError] = useState("");

  const error = fetcher.data?.error; // Fetches error from server side MIGHT CAUSE ERROR

  const errors = fetcher.data?.errors || {}; // looks for error data, if empty instantiate errors as empty object

  //Check if there were any errors on the form
  const hasClientErrors =
    !!nameError ||
    !!errors.name ||
    !!emptyDescriptionError ||
    !!errors.description ||
    !!emptySectionIdError ||
    !!errors.sectionId ||
    (variant && !!emptySectionIdVariantError) ||
    (variant && !!errors.variantSectionId) ||
    !!probabilityToBeBestError ||
    !!errors.probabilityToBeBest ||
    !!durationError ||
    !!errors.duration ||
    !!timeUnitError ||
    !!errors.timeUnit ||
    !!startDateError ||
    !!errors.startDate ||
    !!startTimeError ||
    !!endDateError ||
    !!errors.endDate ||
    !!endTimeError ||
    !!emptyStartDateError ||
    !!emptyEndDateError;
  //check for fetcher state, want to block save draft button if in the middle of sumbitting
  const isSubmitting = fetcher.state === "submitting";

  const handleExperimentCreate = async () => {
    // creates data object for all current state variables
    const startDateUTC = startDate
      ? localDateTimeToISOString(startDate, startTime)
      : "";
    const effectiveEndTime = endDate && !endTime ? "23:59" : endTime;
    const endDateUTC = endDate
      ? localDateTimeToISOString(endDate, effectiveEndTime)
      : "";

    const experimentData = {
      name: name,
      description: description,
      sectionId: sectionId,
      controlSectionId: controlSectionId,
      variantSectionId: variantSectionId,
      variant: String(variant),
      goal: goalSelected, // holds the "view-page" value
      endCondition: endCondition, // holds "Manual", "End Data"
      startDateUTC: startDateUTC, // The date string from s-date-field
      endDateUTC: endDateUTC, // The date string from s-date-field
      endDate: endDate, // The date string from s-date-field
      trafficSplit: experimentChance, // 0-100 value
      probabilityToBeBest: probabilityToBeBest, //holds validated value 51-100
      duration: duration, //length of time for experiment run
      timeUnit: timeUnit,
    };

    try {
      await fetcher.submit(experimentData, { method: "POST" });
    } catch (error) {
      console.error("Error during fetcher.submit", error);
    }
  }; // end HandleCreateExperiment()

  //arrow function expression that is used to set the error message when there is no name
  const handleNameBlur = () => {
    if (!name.trim()) {
      setNameError("Name is a required field");
    } else {
      setNameError(null); //clears error once user fixes
    }
  };

  const handleDescriptionBlur = () => {
    if (!description.trim()) {
      setDescriptionError("Description is a required field");
    } else {
      setDescriptionError(null); //clears error once user fixes
    }
  };

  const handleSectionIdBlur = () => {
    if (!sectionId.trim()) {
      setSectionIdError("Section ID is a required field");
    } else {
      setSectionIdError(null); //clears error once user fixes
    }
  };

  const handleSectionIdVariantBlur = () => {
    if (variant && !variantSectionId.trim()) {
      setSectionIdVariantError("Section ID is a required field");
    } else {
      setSectionIdVariantError(null); //clears error once user fixes
    }
  };

  const handleStartDateBlur = () => {
    if (!startDate.trim()) {
      setEmptyStartDateError("Start Date is a required field");
    } else {
      setEmptyStartDateError(null); //clears error once user fixes
    }
  };

  const handleEndDateBlur = () => {
    if (endCondition === "endDate" && !endDate.trim()) {
      setEmptyEndDateError("End Date is a required field");
    } else {
      setEmptyEndDateError(null); //clears error once user fixes
    }
  };

  const handleProbabilityToBeBestBlur = () => {
    const value = String(probabilityToBeBest || "").trim();
    if (!value.trim()) {
      setProbabilityToBeBestError("Probability is a required field");
    } else {
      setProbabilityToBeBestError(null); //clears error once user fixes
    }
  };

  const handleDurationBlur = () => {
    const value = String(duration || "").trim();
    if (!value.trim()) {
      setDurationError("Duration is required");
    } else {
      setDurationError(null); //clears error once user fixes
    }
  };

  //Validates user input for probability of best and throws error based off of input
  const handleProbabilityOfBestChange = (field, e) => {
    const num = Number(e);
    const isInt = Number.isInteger(num);

    if (field === "probabilityToBeBest") {
      const inRange = num >= 51 && num <= 100;
      if (isInt && inRange) {
        setProbabilityToBeBest(num);
        setProbabilityToBeBestError("");
      } else {
        setProbabilityToBeBestError("Probability must be between 51-100");
      }

      if (!isInt) {
        setProbabilityToBeBestError("Probability must be a whole number");
      }
    } else if (field === "duration") {
      if (num >= 1 && isInt) {
        setDurationError("");
        setDuration(num);
      }

      if (num < 1) {
        setDurationError("Duration must be greater than 1");
      }
      if (!isInt) {
        setDurationError("Duration must be a whole number");
      }
    }
  };

  //if fetcher data exists, add this otherwise undefined.
  const handleName = (v) => {
    if (nameError && v.trim()) setNameError(null); // clear as soon as it’s valid
    setName(v);
  };

  // New centralized validation function
  const validateAllDateTimes = (
    startDateVal = startDate,
    startTimeVal = startTime,
    endDateVal = endDate,
    endTimeVal = endTime,
    condition = endCondition,
  ) => {
    let newStartDateError = "";
    let newStartTimeError = "";
    let newEndDateError = "";
    let newEndTimeError = "";

    // Validate start is in future
    const { dateError: startDErr, timeError: startTErr } =
      validateStartIsInFuture(startDateVal, startTimeVal);
    newStartDateError = startDErr;
    newStartTimeError = startTErr;

    // Validate end date is not in the past
    if (condition === "endDate" && endDateVal) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedEndDate = new Date(`${endDateVal}T00:00:00`);

      if (selectedEndDate < today) {
        newEndDateError = "End date cannot be in the past";
      }
      // Only validate end is after start if end date is valid (not in past)
      else if (startDateVal) {
        const { dateError: endDErr, timeError: endTErr } =
          validateEndIsAfterStart(
            startDateVal,
            startTimeVal,
            endDateVal,
            endTimeVal,
          );
        newEndDateError = endDErr;
        newEndTimeError = endTErr;
      }
    }

    return {
      startDateError: newStartDateError,
      startTimeError: newStartTimeError,
      endDateError: newEndDateError,
      endTimeError: newEndTimeError,
    };
  };
  // Handlers for git changes that also trigger validation
  const handleDateChange = (field, newDate) => {
    // Updates the state so the field reflects picked date
    if (field === "start") {
      setStartDate(newDate);
      const errors = validateAllDateTimes(
        newDate,
        startTime,
        endDate,
        endTime,
        endCondition,
      );
      setStartDateError(errors.startDateError);
      setStartTimeError(errors.startTimeError);
      setEndDateError(errors.endDateError);
      setEndTimeError(errors.endTimeError);
    } else if (field === "end") {
      setEndDate(newDate);
      const errors = validateAllDateTimes(
        startDate,
        startTime,
        newDate,
        endTime,
        endCondition,
      );
      setStartDateError(errors.startDateError);
      setStartTimeError(errors.startTimeError);
      setEndDateError(errors.endDateError);
      setEndTimeError(errors.endTimeError);
    }
  };

  // Handlers for time changes that also trigger validation
  const handleStartTimeChange = (newStartTime) => {
    setStartTime(newStartTime);
    const errors = validateAllDateTimes(
      startDate,
      newStartTime,
      endDate,
      endTime,
      endCondition,
    );
    setStartDateError(errors.startDateError);
    setStartTimeError(errors.startTimeError);
    setEndDateError(errors.endDateError);
    setEndTimeError(errors.endTimeError);
  };

  // Handler for end time changes that also trigger validation
  const handleEndTimeChange = (newEndTime) => {
    setEndTime(newEndTime);
    const errors = validateAllDateTimes(
      startDate,
      startTime,
      endDate,
      newEndTime,
      endCondition,
    );
    setStartDateError(errors.startDateError);
    setStartTimeError(errors.startTimeError);
    setEndDateError(errors.endDateError);
    setEndTimeError(errors.endTimeError);
  };

  const handleVariant = () => {
    setVariant(true);
    setVariantDisplay("auto");
    setVariantExperimentChance(50);
  };

  const handleVariantUndo = () => {
    setVariant(false);
    setVariantDisplay("none");
    setVariantSectionId("");
    setVariantExperimentChance();
  };

  const handleDiscard = () => {
    setName("");
    setDescription("");
    setSectionId("");
    setVariant(false);
    setVariantDisplay("none");
    setVariantSectionId("");
    setExperimentChance(50);
    setVariantExperimentChance(50);
    setGoalSelected(defaultGoal);
    setCustomerSegment("allSegments");
    setEndCondition("manual");
    setStartDate("");
    setStartTime("12:00");
    setEndDate("");
    setEndTime("11:59 PM");
    setProbabilityToBeBest("");
    setDuration("");
    setTimeUnit("days");

    setNameError(null);
    setDescriptionError(null);
    setSectionIdError(null);
    setSectionIdVariantError(null);
    setEmptyStartDateError(null);
    setEmptyEndDateError(null);
    setStartDateError("");
    setStartTimeError("");
    setEndDateError("");
    setEndTimeError("");
    setProbabilityToBeBestError("");
    setDurationError("");
    setTimeUnitError("");
  };

  
  const descriptionError = errors.description;

  // map internal values to a label + icon
  const goalMap = {
    viewPage: { label: "View Page", icon: "view" },
    startCheckout: { label: "Start Checkout", icon: "clock" },
    addToCart: { label: "Add to Cart", icon: "cart" },
    completedCheckout: { label: "Complete Purchase", icon: "cash-dollar" },
  };

  const segmentMap = {
    allSegments: "All Segments",
    desktopVisitors: "Desktop Visitors",
    mobileVisitors: "Mobile Visitors",
  };

  const variationMap = {
    false: "Single Variation",
    true: "Multiple Variations",
  };

  const variantMap = {
    false: "none",
    true: "auto",
  };

  // derive current badge info and icon from selected goal
  const { label, icon } = goalMap[goalSelected] ?? {
    label: "—",
    icon: "alert",
  };
  const customerSegments = segmentMap[customerSegment] ?? "—";

  return (
    <s-page heading="Create Experiment" variant="headingLg">
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={hasClientErrors || isSubmitting}
        onClick={handleExperimentCreate}
      >
        Save Draft
      </s-button>
      <s-button slot="secondary-actions" onClick={handleDiscard}>
        Discard
      </s-button>
      <s-button slot="secondary-actions" href="/app/experiments">
        Back to Experiment List
      </s-button>
      {(errors.form || errors.goal) && (
        <s-box padding="base">
          <s-banner title="There was an error" tone="critical">
            <p>{errors.form || errors.goal}</p>
          </s-banner>
        </s-box>
      )}

      {/*Sidebar panel to display current experiment summary*/}
      <div
        slot="aside"
        style={{
          position: "sticky",
          top: ".25rem",
          alignSelf: "flex-start",
        }}
      >
        <s-section heading={name ? name : "no experiment name set"}>
          <s-stack gap="small">
            <s-badge icon={icon}>{label}</s-badge>
            <s-badge
              tone={sectionId ? "" : "warning"}
              icon={sectionId ? "code" : "alert-circle"}
            >
              {sectionId || "Section not selected"}
            </s-badge>
            <s-stack display={variantDisplay}>
              <s-badge
                tone={variantSectionId ? "" : "warning"}
                icon={variantSectionId ? "code" : "alert-circle"}
              >
                {variantSectionId || "Section not selected"}
              </s-badge>
            </s-stack>

            <s-text font-weight="heavy">Experiment Details</s-text>

            {/* DYNAMIC BULLET LIST */}
            <s-text>• {customerSegments}</s-text>
            <s-text>• {variationMap[variant] || "—"}</s-text>
            <s-text>• {experimentChance}% Chance to show Variant 1</s-text>
            <s-stack display={variantDisplay}>
              <s-text>
                • {variantExperimentChance}% Chance to show Variant 2
              </s-text>
            </s-stack>
            <s-text>
              • Active from{" "}
              {startDate
                ? new Date(`${startDate}T00:00:00`).toDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "—"}{" "}
              until{" "}
              {endDate
                ? new Date(`${endDate}T00:00:00`).toLocaleDateString(
                    undefined,
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    },
                  )
                : "—"}
            </s-text>
          </s-stack>
        </s-section>
      </div>

      {/*Name Portion of code */}
      <s-section>
        <s-box padding="base">
          <s-stack gap="large-200" direction="block">
            <s-form>
              <s-text-field
                label="Experiment Name"
                placeholder="Unnamed Experiment"
                value={name}
                required
                onFocus={() => {
                  setNameError(null);
                  if (fetcher.data?.errors?.name) {
                    //clear server-side errors by resetting fetcher data
                    fetcher.data = {
                      ...fetcher.data,
                      errors: { ...fetcher.data.errors, name: undefined },
                    };
                  }
                }}
                //Event handler callback to set value
                onChange={(e) => {
                  handleName(e.target.value);
                }} /*Updating the name that will be sent to server on experiment creation for each change */
                onBlur={handleNameBlur}
                error={errors.name || nameError}
              />
            </s-form>

            {/*Description portion of code*/}
            <s-form>
              <s-text-area
                label="Experiment Description"
                placeholder="Add a detailed description of your experiment"
                value={description}
                required
                onFocus={() => {
                  setDescriptionError(null);
                  if (fetcher.data?.errors?.description) {
                    //clear server-side errors by resetting fetcher data
                    fetcher.data = {
                      ...fetcher.data,
                      errors: {
                        ...fetcher.data.errors,
                        description: undefined,
                      },
                    };
                  }
                }}
                // Known as a controlled component, the value is tied to {description} state
                onChange={(e) => {
                  const v = e.target.value;
                  setDescription(v);
                  if (emptyDescriptionError && v.trim())
                    setDescriptionError(null);
                }}
                onBlur={handleDescriptionBlur}
                error={errors.description || emptyDescriptionError}
              />
            </s-form>
            <s-select
              label="Experiment Goal"
              icon={icon}
              value={goalSelected}
              onChange={(e) => {
                const value = e.target.value;
                setGoalSelected(value);
              }}
            >
              <s-option value="completedCheckout">Completed Checkout</s-option>
              <s-option value="viewPage">Viewed Page</s-option>
              <s-option value="startCheckout">Started Checkout</s-option>
              <s-option value="addToCart">Added Product to Cart</s-option>
            </s-select>
          </s-stack>
        </s-box>
      </s-section>

      {/* Experiment details */}
      <s-section heading="Experiment Details">
        <s-form>
          <s-stack direction="block" gap="base" paddingBlock="base">
            <s-stack direction="block" gap="small">
              <s-stack display={variantDisplay}>
                <s-heading>Variant 1</s-heading>
              </s-stack>
              {/*Custom Label Row (SectionID + help link)*/}
              <s-link href="#" target="_blank">
                How do I find my section?
              </s-link>
              <s-text-field
                placeholder="shopify-section-sections--25210977943842__header"
                value={sectionId}
                label="Section ID to be tested"
                required
                onFocus={() => {
                  setSectionIdError(null);
                  if (fetcher.data?.errors?.sectionId) {
                    //clear server-side errors by resetting fetcher data
                    fetcher.data = {
                      ...fetcher.data,
                      errors: { ...fetcher.data.errors, sectionId: undefined },
                    };
                  }
                }}
                onChange={(e) => {
                  const v = e.target.value;
                  setSectionId(v);
                  if (emptySectionIdError && v.trim()) setSectionIdError(null);
                }}
                onBlur={handleSectionIdBlur}
                error={errors.sectionId || emptySectionIdError}
                details="The associated Shopify section ID to be tested. Must be visible on production site"
              />
            </s-stack>
            <s-checkbox
              label="Add a control section ID"
              details="If you want the variant section to replace the control section, add a control section ID"
              onChange={(e) => {
                setAddControlSection(!addControlSection);
              }}
            />
            {/* There is no error checking for this section intentionally. If a user supplies a control ID, that's great */}
            {/* But, you don't need it and may not want it, so it can be blank. */}
            {addControlSection && (
              <s-text-field
                placeholder="shopify-section-sections--25210972849284__header"
                value={controlSectionId}
                label="Control Section ID"
                required
                onChange={(e) => {
                  const v = e.target.value;
                  setControlSectionId(v);
                }}
                details="The control section ID that will be replaced by the variant for users who are in the experiment. Must be visible on production site"
              />
            )}
            <s-number-field
              label="Chance to show experiment"
              value={experimentChance}
              inputMode="numeric"
              onChange={(e) => {
                const value = Math.max(
                  0,
                  Math.min(100, Number(e.target.value)),
                );
                setExperimentChance(value);
              }}
              min={0}
              max={100}
              step={1}
              suffix="%"
            />
            {/* Variant 2 fields */}
            <s-stack display={variantDisplay} paddingBlock="base">
              <s-heading>Variant 2</s-heading>

              <s-stack direction="block" gap="small" paddingBlock="base">
                {/*Custom Label Row (SectionID + help link)*/}
                <s-link href="#" target="_blank">
                  How do I find my section?
                </s-link>
                <s-text-field
                  placeholder="shopify-section-sections--25210977943842__header"
                  value={variantSectionId}
                  label="Section ID to be tested"
                  required
                  onFocus={() => {
                    setSectionIdVariantError(null);
                    if (fetcher.data?.errors?.variantSectionId) {
                      //clear server-side errors by resetting fetcher data
                      fetcher.data = {
                        ...fetcher.data,
                        errors: {
                          ...fetcher.data.errors,
                          variantSectionId: undefined,
                        },
                      };
                    }
                  }}
                  onChange={(e) => {
                    const v = e.target.value;
                    setVariantSectionId(v);
                    if (emptySectionIdVariantError && v.trim())
                      setSectionIdVariantError(null);
                  }}
                  onBlur={handleSectionIdVariantBlur}
                  error={errors.variantSectionId || emptySectionIdVariantError}
                  details="The associated Shopify section ID to be tested. Must be visible on production site"
                />
              </s-stack>

              <s-number-field
                label="Chance to show experiment"
                value={variantExperimentChance}
                inputMode="numeric"
                onChange={(e) => {
                  const value = Math.max(
                    0,
                    Math.min(100, Number(e.target.value)),
                  );
                  setExperimentChance(value);
                }}
                min={0}
                max={100}
                step={1}
                suffix="%"
              />
            </s-stack>
            <s-select
              label="Customer segment to test"
              value={customerSegment}
              onChange={(e) => setCustomerSegment(e.target.value)}
              details="The customer segment that the experiment can be shown to."
            >
              <s-option value="allSegments" defaultSelected>
                All Segments
              </s-option>
              <s-option value="desktopVisitors">Desktop Visitors</s-option>
              <s-option value="mobileVisitors">Mobile Visitors</s-option>
            </s-select>
          </s-stack>
        </s-form>
      </s-section>

      <s-stack
        direction="inline"
        gap="small"
        justifyContent="end"
        paddingBlockEnd="base"
      >
        <s-button
          icon="minus"
          accessibilityLabel="Remove item"
          disabled={!variant}
          onClick={handleVariantUndo}
        >
          Remove Another Variant
        </s-button>
        <s-button
          icon="plus"
          accessibilityLabel="Add item"
          disabled={variant}
          onClick={handleVariant}
        >
          Add Another Variant
        </s-button>
      </s-stack>

      {/*Active dates/end conditions portion of code */}
      <s-section heading="Active Dates">
        <s-form>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base">
              <s-box flex="1" minInlineSize="220px" inlineSize="stretch">
                <s-date-field
                  id="startDateField"
                  label="Start Date"
                  placeholder="Select start date"
                  value={startDate}
                  error={
                    emptyStartDateError || startDateError || errors.startDate
                  }
                  required
                  onFocus={() => {
                    setEmptyStartDateError(null);
                    if (fetcher.data?.errors?.startDate) {
                      //clear server-side errors by resetting fetcher data
                      fetcher.data = {
                        ...fetcher.data,
                        errors: {
                          ...fetcher.data.errors,
                          startDate: undefined,
                        },
                      };
                    }
                  }}
                  onChange={(e) => {
                    const v = e.target.value;
                    handleDateChange("start", v);
                    if (emptyStartDateError && v.trim())
                      setEmptyStartDateError(null);
                  }}
                  onBlur={handleStartDateBlur}
                />
              </s-box>

              <s-box flex="1" minInlineSize="220px">
                <TimeSelect
                  id="startTimeSelect"
                  label="Start Time"
                  value={startTime}
                  onChange={handleStartTimeChange}
                  error={startTimeError}
                />
              </s-box>
            </s-stack>

            <s-stack gap="small">
              <s-paragraph>End condition</s-paragraph>
              <s-stack direction="inline" gap="base">
                <s-button
                  variant={endCondition === "manual" ? "primary" : "secondary"}
                  onClick={() => setEndCondition("manual")}
                >
                  Manual
                </s-button>
                <s-button
                  variant={endCondition === "endDate" ? "primary" : "secondary"}
                  onClick={() => setEndCondition("endDate")}
                >
                  End date
                </s-button>
                <s-button
                  variant={
                    endCondition === "stableSuccessProbability"
                      ? "primary"
                      : "secondary"
                  }
                  onClick={() => setEndCondition("stableSuccessProbability")}
                >
                  Stable success probability
                </s-button>
              </s-stack>
            </s-stack>
            {/*only show end date/time pickers if endCondition is "endDate" */}
            {endCondition === "endDate" && (
              <s-stack direction="inline" gap="base">
                <s-box flex="1" minInlineSize="220px" inlineSize="stretch">
                  <s-date-field
                    id="endDateField"
                    label="End Date"
                    placeholder="Select end date"
                    value={endDate}
                    error={
                      emptyEndDateError ||
                      endDateError ||
                      (endCondition === "endDate" && errors.endDate)
                    }
                    required
                    onFocus={() => {
                      setEmptyEndDateError(null);
                      if (fetcher.data?.errors?.endDate) {
                        //clear server-side errors by resetting fetcher data
                        fetcher.data = {
                          ...fetcher.data,
                          errors: {
                            ...fetcher.data.errors,
                            endDate: undefined,
                          },
                        };
                      }
                    }}
                    onChange={(e) => {
                      const v = e.target.value;
                      handleDateChange("end", v);
                      if (emptyEndDateError && v.trim())
                        setEmptyEndDateError(null);
                    }}
                    onBlur={handleEndDateBlur}
                  />
                </s-box>

                <s-box flex="1" minInlineSize="220px">
                  <TimeSelect
                    id="endTimeSelect"
                    label="End Time"
                    value={endTime}
                    onChange={handleEndTimeChange}
                    error={endTimeError}
                  />
                </s-box>
              </s-stack>
            )}

            {/*only show stable success probability fields if endCondition is "stableSuccessProbability" */}
            {endCondition === "stableSuccessProbability" && (
              <s-stack direction="inline" gap="base">
                <s-stack
                  flex="1"
                  direction="inline"
                  gap="base"
                  alignItems="start"
                >
                  <s-stack inlineSize="250px">
                    <s-number-field
                      label="Probability to be the best greater than"
                      suffix="%"
                      inputMode="numeric"
                      min="51"
                      max="100"
                      step="1"
                      value={probabilityToBeBest}
                      required
                      error={
                        probabilityToBeBestError ||
                        (endCondition === "stableSuccessProbability" &&
                          errors.probabilityToBeBest)
                      }
                      onFocus={() => {
                        setProbabilityToBeBestError(null);
                        if (fetcher.data?.errors?.probabilityToBeBest) {
                          //clear server-side errors by resetting fetcher data
                          fetcher.data = {
                            ...fetcher.data,
                            errors: {
                              ...fetcher.data.errors,
                              probabilityToBeBest: undefined,
                            },
                          };
                        }
                      }}
                      onInput={(e) => {
                        const v = e.target.value;
                        handleProbabilityOfBestChange("probabilityToBeBest", v);
                        if (!duration) {
                          handleProbabilityOfBestChange("duration", "");
                        }
                        if (
                          probabilityToBeBestError &&
                          v.trim() &&
                          !probabilityToBeBestError
                        )
                          setProbabilityToBeBestError(null);
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        handleProbabilityOfBestChange("probabilityToBeBest", v);
                        if (
                          probabilityToBeBestError &&
                          v.trim() &&
                          !probabilityToBeBestError
                        )
                          setProbabilityToBeBestError(null);
                      }}
                      onBlur={handleProbabilityToBeBestBlur}
                    />
                  </s-stack>
                  <s-stack inlineSize="100px">
                    <s-number-field
                      label="For at least"
                      inputMode="numeric"
                      min="1"
                      value={duration}
                      error={durationError}
                      required
                      onChange={(e) => {
                        const v = e.target.value;
                        handleProbabilityOfBestChange("duration", v);
                        if (durationError && v.trim() && !durationError)
                          setDurationError(null);
                      }}
                      onInput={(e) => {
                        const v = e.target.value;
                        handleProbabilityOfBestChange("duration", v);
                        if (durationError && v.trim() && !durationError)
                          setDurationError(null);
                      }}
                      onBlur={handleDurationBlur}
                    />
                  </s-stack>
                  <s-stack inlineSize="90px" paddingBlockStart="base">
                    <div style={{ marginTop: "-16px" }}>
                      <s-select
                        label="Time Unit"
                        error={timeUnitError}
                        value={timeUnit}
                        onChange={(e) => {
                          setTimeUnit(e.target.value);
                        }}
                      >
                        <s-option value="days">Days</s-option>
                        <s-option value="weeks">Weeks</s-option>
                        <s-option value="months">Months</s-option>
                      </s-select>
                    </div>
                  </s-stack>
                </s-stack>
              </s-stack>
            )}
          </s-stack>
        </s-form>
      </s-section>
      <div style={{ marginBottom: "250px" }}>
        <s-stack direction="inline" gap="small" justifyContent="end">
          <s-button 
            onClick={handleDiscard}
            variant="secondary">
            Discard
          </s-button>
          <s-button 
            variant="primary" 
            disabled={hasClientErrors || isSubmitting} 
            onClick={handleExperimentCreate}>
            Save Draft
          </s-button>
        </s-stack>
      </div>
    </s-page>
  );
}
