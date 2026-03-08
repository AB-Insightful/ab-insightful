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
import { useState, useEffect, useRef } from "react";
import db from "../db.server";
import { ExperimentStatus } from "@prisma/client";
import { TimeSelect } from "../utils/timeSelect";
import { validateStartIsInFuture } from "../utils/validateStartIsInFuture";
import { validateEndIsAfterStart } from "../utils/validateEndIsAfterStart";
import { localDateTimeToISOString } from "../utils/localDateTimeToISOString";

// Server side code
export const action = async ({ request }) => {
  const formData = await request.formData();
  const intent = formData.get("intent"); //for tutorialData

  //tutorial db update
  if (intent === "tutorial_viewed") {
    try {
      const { setCreateExpPage } = await import(
        "../services/tutorialData.server"
      );
      await setCreateExpPage(1, true); //always sets the item in tutorialdata to true, selects 1st tuple
      return { ok: true, action: "tutorial_viewed" };
    } catch (error) {
      console.error("Tutorial Error:", error);
      return (
        { ok: false, error: "Failed to update viewedListExperiment" },
        { status: 500 }
      );
    }
  } else {
    // Authenticate request
    const { session } = await authenticate.admin(request);

    // Get POST request form data & create experiment
    const name = (formData.get("name") || "").trim();
    const description = (formData.get("description") || "").trim();
    const controlSectionId = (formData.get("controlSectionId") || "").trim();
    const goalValue = (formData.get("goal") || "").trim();
    const endCondition = (formData.get("endCondition") || "").trim();

    let variantInputs;
    try {
      variantInputs = JSON.parse(formData.get("variantsJSON") || "[]");
    } catch {
      variantInputs = [];
    }
    const sectionId = (variantInputs[0]?.sectionId || "").trim();
    const totalTrafficPct = variantInputs.reduce(
      (sum, v) => sum + (v.trafficAllocation || 0),
      0,
    );
    const trafficSplitStr = String(totalTrafficPct);
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
    variantInputs.forEach((v, i) => {
      if (!(v.sectionId || "").trim()) {
        errors[`variant_${i}_sectionId`] =
          `Variant ${String.fromCharCode(65 + i)} Section ID is required`;
      }
    });
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
      return {
        errors: { goal: "Could not find matching goal in the database" },
      };
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
      status: ExperimentStatus.draft,
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

    const treatmentVariants = variantInputs.map((v) => ({
      sectionId: (v.sectionId || "").trim(),
      trafficAllocation: (v.trafficAllocation || 0) / 100.0,
    }));

    const { createExperiment } = await import("../services/experiment.server");
    const experiment = await createExperiment(experimentData, {
      controlSectionId,
      variants: treatmentVariants,
    });

    return redirect(`/app/experiments/${experiment.id}?isNewlyCreated=true`);
    }
  }; //end async action

  

//pull the default goal stored in database, completedCheckout if empty
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const project = await db.project.findUnique({
    where: { shop: session.shop },
    select: { defaultGoal: true },
  });

  //looks up tutorial data
  const { getTutorialData } = await import("../services/tutorialData.server");
  const tutorialInfo = await getTutorialData();

  return {
    defaultGoal: project?.defaultGoal ?? "completedCheckout",
    tutorialData: tutorialInfo,
    shopDomain: session.shop, // provides shop domain for sectionId Picker Mode
  };
};

//--------------------------- client side ----------------------------------------

