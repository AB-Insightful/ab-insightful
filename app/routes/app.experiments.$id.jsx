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
import { useFetcher, redirect, useLoaderData, useRevalidator } from "react-router";
import { useState, useEffect } from "react";
import db from "../db.server";
import { ExperimentStatus } from "@prisma/client";
import { TimeSelect } from "../utils/timeSelect";
import { validateStartIsInFuture } from "../utils/validateStartIsInFuture";
import { validateEndIsAfterStart } from "../utils/validateEndIsAfterStart";
import { localDateTimeToISOString } from "../utils/localDateTimeToISOString";
import { canRenameExperiment, isLockedStatus, canEditStructure, canEditSchedule, allowedStatusIntents, } from "./policies/experimentPolicy";


// Server side code
export const loader = async ({ params, request }) => {
  // Authenticate request
  const { session } = await authenticate.admin(request);
  const experimentId = parseInt(params.id, 10);

  if (!experimentId || isNaN(experimentId)) {
    throw new Response("Invalid experiment ID", { status: 400 });
  }

  // Fetch the experiment with all related data
  const experiment = await db.experiment.findUnique({
    where: { id: experimentId },
    include: {
      experimentGoals: {
        include: {
          goal: true,
        },
      },
      variants: false, // we only need to know if variants exist and the first variant's sectionId, so we can skip fetching all variant details
    },
  });

  if (!experiment) {
    throw new Response("Experiment not found", { status: 404 });
  }

  // Convert dates to YYYY-MM-DD format and extract times
  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatTime = (date) => {
    if (!date) return "00:00";
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  // Map goal name back to internal key
  const goalNameToKey = {
    "Viewed Page": "viewPage",
    "Started Checkout": "startCheckout",
    "Added Product to Cart": "addToCart",
    "Completed Checkout": "completedCheckout",
  };

  const primaryGoal = experiment.experimentGoals.find(
    (eg) => eg.goalRole === "primary",
  );
  const goalKey = primaryGoal
    ? goalNameToKey[primaryGoal.goal.name] || "completedCheckout"
    : "completedCheckout";

  return {
    experiment: {
      id: experiment.id,
      status: experiment.status,
      name: experiment.name,
      description: experiment.description,
      sectionId: experiment.sectionId,
      controlSectionId: experiment.controlSectionId,
      trafficSplit: experiment.trafficSplit * 100, // Convert back to percentage
      startDate: formatDate(experiment.startDate),
      startTime: formatTime(experiment.startDate),
      endDate: formatDate(experiment.endDate),
      endTime: formatTime(experiment.endDate),
      endCondition: experiment.endCondition,
      goal: goalKey,
      probabilityToBeBest: experiment.probabilityToBeBest,
      duration: experiment.duration,
      timeUnit: experiment.timeUnit,
      hasVariants: experiment.variants && experiment.variants.length > 0,
      variantSectionId:
        experiment.variants && experiment.variants.length > 0
          ? experiment.variants[0].sectionId
          : "",
    },
  };
};

export const action = async ({ request, params }) => {

  /* ====================================================================================================
   Authenticate + Basic gets
   ==================================================================================================== */
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const experimentId = parseInt(params.id, 10);
  const intent = formData.get("intent");

  /* ====================================================================================================
   Fetch existing + Status Policy
   ==================================================================================================== */
  const existing = await db.experiment.findUnique({
    where: { id: experimentId },
    include: { experimentGoals: true },
  });

  if (!existing) {
    console.error(`[EDIT] Experiment not found id=${experimentId}`);
    return { errors: { form: "Experiment not found" } };
  }

  const status = existing.status;
  const isDraft = status === ExperimentStatus.draft;
  const allowedIntents = allowedStatusIntents(status);

  //block if intent exists but not allowed for status
  if (intent && !allowedIntents.has(intent)) {
    return { ok: false, error: "Status change not allowed for this experiment." };
  }

  const { 
    pauseExperiment,
    resumeExperiment,
    endExperiment,
    startExperiment,
    deleteExperiment,
    archiveExperiment, 
  } = await import("../services/experiment.server");

  switch (intent) {
    case "pause":
      // Handles ET-22: Direct database update for one experiment
      try {
        await pauseExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.paused };
      } catch (error) {
        console.error("Pause Error:", error);
        return { ok: false, error: "Failed to pause experiment" }, { status: 500 };
      }

    case "resume":
      try {
        await resumeExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.active };
      } catch (error) {
        console.error("Resume Error:", error);
        return { ok: false, error: "Failed to resume experiment" }, { status: 500 };
      }

    case "archive":
      try {
        await archiveExperiment(experimentId);
        return {ok: true, action: ExperimentStatus.archived}; 
      } catch (error) {
        console.error("Archive Error:", error);
        return {ok: false, error: "Failed to archive experiment"}, { status: 500};
      }
    
    case "delete":
      try {
        await deleteExperiment(experimentId);
        return { ok: true, action: "deleteExperiment" };
      } catch (error) {
        console.error("Delete Error:", error);
        return { ok: false, error: "Failed to delete experiment"}, {status: 500}
      }

    case "start":
      try {
        await startExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.active };
      } catch (error) {
        console.error("Start Error:", error);
        return { ok: false, error: "Failed to start experiment"}, {status: 500}
      }

    case "end":
      try {
        await endExperiment(experimentId);
        return { ok: true, action: ExperimentStatus.completed };
      } catch (error) {
        console.error("End Error:", error);
        return { ok: false, error: "Failed to end experiment"}, {status: 500}
      }

    default:
      break;
  }
  
  const isLocked = isLockedStatus(status);

  const editStructure = canEditStructure(status);
  const editSchedule = canEditSchedule(status);
  const canRename = canRenameExperiment(status);

  // Locked experiments allow only rename, block everything else
  if (isLocked) {
    // if they are trying to "edit", they must at least be renaming
    const name = (formData.get("name") || "").trim();

    if (!name) {
      return { errors: { form: "This experiment can no longer be edited." } };
    }

    try {
      const updated = await db.experiment.update({
        where: { id: experimentId },
        data: { name }, // rename only
      });
      return { ok: true, experimentId: updated.id };
    } catch (err) {
      console.error(`[EDIT][DB FAIL][RENAME ONLY] experimentId=${experimentId}`, err);
      return { errors: { form: "Database failed to rename experiment." } };
    }
  }
  

  /* ====================================================================================================
   Read Form Fields
   ==================================================================================================== */
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
  const probabilityToBeBestStr = (formData.get("probabilityToBeBest") || "").trim();
  const durationStr = (formData.get("duration") || "").trim();
  const timeUnitValue = (formData.get("timeUnit") || "").trim();

  // Date/Time Fields (accepts both client-side UTC strings or separate date/time fields)
  const startDateUTC = (formData.get("startDateUTC") || "").trim();
  const endDateUTC = (formData.get("endDateUTC") || "").trim();
  const startDateStr = (formData.get("startDate") || "").trim();
  const startTimeStr = (formData.get("startTime") || "").trim();
  const endDateStr = (formData.get("endDate") || "").trim();
  const endTimeStr = (formData.get("endTime") || "").trim();

  /* ====================================================================================================
   Validation
   ==================================================================================================== */
  // Storage Validation Errors
  const errors = {}; // will be length 0 when there are no errors

  if (!name) errors.name = "Name is required";
  if (!description) errors.description = "Description is required";
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
  if (isDraft && !startDateTime) {
    errors.startDate = "Start date is required";
  } else if (isDraft && startDateTime <= now) {
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

  /* ====================================================================================================
   Normalize Types
   ==================================================================================================== */
  // Converts the date string to a Date object for Prisma
  // If no date was provided, set to null
  const startDate = startDateTime;
  const endDate = endDateTime || null;

  //convert stable success probability variables to schema-ready types
  const probabilityToBeBest = probabilityToBeBestStr ? Number(probabilityToBeBestStr) : null;
  const duration = durationStr ? Number(durationStr) : null;
  const timeUnit = timeUnitValue || null;

  /* ====================================================================================================
   Build Update Payload
   ==================================================================================================== */

  const updateData = {};

  // schedule-level edits (allowed in draft + active/paused)
  if (editSchedule) {
    updateData.name = name;
    updateData.description = description;
    updateData.endCondition = endCondition;

    if (isDraft) updateData.startDate = startDate;

    updateData.endDate = endCondition === "endDate" ? endDate : null;

    if (endCondition === "stableSuccessProbability") {
      updateData.probabilityToBeBest = probabilityToBeBest;
      updateData.duration = duration;
      updateData.timeUnit = timeUnit;
    } else {
      updateData.probabilityToBeBest = null;
      updateData.duration = null;
      updateData.timeUnit = null;
    }
  }

  // structure edits (draft only)
  if (editStructure) {
    updateData.sectionId = sectionId;
    updateData.controlSectionId = controlSectionId;
    updateData.trafficSplit = parseFloat(trafficSplitStr) / 100.0;
  }

  /* ====================================================================================================
   Goal Ops for Draft
   ==================================================================================================== */
  let goalOps = null;

  if (editStructure) {
    const goalNameMap = {
      viewPage: "Viewed Page",
      startCheckout: "Started Checkout",
      addToCart: "Added Product to Cart",
      completedCheckout: "Completed Checkout",
    };

    const goalName = goalNameMap[goalValue];

    const goalRecord = await db.goal.findUnique({
      where: { name: goalName },
    });

    if (!goalRecord) {
      return { errors: { goal: "Could not find matching goal in database" } };
    }

    goalOps = {
      deleteMany: { goalRole: "primary" },
      create: [{ goalId: goalRecord.id, goalRole: "primary" }],
    };
  }

  /* ====================================================================================================
   DB update + return
   ==================================================================================================== */

  try {
    const updated = await db.experiment.update({
      where: { id: experimentId },
      data: {
        ...updateData,
        ...(goalOps ? { experimentGoals: goalOps } : {}),
      },
    });

    return { ok: true, experimentId: updated.id };
  } catch (err) {
    console.error(
      `[EDIT][DB FAIL] experimentId=${experimentId} shop=${session.shop}`,
      err
    );

    return { errors: { form: "Database failed to update experiment." } };
  }
};