export default function CreateExperiment() {
  //fetcher stores the data in the fields into a form that can be retrieved
  const fetcher = useFetcher();
  const { defaultGoal, tutorialData, shopDomain } = useLoaderData();
  const tutorialFetcher = useFetcher();
  const modalRef = useRef(null);

  const [tutorialDismissed, setTutorialDismissed] = useState(false); //this page needs to track tutorial display locally and on db
  //state variables (special variables that remember across re-renders (e.g. user input, counters))
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(null);
  const [description, setDescription] = useState("");
  const [emptyDescriptionError, setDescriptionError] = useState(null);
  const MAX_VARIANTS = 4;
  const VARIANT_LABELS = ["A", "B", "C", "D"];

  const [variants, setVariants] = useState([
    { sectionId: "", trafficAllocation: 50 },
  ]);
  const [variantSectionErrors, setVariantSectionErrors] = useState([null]);
  const [addControlSection, setAddControlSection] = useState(false);
  const [controlSectionId, setControlSectionId] = useState("");
  const [emptyStartDateError, setEmptyStartDateError] = useState(null);
  const [emptyEndDateError, setEmptyEndDateError] = useState(null);
  const [endDate, setEndDate] = useState("");
  const [endDateError, setEndDateError] = useState("");
  const [endCondition, setEndCondition] = useState("manual");
  const [goalSelected, setGoalSelected] = useState(defaultGoal);
  const [customerSegment, setCustomerSegment] = useState("allSegments");
  const [startDate, setStartDate] = useState("");
  const [startDateError, setStartDateError] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [startTimeError, setStartTimeError] = useState("");
  const [endTimeError, setEndTimeError] = useState("");

  const pickingTargetRef = useRef({type: null, index:null});

  const handleLaunchPicker = (type, index = null) => {
    pickingTargetRef.current = { type, index };
    window.open(`https://${shopDomain}?ab_insightful_picker=true`, "_blank");
  };
  
  // Message bridge listener 
  useEffect(() => {
    const handleMessage = (event) => {
      // Verify the message is the type we expect
      if (event.data && event.data.type === "AB_INSIGHTFUL_SECTION_PICKED") {
        const pickedId = event.data.sectionId; // Loads selected sectionId on live site
        const target = pickingTargetRef.current;

        if (target.type === "variant" && target.index !== null) {
          // Update the specific variant sectionID picked 
          setVariants((prev) =>
            prev.map((v, i) =>
              i === target.index ? { ...v, sectionId: pickedId } : v
            )
          );
          
          // Clear any visual errors for this section
          setVariantSectionErrors((prev) => {
            const next = [...prev];
            next[target.index] = null;
            return next;
          });
        } else if (target.type === "control") {
          setControlSectionId(pickedId);
        }

        // Reset the tracker
        pickingTargetRef.current = { type: null, index: null };
        
        // Shopify App Bridge success toast
        if (typeof shopify !== "undefined" && shopify.toast) {
          shopify.toast.show("Section ID copied!");
        }

      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  //tutorial display conditional
  useEffect(() => {
    if (
      !tutorialDismissed &&
      tutorialData.createExperiment == false &&
      modalRef.current &&
      typeof modalRef.current.showOverlay === "function"
    ) {
      modalRef.current.showOverlay();
    }
  }, [tutorialData]);



  useEffect(() => {
    // keep all date/time errors in sync whenever any date/time value changes
    const errors = validateAllDateTimes(startDate, startTime, endDate, endTime);
    if (errors.startDateError !== startDateError)
      setStartDateError(errors.startDateError);
    if (errors.startTimeError !== startTimeError)
      setStartTimeError(errors.startTimeError);
    if (errors.endDateError !== endDateError)
      setEndDateError(errors.endDateError);
    if (errors.endTimeError !== endTimeError)
      setEndTimeError(errors.endTimeError);

    //checks for tutorial data
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

  const controlAllocation = Math.max(
    0,
    100 - variants.reduce((sum, v) => sum + v.trafficAllocation, 0),
  );

  const hasClientErrors =
    !!nameError ||
    !!errors.name ||
    !!emptyDescriptionError ||
    !!errors.description ||
    variantSectionErrors.some((e) => !!e) ||
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
      controlSectionId: controlSectionId,
      variantsJSON: JSON.stringify(variants),
      goal: goalSelected,
      endCondition: endCondition,
      startDateUTC: startDateUTC,
      endDateUTC: endDateUTC,
      endDate: endDate,
      probabilityToBeBest: probabilityToBeBest,
      duration: duration,
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

  const updateVariant = (index, field, value) => {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    );
  };

  const handleVariantSectionIdBlur = (index) => {
    setVariantSectionErrors((prev) => {
      const next = [...prev];
      next[index] = !variants[index].sectionId.trim()
        ? "Section ID is a required field"
        : null;
      return next;
    });
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

  const handleAddVariant = () => {
    if (variants.length >= MAX_VARIANTS) return;
    const newCount = variants.length + 1;
    const evenSplit = Math.floor(100 / (newCount + 1));
    setVariants((prev) => [
      ...prev.map((v) => ({ ...v, trafficAllocation: evenSplit })),
      { sectionId: "", trafficAllocation: evenSplit },
    ]);
    setVariantSectionErrors((prev) => [...prev, null]);
  };

  const handleRemoveVariant = () => {
    if (variants.length <= 1) return;
    const newCount = variants.length - 1;
    const evenSplit = Math.floor(100 / (newCount + 1));
    setVariants((prev) =>
      prev.slice(0, -1).map((v) => ({ ...v, trafficAllocation: evenSplit })),
    );
    setVariantSectionErrors((prev) => prev.slice(0, -1));
  };

  const handleDiscard = () => {
    setName("");
    setDescription("");
    setVariants([{ sectionId: "", trafficAllocation: 50 }]);
    setVariantSectionErrors([null]);
    setAddControlSection(false);
    setControlSectionId("");
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

  // derive current badge info and icon from selected goal
  const { label, icon } = goalMap[goalSelected] ?? {
    label: "—",
    icon: "alert",
  };
  const customerSegments = segmentMap[customerSegment] ?? "—";

  return (
    <s-page heading="Create Experiment" variant="headingLg">
      {/*modal popup for tutorial */}
      <s-modal
        id="tutorial-modal-create-exp"
        ref={modalRef}
        heading="Quick tour"
        padding="base"
        size="base"
      >
        <s-stack gap="base">
          <s-paragraph>
            Welcome to the Create Experiments Page

This page allows you to design and configure new experiments to test different variations of your online store and optimize for your key goals.

Here you can:

Enter a unique experiment name and description

Select experiment parameters and variables

Define what constitutes a successful outcome for your experiment by choosing a goal

Configure start and end conditions, including specific dates or performance thresholds

Save your experiment as a draft or launch it immediately

Once created, your experiment will appear in the Experiments List page where you can monitor and manage it.
          </s-paragraph>

          <s-button
            variant="primary"
            inLineSize="fill"
            commandFor="tutorial-modal-create-exp"
            command="--hide"
            onClick={() => {
              setTutorialDismissed(true);
              tutorialFetcher.submit(
                { intent: "tutorial_viewed" },
                { method: "post" },
              );
            }}
          >
            {" "}
            Understood. Do not show this again.
          </s-button>
        </s-stack>
      </s-modal>
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
        <s-section heading={name ? name : "Unnamed Experiment"}>
          <s-stack gap="small">
            <s-badge icon={icon}>{label}</s-badge>
            {variants.map((v, i) => (
              <s-badge
                key={i}
                tone={v.sectionId ? "" : "warning"}
                icon={v.sectionId ? "code" : "alert-circle"}
              >
                Variant {VARIANT_LABELS[i]}:{" "}
                {v.sectionId || "Section not selected"}
              </s-badge>
            ))}

            <s-text font-weight="heavy">Experiment Details</s-text>

            <s-text>• {customerSegments}</s-text>
            <s-text>
              •{" "}
              {variants.length === 1
                ? "Single Variation"
                : `${variants.length} Variations`}
            </s-text>
            {variants.map((v, i) => (
              <s-text key={i}>
                • {v.trafficAllocation}% Variant {VARIANT_LABELS[i]}
              </s-text>
            ))}
            <s-text>• {controlAllocation}% Control</s-text>
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
            {variants.map((variant, i) => (
              <s-stack
                key={i}
                direction="block"
                gap="small"
                paddingBlock={i > 0 ? "base" : undefined}
              >
                <s-heading>Variant {VARIANT_LABELS[i]}</s-heading>
                <s-stack direction="inline" gap="small" alignItems="end">
                  <div style={{ flex: 1 }}>
                    <s-text-field
                      placeholder="shopify-section-sections--25210977943842__header"
                      value={variant.sectionId}
                      label="Section ID to be tested"
                      required
                      onFocus={() => {
                        setVariantSectionErrors((prev) => {
                          const next = [...prev];
                          next[i] = null;
                          return next;
                        });
                        if (fetcher.data?.errors?.[`variant_${i}_sectionId`]) {
                          fetcher.data = {
                            ...fetcher.data,
                            errors: {
                              ...fetcher.data.errors,
                              [`variant_${i}_sectionId`]: undefined,
                            },
                          };
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateVariant(i, "sectionId", val);
                        if (variantSectionErrors[i] && val.trim()) {
                          setVariantSectionErrors((prev) => {
                            const next = [...prev];
                            next[i] = null;
                            return next;
                          });
                        }
                      }}
                      onBlur={() => handleVariantSectionIdBlur(i)}
                      error={variantSectionErrors[i] || errors[`variant_${i}_sectionId`]}
                      details="The associated Shopify section ID to be tested. Must be visible on production site"
                    />
                  </div>
                  <div style={{ paddingBottom: '24px' }}>
                    <s-button 
                      variant="secondary"
                      onClick={() => handleLaunchPicker("variant", i)}
                    >
                      Select Visually
                    </s-button>
                  </div>
                </s-stack>
                <s-number-field
                  label={`Traffic allocation for Variant ${VARIANT_LABELS[i]}`}
                  value={variant.trafficAllocation}
                  inputMode="numeric"
                  onChange={(e) => {
                    const othersTotal = variants.reduce(
                      (sum, v, idx) => (idx !== i ? sum + v.trafficAllocation : sum),
                      0,
                    );
                    const maxAllowed = 100 - othersTotal;
                    const value = Math.max(0, Math.min(maxAllowed, Number(e.target.value)));
                    updateVariant(i, "trafficAllocation", value);
                  }}
                  min={0}
                  max={100 - variants.reduce((sum, v, idx) => (idx !== i ? sum + v.trafficAllocation : sum), 0)}
                  step={1}
                  suffix="%"
                />
              </s-stack>
            ))}

            <s-checkbox
              label="Add a control section ID"
              details="If you want the variant section to replace the control section, add a control section ID"
              onChange={() => {
                setAddControlSection(!addControlSection);
              }}
            />
            {addControlSection && (
              <s-stack direction="inline" gap="small" alignItems="end">
                <div style={{ flex: 1 }}>
                  <s-text-field
                    placeholder="shopify-section-sections--25210972849284__header"
                    value={controlSectionId}
                    label="Control Section ID"
                    onChange={(e) => {
                      const v = e.target.value;
                      setControlSectionId(v);
                    }}
                    details="The control section ID that will be replaced by the variant for users who are in the experiment. Must be visible on production site."
                  />
                </div>
                <div style={{ paddingBottom: '44px' }}> 
                  <s-button 
                    variant="secondary"
                    onClick={() => handleLaunchPicker("control")}
                  >
                    Select Visually
                  </s-button>
                </div>
              </s-stack>
            )}
            <s-text font-weight="heavy">
              Control allocation: {controlAllocation}%. Control allocation is
              calculated from the remaining percentage after all variants.
            </s-text>

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
          accessibilityLabel="Remove variant"
          disabled={variants.length <= 1}
          onClick={handleRemoveVariant}
        >
          Remove Variant
        </s-button>
        <s-button
          icon="plus"
          accessibilityLabel="Add variant"
          disabled={variants.length >= MAX_VARIANTS}
          onClick={handleAddVariant}
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
          <s-button onClick={handleDiscard} variant="secondary">
            Discard
          </s-button>
          <s-button
            variant="primary"
            disabled={hasClientErrors || isSubmitting}
            onClick={handleExperimentCreate}
          >
            Save Draft
          </s-button>
        </s-stack>
      </div>
    </s-page>
  );
}