//--------------------------- client side ----------------------------------------


export default function EditExperiment() {
  //fetcher stores the data in the fields into a form that can be retrieved
  const fetcher = useFetcher();
  const loaderData = useLoaderData();
  const revalidator = useRevalidator();

  // allowable edits
  const status = loaderData?.experiment?.status;
  const isDraft = status === ExperimentStatus.draft;

  const isLocked = isLockedStatus(status);
  const isArchived = status === ExperimentStatus.archived;

  const editStructure = canEditStructure(status);
  const editSchedule = canEditSchedule(status);
  const canRename = canRenameExperiment(status); // always true
  const statusIntents = allowedStatusIntents(status);

  //if locked only thing we allow is renaming
  const renameOnlyMode = isLocked && canRename;

  // make sure dates don't throw errors that block renaming
  const canEditStartDateTime = !isLocked && isDraft;
  const canEditEndCondition = !isLocked && editSchedule;

  //state variables (special variables that remember across re-renders (e.g. user input, counters))
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(null);
  const [description, setDescription] = useState("");
  const [emptyDescriptionError, setDescriptionError] = useState(null);
  const [sectionId, setSectionId] = useState("");
  const [controlSectionId, setControlSectionId] = useState("");
  const [emptySectionIdError, setSectionIdError] = useState(null);
  const [emptySectionIdVariantError, setSectionIdVariantError] = useState(null);
  const [emptyStartDateError, setEmptyStartDateError] = useState(null);
  const [emptyEndDateError, setEmptyEndDateError] = useState(null);
  const [endDate, setEndDate] = useState("");
  const [endDateError, setEndDateError] = useState("");
  const [experimentChance, setExperimentChance] = useState(50);
  const [endCondition, setEndCondition] = useState("manual");
  const [goalSelected, setGoalSelected] = useState("completedCheckout");
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

  //badges for status
  const renderStatusBadge = (status) => {
    if (status === ExperimentStatus.active)
      return <s-badge tone="info" icon="gauge">Active</s-badge>;
    if (status === ExperimentStatus.paused)
      return <s-badge tone="caution" icon="pause-circle">Paused</s-badge>;
    if (status === ExperimentStatus.completed)
      return <s-badge tone="success" icon="check">Completed</s-badge>;
    if (status === ExperimentStatus.archived)
      return <s-badge tone="warning" icon="order">Archived</s-badge>;
    return <s-badge icon="draft-orders">Draft</s-badge>;
  };
  

  //status popover refresher
  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (!fetcher.data?.ok) return;

    const refreshActions = [
      ExperimentStatus.active,
      ExperimentStatus.paused,
      ExperimentStatus.completed,
      ExperimentStatus.archived,
    ];

    if (refreshActions.includes(fetcher.data.action)) {
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

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

  // Prepopulate form with existing experiment data
  useEffect(() => {
    if (loaderData?.experiment) {
      const exp = loaderData.experiment;
      setName(exp.name);
      setDescription(exp.description);
      setSectionId(exp.sectionId);
      setControlSectionId(exp.controlSectionId);
      setExperimentChance(exp.trafficSplit);
      setStartDate(exp.startDate);
      setStartTime(exp.startTime);
      setEndDate(exp.endDate);
      setEndTime(exp.endTime);
      setEndCondition(exp.endCondition);
      setGoalSelected(exp.goal);
      setProbabilityToBeBest(exp.probabilityToBeBest || "");
      setDuration(exp.duration || "");
      setTimeUnit(exp.timeUnit || "days");

      if (exp.hasVariants) {
        setVariant(true);
        setVariantDisplay("auto");
        setVariantSectionId(exp.variantSectionId);
      }
    }
  }, [loaderData]);

  const [probabilityToBeBestError, setProbabilityToBeBestError] = useState("");
  const [durationError, setDurationError] = useState("");
  const [probabilityToBeBest, setProbabilityToBeBest] = useState("");
  const [duration, setDuration] = useState("");
  const [timeUnit, setTimeUnit] = useState("days");
  const [timeUnitError, setTimeUnitError] = useState("");

  const error = fetcher.data?.error; // Fetches error from server side MIGHT CAUSE ERROR

  const errors = fetcher.data?.errors || {}; // looks for error data, if empty instantiate errors as empty object

  //Check if there were any errors on the form
  const hasClientErrors = renameOnlyMode ? (!!nameError || !!errors.name) :
    (
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
      (canEditStartDateTime && (!!startDateError || !!errors.startDate || !!startTimeError)) ||
      !!emptyStartDateError ||
      (canEditEndCondition && (!!endDateError || !!errors.endDate || !!endTimeError || !!emptyEndDateError))
    )

  //check for fetcher state, want to block save draft button if in the middle of sumbitting
  const isSubmitting = fetcher.state === "submitting";

  const handleExperimentEdit = async () => {
    const experimentData = renameOnlyMode ? { name: name } : (() => {

      // creates data object for all current state variables
      const startDateUTC = startDate
        ? localDateTimeToISOString(startDate, startTime)
        : "";
      const effectiveEndTime = endDate && !endTime ? "23:59" : endTime;
      const endDateUTC = endDate
        ? localDateTimeToISOString(endDate, effectiveEndTime)
        : "";

      return {
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
    })();

    try {
      await fetcher.submit(experimentData, { method: "POST" });
    } catch (error) {
      console.error("Error during fetcher.submit", error);
    }
  }; // end HandleEditExperiment()

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

    // Validate start is in future and only validate if field isn't disabled
    if (canEditStartDateTime) {
      const { dateError: startDErr, timeError: startTErr } = validateStartIsInFuture(startDateVal, startTimeVal);
      newStartDateError = startDErr;
      newStartTimeError = startTErr;
    }

    // Validate end date is not in the past and only validate if field isn't disabled
    if (canEditEndCondition && condition === "endDate" && endDateVal) {
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
    <s-page heading="Edit Experiment" variant="headingLg">
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={!canRename || hasClientErrors || isSubmitting}
        onClick={handleExperimentEdit}
      >
        Save Draft
      </s-button>
      <s-button slot="secondary-actions" href="/app/experiments">
        Discard
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
          minWidth: "300px",
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
                ? new Date(`${endDate}T00:00:00`).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "—"}
            </s-text>

            {/* Status + actions (bottom of side panel) */}
            <s-box paddingBlockStart="base">
              <s-stack direction="inline" alignItems="center" justifyContent="space-between">
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-text font-weight="heavy">Status</s-text>
                  {renderStatusBadge(status)}
                </s-stack>

                <s-button
                  commandFor={`status-popover-${loaderData.experiment.id}`}
                  variant="tertiary"
                  icon="horizontal-dots"
                  accessibilityLabel="Change status"
                  disabled={isArchived || statusIntents.size === 0 || fetcher.state !== "idle"}
                >
                Change Status
                </s-button>

                <s-popover id={`status-popover-${loaderData.experiment.id}`}>
                  <s-stack direction="block">
                    {statusIntents.has("start") && (
                      <s-button
                        variant="tertiary"
                        commandFor={`status-popover-${loaderData.experiment.id}`}
                        disabled={fetcher.state !== "idle"}
                        onClick={() => fetcher.submit({ intent: "start" }, { method: "post" })}
                      >
                        Start
                      </s-button>
                    )}

                    {statusIntents.has("pause") && (
                      <s-button
                        variant="tertiary"
                        commandFor={`status-popover-${loaderData.experiment.id}`}
                        disabled={fetcher.state !== "idle"}
                        onClick={() => fetcher.submit({ intent: "pause" }, { method: "post" })}
                      >
                        Pause
                      </s-button>
                    )}

                    {statusIntents.has("resume") && (
                      <s-button
                        variant="tertiary"
                        commandFor={`status-popover-${loaderData.experiment.id}`}
                        disabled={fetcher.state !== "idle"}
                        onClick={() => fetcher.submit({ intent: "resume" }, { method: "post" })}
                      >
                        Resume
                      </s-button>
                    )}

                    {statusIntents.has("end") && (
                      <s-button
                        variant="tertiary"
                        commandFor={`status-popover-${loaderData.experiment.id}`}
                        disabled={fetcher.state !== "idle"}
                        onClick={() => fetcher.submit({ intent: "end" }, { method: "post" })}
                      >
                        End
                      </s-button>
                    )}

                    {statusIntents.has("archive") && (
                      <s-button
                        variant="tertiary"
                        commandFor={`status-popover-${loaderData.experiment.id}`}
                        disabled={fetcher.state !== "idle"}
                        onClick={() => fetcher.submit({ intent: "archive" }, { method: "post" })}
                      >
                        Archive
                      </s-button>
                    )}

                    {statusIntents.has("delete") && (
                      <s-button
                        variant="tertiary"
                        commandFor={`status-popover-${loaderData.experiment.id}`}
                        disabled={fetcher.state !== "idle"}
                        onClick={() => fetcher.submit({ intent: "delete" }, { method: "post" })}
                      >
                        Delete
                      </s-button>
                    )}
                  </s-stack>
                </s-popover>
              </s-stack>
            </s-box>
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
                disabled={!canRename}
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
                disabled={isLocked || !editSchedule}
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
              disabled={isLocked || !editStructure}
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
                disabled={isLocked || !editStructure}
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

            {/* There is no error checking for this section intentionally. If a user supplies a control ID, that's great */}
            {/* But, you don't need it and may not want it, so it can be blank. */}
            <s-text-field
              placeholder="shopify-section-sections--25210972849284__header"
              value={controlSectionId}
              label="Optional: Control Section ID"
              required
              disabled={isLocked || !editStructure}
              onChange={(e) => {
                const v = e.target.value;
                setControlSectionId(v);
              }}
              details="The control section ID that will be replaced by the variant for users who are in the experiment. Must be visible on production site"
            />

            <s-number-field
              label="Chance to show experiment"
              value={experimentChance}
              inputMode="numeric"
              disabled={isLocked || !editStructure}
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
                  disabled={isLocked || !editStructure}
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
                disabled={isLocked || !editStructure}
                onChange={(e) => {
                  const value = Math.max(
                    0,
                    Math.min(100, Number(e.target.value)),
                  );
                  setVariantExperimentChance(value);
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
              disabled={isLocked || !editStructure}
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
          disabled={!variant || !editStructure || isLocked}
          onClick={handleVariantUndo}
        >
          Remove Another Variant
        </s-button>
        <s-button
          icon="plus"
          accessibilityLabel="Add item"
          disabled={variant || !editStructure || isLocked}
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
                  disabled={isLocked || !isDraft}
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
                  disabled={isLocked || !isDraft}
                />
              </s-box>
            </s-stack>

            <s-stack gap="small">
              <s-paragraph>End condition</s-paragraph>
              <s-stack direction="inline" gap="base">
                <s-button
                  variant={endCondition === "manual" ? "primary" : "secondary"}
                  disabled={isLocked || !editSchedule}
                  onClick={() => setEndCondition("manual")}
                >
                  Manual
                </s-button>
                <s-button
                  variant={endCondition === "endDate" ? "primary" : "secondary"}
                  disabled={isLocked || !editSchedule}
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
                  disabled={isLocked || !editSchedule}
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
                    disabled={isLocked || !editSchedule}
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
                    disabled={isLocked || !editSchedule}
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
                      disabled={isLocked || !editSchedule}
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
                      disabled={isLocked || !editSchedule}
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
                        disabled={isLocked || !editSchedule}
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
          <s-button href="/app/experiments">Discard</s-button>
          <s-button
            variant="primary"
            disabled={!canRename || hasClientErrors || isSubmitting}
            onClick={handleExperimentEdit}
          >
            Save Draft
          </s-button>
        </s-stack>
      </div>
    </s-page>
  );
}
