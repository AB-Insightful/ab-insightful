// Helper functions for experiment related operations
import db from "../db.server";
import betaFactory from "@stdlib/random-base-beta";
import { Prisma } from "@prisma/client";
import { ExperimentStatus } from "@prisma/client";

// Function to create an experiment. Returns the created experiment object.
// Accepts an array of treatment variant objects, each with { sectionId, trafficAllocation }.
// A Control variant is always created automatically with the remaining traffic.
// Variant names are auto-generated: "Control", "Variant A", "Variant B", "Variant C", ...
// experimentData may include optional maxUsers (integer); when present, overrides account default.
export async function createExperiment(
  experimentData,
  { controlSectionId = "", variants = [] } = {},
) {
  console.log("Creating experiment with data:", experimentData);

  const VARIANT_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  const treatmentAllocation = variants.reduce(
    (sum, v) => sum + (v.trafficAllocation || 0),
    0,
  );
  const controlAllocation = 1.0 - treatmentAllocation;

  if (controlAllocation < -0.01) {
    throw new Error(
      `Treatment traffic allocations exceed 1.0 (sum: ${treatmentAllocation.toFixed(4)})`,
    );
  }

  if (
    Math.abs(treatmentAllocation + Math.max(0, controlAllocation) - 1.0) > 0.01
  ) {
    throw new Error(
      `Traffic allocations must sum to ~1.0 (got ${(treatmentAllocation + controlAllocation).toFixed(4)})`,
    );
  }

  const variantCreates = [];

  variantCreates.push({
    name: "Control",
    configData: controlSectionId ? { sectionId: controlSectionId } : null,
    trafficAllocation: Math.max(0, controlAllocation),
  });

  variants.forEach((v, i) => {
    variantCreates.push({
      name: `Variant ${VARIANT_LABELS[i]}`,
      configData: v.sectionId ? { sectionId: v.sectionId } : null,
      trafficAllocation: v.trafficAllocation,
    });
  });

  const result = await db.experiment.create({
    data: {
      ...experimentData,
      variants: {
        create: variantCreates,
      },
    },
  });
  console.log("Created experiment:", result);
  return result;
}

/* ====================================================================================================
   Experiment Queries
   ==================================================================================================== */

// Returns active experiments with variant-level data for the storefront embed script.
export async function GetFrontendExperimentsData() {
  const experiments = await db.experiment.findMany({
    where: {
      status: ExperimentStatus.active,
    },
    select: {
      id: true,
      variants: {
        select: {
          id: true,
          name: true,
          configData: true,
          trafficAllocation: true,
        },
      },
    },
  });

  return experiments.map((exp) => ({
    id: exp.id,
    variants: exp.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sectionId: v.configData?.sectionId ?? null,
      trafficAllocation: Number(v.trafficAllocation),
      isControl: v.name === "Control",
    })),
  }));
}

// [Ryan] function to get experiments that are active and have an end date that is either Now or has Passed
export async function getCandidatesForScheduledEnd() {
  try {
    const experiments = await db.experiment.findMany({
      where: {
        status: ExperimentStatus.active,
        endDate: {
          lte: new Date(),
        },
      },
    });
    return experiments;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(
        "[experiment.server.js::getCandidatesForScheduledEnd] ",
        e.message,
      );
      return { error: e.message };
    } else if (e instanceof Prisma.PrismaClientValidationError) {
      console.error(
        "[experiment.server.js::getCandidatesForScheduledEnd] passed an invalid argument for the select.",
        e.message,
      );
      return { error: e.message };
    }
  }
}
// Evaluates active experiments for Stable Success Probability termination criteria
// Returns experiments that have a variant with a 3-day SMA >= 80%
// and a conversion rate strictly greater than the control's conversion rate
export async function getCandidatesForStableSuccessEnd() {
  const MIN_USERS_THRESHOLD = 100;

  const activeExps = await db.experiment.findMany({
    where: {
      status: ExperimentStatus.active,
      endCondition: "stableSuccessProbability",
    },
    include: {
      variants: true,
    },
  });

  const candidatesToEnd = [];

  for (const exp of activeExps) {
    const control = exp.variants.find((v) => v.name === "Control");
    if (!control) continue; // Cant evaluate stable success without a control

    let hasStableWinner = false;

    // Evaluate each [a/b/c/d] variant in an experiment against the Control
    for (const variant of exp.variants) {
      if (variant.name === "Control") continue;

      // fetch the 3 most recent analyses for variant and control
      const [variantHistory, controlHistory] = await Promise.all([
        db.analysis.findMany({
          where: { experimentId: exp.id, variantId: variant.id, deviceSegment: "all" },
          orderBy: { calculatedWhen: "desc" },
          take: 3,
        }),
        db.analysis.findMany({
          where: { experimentId: exp.id, variantId: control.id, deviceSegment: "all" },
          orderBy: { calculatedWhen: "desc" },
          take: 3,
        }),
      ]);

      // Minimum 3 days of historical analysis data
      if (variantHistory.length < 3 || controlHistory.length < 3) continue;
      
      const totalUsersSoFar = variantHistory[0].totalUsers + controlHistory[0].totalUsers;
      
      if (totalUsersSoFar < MIN_USERS_THRESHOLD) continue;
      // SMA Calculation: Smoothing out the "Daily Noise"
      const avgProb = variantHistory.reduce((sum, singleDay) => sum + (singleDay.probabilityOfBeingBest || 0), 0) / 3;

      // Probability Threshold (80%) + Positive Delta Requirement
      if (avgProb >= 0.8) {
        // checks latest variant conversion against control conversion
        const isCurrentlyBetter = variantHistory[0].conversionRate > controlHistory[0].conversionRate;
        if (isCurrentlyBetter) {
          hasStableWinner = true;
          break; // Found a winner; move to the next experiment
        }
      }
    }

    if (hasStableWinner) {
      candidatesToEnd.push(exp);
    }
  }

  return candidatesToEnd;
}
// [Ryan] function to get experiments that meet the following criteria:
//  - is a draft
//  - has a scheduled start date that is either Now or has Passed
export async function getCandidatesForScheduledStart() {
  try {
    const experiments = await db.experiment.findMany({
      where: {
        status: ExperimentStatus.draft,
        startDate: {
          lte: new Date(),
        },
      },
    });
    return experiments;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(
        "[experiment.server.js::getCandidatesForScheduledStart] ",
        e.message,
      );
      return { error: e.message };
    } else if (e instanceof Prisma.PrismaClientValidationError) {
      console.error(
        "[experiment.server.js::getCandidatesForScheduledStart] passed an invalid argument for the select.",
        e.message,
      );
      return { error: e.message };
    }
  }
}
// Function to get experiments list.
// This is used for the "Experiments List" page
export async function getExperimentsList() {
  const experiments = await db.experiment.findMany({
    //using include as a join
    include: {
      //for each experiment, find all its related analyses records
      analyses: {
        // For each of those analyses include their variant
        include: {
          variant: true, //this gets us the variant name (e.g., "Control", "Variant A")
        },
      },
      project: {
        select: { maxUsersPerExperiment: true },
      },
    },
  });

  return experiments; // Returns an array of experiments,
}

//get the experiment list, additionally analyses for conversion rate
export async function experimentListReport() {
  const experiments = await db.experiment.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      endCondition: true,
      analyses: {
        select: {
          totalConversions: true,
          totalUsers: true,
          calculatedWhen: true,
        },
        orderBy: {
          calculatedWhen: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (experiments) return experiments;
  else return null;
}

// get a variant (by name or id) Example: "Control" or "Variant A"
export async function getVariant(experimentId, name) {
  return db.variant.findFirst({
    where: { experimentId, name },
    select: { id: true, name: true },
  });
}

//get the latest analysis row for that variant (conversionRate lives here)
export async function getAnalysis(
  experimentId,
  variantId,
  deviceSegment = "all",
) {
  return db.analysis.findFirst({
    where: { experimentId, variantId, deviceSegment },
    orderBy: { calculatedWhen: "desc" },
    include: { goal: true },
  });
}

//convenience: return conversionRate as a float (or null)
export async function getVariantConversionRate(
  experimentId,
  variantId,
  deviceSegment = "all",
) {
  const row = await getAnalysis(experimentId, variantId, deviceSegment);
  if (!row) return null;
  const num = row.conversionRate;
  return num;
}

// Improvement calculation for an experiment
export async function getImprovement(experimentId, deviceSegment = "all") {
  // get control
  const control = await getVariant(experimentId, "Control");
  if (!control) return null;

  // get all other variants
  const variants = await db.variant.findMany({
    where: { experimentId, NOT: { id: control.id } },
    select: { id: true, name: true },
  });
  if (!variants.length) return null;

  // get control conversion rate
  const controlAnalysis = await getAnalysis(
    experimentId,
    control.id,
    deviceSegment,
  );
  const controlRate = controlAnalysis ? controlAnalysis.conversionRate : null;
  if (!(typeof controlRate === "number") || controlRate <= 0) return null;

  // find best treatment rate
  let best = null;
  for (const v of variants) {
    const a = await getAnalysis(experimentId, v.id, deviceSegment);
    const rate = a ? a.conversionRate : null;
    if (typeof rate === "number" && (best === null || rate > best)) best = rate;
  }

  if (best === null || best >= 1 || best <= 0) return null;
  if (controlRate === null || controlRate >= 1 || controlRate <= 0) return null;

  // improvement formula
  const improvement = ((best - controlRate) / controlRate) * 100;
  return improvement;
}

// Function to get an experiment by id. Returns the experiment object if found, otherwise returns null.
export async function getExperimentById(id) {
  if (id) {
    const experiment = await db.experiment.findUnique({
      where: {
        id: id,
      },
    });
    return experiment;
  }
  return null;
}

//TODO:
// Function to retrieve the most recently created experiment and its associated information.
//Primarily used in the home page
//primarily used to retrieve id.
export async function getMostRecentExperiment() {
  //query to retrieve most recent experiment tuple
  return db.experiment.findFirst({
    where: { status: ExperimentStatus.active },
    orderBy: { createdAt: "desc" },
  }); //newest experiment first
}

//uses experiment id to find name of goal for experiment since there is no direct attribute for it in this table
export async function getNameOfExpGoal(expId) {
  //grabs first analysis tuple that matches experiment id, works because all goals should be the same for 1 experiment
  return db.analysis.findFirst({
    where: { experimentId: expId, deviceSegment: "all" },
    include: { goal: true },
  });
}

/* ====================================================================================================
   Experiment Status Management
   ==================================================================================================== */

// Function to pause an experiment
export async function pauseExperiment(experimentId) {
  // Validate and normalize the ID for the SQLite database
  if (!experimentId)
    throw new Error("pauseExperiment: experimentId is required");

  const id =
    typeof experimentId === "string"
      ? parseInt(experimentId, 10)
      : experimentId;

  // Fetch current experiment to verify existence and capture state
  const experiment = await db.experiment.findUnique({
    where: { id },
  });

  if (!experiment) {
    throw new Error(`pauseExperiment: Experiment with ID ${id} not found`);
  }

  // check if the experiment is eligible to be paused
  switch (experiment.status) {
    case ExperimentStatus.active:
      // we can pause an active experiment, let it fall through
      break;
    case ExperimentStatus.archived:
    case ExperimentStatus.completed:
    case ExperimentStatus.draft:
    case ExperimentStatus.paused:
      console.log(
        `pauseExperiment: Experiment ${id} with status: ${experiment.status} cannot be paused.`,
      );
      return experiment;
    default:
      throw new Error(
        `pauseExperiment: Experiment ${id} has unknown status: ${experiment.status}`,
      );
  }

  const prevStatus = experiment.status;

  // This nested write to the DB ensure atomicity
  const updated = await db.experiment.update({
    where: { id },
    data: {
      status: ExperimentStatus.paused,
      history: {
        create: {
          prevStatus: prevStatus,
          newStatus: ExperimentStatus.paused,
          // changedAt defaults to now() per Prisma schema
        },
      },
    },
    include: {
      history: true,
    },
  });

  console.log(
    `pauseExperiment: Experiment ${id} moved from ${prevStatus} to paused.`,
  );
  return updated;
}
// end pauseExperiment()

export async function archiveExperiment(experimentId) {
  if (!experimentId)
    throw new Error("archiveExperiment: experimentId is required");

  const id =
    typeof experimentId === "string"
      ? parseInt(experimentId, 10)
      : experimentId;

  // Fetch current experiment to verify existence and capture state
  const experiment = await db.experiment.findUnique({
    where: { id },
  });

  if (!experiment) {
    throw new Error(`archiveExperiment: Experiment with ID ${id} not found`);
  }

  // check if the experiment is eligible to be archived
  switch (experiment.status) {
    case ExperimentStatus.completed:
      break;
    case ExperimentStatus.draft:
    case ExperimentStatus.archived:
    case ExperimentStatus.active:
    case ExperimentStatus.paused:
      console.log(
        `archiveExperiment: Experiment ${id} with status: ${experiment.status} cannot be archived.`,
      );
      return experiment;
    default:
      throw new Error(
        `archiveExperiment: Experiment ${id} has unknown status: ${experiment.status}`,
      );
  }

  const prevStatus = experiment.status;

  // This nested write to the DB ensure atomicity
  const updated = await db.experiment.update({
    where: { id },
    data: {
      status: ExperimentStatus.archived,
      history: {
        create: {
          prevStatus: prevStatus,
          newStatus: ExperimentStatus.archived,
          // changedAt defaults to now() per Prisma schema
        },
      },
    },
    include: {
      history: true,
    },
  });

  console.log(
    `archiveExperiment: Experiment ${id} moved from ${prevStatus} to archived.`,
  );
  return updated;
} // end archiveExperiment()

export async function resumeExperiment(experimentId) {
  if (!experimentId)
    throw new Error("resumeExperiment: experimentId is required");

  const id =
    typeof experimentId === "string"
      ? parseInt(experimentId, 10)
      : experimentId;

  const experiment = await db.experiment.findUnique({ where: { id } });
  if (!experiment)
    throw new Error(`resumeExperiment: Experiment ${id} not found`);

  // check if the experiment is eligible to be resumed
  switch (experiment.status) {
    case ExperimentStatus.paused:
      //we can resume a paused experiment, let it fall through
      break;
    case ExperimentStatus.archived:
    case ExperimentStatus.completed:
    case ExperimentStatus.draft:
    case ExperimentStatus.active:
      console.log(
        `resumeExperiment: Experiment ${id} with status: ${experiment.status} cannot be resumed.`,
      );
      return experiment;
    default:
      throw new Error(
        `resumeExperiment: Experiment ${id} has unknown status: ${experiment.status}`,
      );
  }

  const now = new Date();
  if (experiment.endDate && experiment.endDate < now) {
    throw new Error(
      `resumeExperiment: Experiment ${id} has endDate ${experiment.endDate.toISOString()} in the past and cannot be resumed`,
    );
  }

  const prevStatus = experiment.status;

  return await db.experiment.update({
    where: { id },
    data: {
      status: ExperimentStatus.active, // Resuming typically moves it back to active
      history: {
        create: {
          prevStatus: prevStatus,
          newStatus: ExperimentStatus.active,
        },
      },
    },
    include: {
      history: true,
    },
  });
} // end resumeExperiment()

// function to manually end an experiment
export async function endExperiment(experimentId) {
  // Validate input into function, throws error if not valid
  if (!experimentId) throw new Error(`endExperiment: experimentId is required`);
  // normalize id for db
  const id =
    typeof experimentId === "string"
      ? parseInt(experimentId, 10)
      : experimentId;
  // look up experiment
  const experiment = await getExperimentById(id);
  // throw an error if we cant find experiment
  if (!experiment) throw new Error(`endExperiment: Experiment ${id} not found`);
  // check if the experiment is eligible to be ended
  switch (experiment.status) {
    case ExperimentStatus.active:
    case ExperimentStatus.paused:
      break;
    case ExperimentStatus.archived:
    case ExperimentStatus.completed:
    case ExperimentStatus.draft:
      console.log(
        `endExperiment: Experiment ${id} with status: ${experiment.status} cannot be ended.`,
      );
      return experiment;
    default:
      throw new Error(
        `endExperiment: Experiment ${id} has unknown status: ${experiment.status}`,
      );
  }

  const now = new Date();
  // save the experiment's change in status
  const prevStatus = experiment.status;
  // update the experiment in the actual db
  // we're also creating the history record here
  const updated = await db.experiment.update({
    where: { id: id },
    data: {
      status: ExperimentStatus.completed,
      endDate: experiment.endDate ?? now,
      history: {
        create: {
          prevStatus,
          newStatus: ExperimentStatus.completed,
        },
      },
    },
    include: {
      history: true,
    },
  });
  // log the experiment and then return our updated experiment
  console.log(`endExperiment: Experiment ${id} has now completed`);
  return updated;
} // end endExperiment()

export async function startExperiment(experimentId) {
  // Validate input into function, throws error if not valid
  if (!experimentId)
    throw new Error(`startExperiment: experimentId is required`);
  // normalize id for db
  const id =
    typeof experimentId === "string"
      ? parseInt(experimentId, 10)
      : experimentId;
  // look up experiment
  const experiment = await getExperimentById(id);
  // throw an error if we cant find experiment
  if (!experiment)
    throw new Error(`startExperiment: Experiment ${id} not found`);

  // check if the experiment is eligible to start
  switch (experiment.status) {
    case ExperimentStatus.draft:
      break;
    case ExperimentStatus.paused:
    case ExperimentStatus.archived:
    case ExperimentStatus.completed:
    case ExperimentStatus.active:
      console.log(
        `startExperiment: Experiment ${id} with status: ${experiment.status} cannot be started.`,
      );
      return experiment;
    default:
      throw new Error(
        `startExperiment: Experiment ${id} has unknown status: ${experiment.status}`,
      );
  }

  // save date and block starting experiment if end date is in past
  const now = new Date();

  if (experiment.endDate && experiment.endDate < now) {
    throw new Error(
      `startExperiment: Experiment ${id} has endDate ${experiment.endDate.toISOString()} in the past and cannot be started`,
    );
  }

  // save the experiment's change in status
  const prevStatus = experiment.status;
  // update the experiment in the actual db
  // we're also creating the history record here
  const updated = await db.experiment.update({
    where: { id: id },
    data: {
      status: ExperimentStatus.active,
      startDate: now,
      history: {
        create: {
          prevStatus,
          newStatus: ExperimentStatus.active,
        },
      },
    },
    include: {
      history: true,
    },
  });
  // log the experiment and then return our updated experiment
  console.log(
    `startExperiment: Experiment ${id} moved from ${prevStatus} to active`,
  );
  return updated;
} // end startExperiment()

export async function deleteExperiment(experimentId) {
  // Validate input into function, throws error if not valid
  if (!experimentId)
    throw new Error(`deleteExperiment: experimentId is required`);
  // normalize id for db
  const id =
    typeof experimentId === "string"
      ? parseInt(experimentId, 10)
      : experimentId;
  // look up experiment
  const experiment = await getExperimentById(id);
  // throw an error if we cant find experiment
  if (!experiment)
    throw new Error(`deleteExperiment: Experiment ${id} not found`);

  // check if the experiment is eligible to start
  switch (experiment.status) {
    // cases we want fall through
    case ExperimentStatus.draft:
      break;
    //cases we don't want get filtered out
    case ExperimentStatus.archived:
    case ExperimentStatus.completed:
    case ExperimentStatus.active:
    case ExperimentStatus.paused:
      console.log(
        `deleteExperiment: Experiment ${id} with status: ${experiment.status} cannot be deleted.`,
      );
      return experiment;
    default:
      throw new Error(
        `deleteExperiment: Experiment ${id} has unknown status: ${experiment.status}`,
      );
  }

  //delete from db
  return await db.experiment.delete({ where: { id } });
}

/* ====================================================================================================
   Experiment Analysis
   ==================================================================================================== */

//finds all the experiments that can be analyzed
export async function getExperimentsWithAnalyses() {
  return db.experiment.findMany({
    where: {
      analyses: { some: {} }, //only experiments that have at least one Analysis
    },
    include: {
      project: true,
      analyses: {
        include: {
          variant: true,
          goal: true,
        },
        orderBy: { calculatedWhen: "desc" }, //newest analyses first
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getExperimentReportData(
  experimentId,
  deviceSegment = "all",
) {
  const experiment = await db.experiment.findUnique({
    where: {
      id: experimentId,
    },
    include: {
      analyses: {
        where: { deviceSegment },
        include: {
          variant: true,
          goal: true,
        },
        orderBy: { calculatedWhen: "desc" }, // newest analyses first
      },
      variants: true,
      experimentGoals: {
        include: {
          goal: true,
        },
      },
    },
  });
  return experiment;
}

//takes a list of experiment objects and updates their analyses
//Needs to change function parameter to take PK and FK to iterate through multiple setProbabilityOfBest
export async function updateProbabilityOfBest(experiment) {
  //DRAW_CONSTANT functions as a limit on the amount of computations this does. The more computations the more accurate but also the more heavy load
  const DRAW_CONSTANT = 20000;
  const segments = ["all", "mobile", "desktop"];
  for (let i = 0; i < experiment.length; i++) {
    const curExp = experiment[i];
    for (const segment of segments) {
      await setProbabilityOfBest({
        experimentId: curExp.id,
        goalId: curExp.goalId,
        deviceSegment: segment,
        draws: DRAW_CONSTANT,
      });
    }
  }

  //maybe if we wanted this calculated all at once.
  /**  await Promise.all(
    experiments.map((exp) => setProbabilityOfBest(exp.id))
  );  */
  return experiment;
}

//takes a singular experiment and adds an entry with all relevant statistics update (probabilityOfBeingBest, alpha, beta, expected loss )
//uses random-base-beta from the stdlib to perform statistical simulation.
//intended to be used in conjunction with other helper functions (e.g. getExperimentsWithAnalyses() and updateProbabilityOfBest) to perform batch calculation on multiple experiments
export async function setProbabilityOfBest({
  experimentId,
  goalId,
  deviceSegment = "all",
  draws = 1000,
}) {
  const experiment = await db.experiment.findUnique({
    where: { id: experimentId },
    include: { analyses: true },
  });

  if (!experiment) {
    throw new Error(`Experiment with ID ${experimentId} not found`);
  }

  //loads all analysis rows
  const allAnalysisRows = await db.analysis.findMany({
    where: { experimentId, goalId, deviceSegment },
    orderBy: { calculatedWhen: "desc" },
  });
  if (!allAnalysisRows.length)
    return { updated: 0, reason: "No Analysis rows found" };

  //reduces variant entries down to ones that have not been calculated yet.
  const uncalculatedRows = await db.analysis.findMany({
    where: {
      experimentId,
      goalId,
      deviceSegment,
      probabilityOfBeingBest: null,
      expectedLoss: null,
    },
  });

  if (uncalculatedRows.length < 2) {
    return;
  }

  //filters out unacceptable postBetas and postAlphas (ones that are 0) and then maps it into a new object called posteriors
  //keep in mind during DB testing this mean if postBeta and postAlpha are left blank,
  const posteriors = uncalculatedRows
    .filter((r) => r.postAlpha > 0 && r.postBeta > 0) // filters entries with less than and greater than 0
    .map((r) => ({
      variantId: r.variantId,
      analysisId: r.id, // to update same row
      totalConversions: r.totalConversions,
      totalUsers: r.totalUsers,
      alpha: Number(r.postAlpha),
      beta: Number(r.postBeta),
    })); //this list of for postBeta calculations

  //safety check for when there are somehow less than 2 pages to compare
  if (posteriors.length < 2) {
    return {
      updated: null,
      reason: "Need at least two variants with posteriors",
    }; //check later
  }

  //Monte Carlo Calculation
  const betaSamplers = []; //will be array of functions
  for (const posterior of posteriors) {
    const sampler = betaFactory.factory(posterior.alpha, posterior.beta); //calculates random values based on beta
    betaSamplers.push(sampler);
  }

  const totalVariants = betaSamplers.length;

  const betaSamples = Array.from({ length: totalVariants }, () =>
    new Array(draws).fill(null),
  ); //check if fill is doing as expected

  //performs the randomized simulation number of "draw" times then moves on to the next variant
  for (let variantIndex = 0; variantIndex < totalVariants; variantIndex++) {
    const sampleBeta = betaSamplers[variantIndex];
    for (let drawIndex = 0; drawIndex < draws; drawIndex++) {
      betaSamples[variantIndex][drawIndex] = sampleBeta();
    }
  }

  //Calculate probability of best
  const bestVariantCounts = new Array(totalVariants).fill(0);
  const cumulativeExpectedLoss = new Array(totalVariants).fill(0);

  //iterates through the results of the simulation and finds highest value
  for (let drawIndex = 0; drawIndex < draws; drawIndex++) {
    let highestValue = -Infinity;
    let indexOfBestVariant = -1;

    // Find the highest sampled value of the variant
    for (let variantIndex = 0; variantIndex < totalVariants; variantIndex++) {
      const sampledValue = betaSamples[variantIndex][drawIndex];
      if (sampledValue > highestValue) {
        highestValue = sampledValue;
        indexOfBestVariant = variantIndex;
      }
    }

    // Increment best count for the variant (accumulating total wins for each variant)
    bestVariantCounts[indexOfBestVariant] += 1;

    // Compute expected loss for all variants (because they are so inter-related)
    //expected loss represents how much conversion rate you would lose out on if you were to choose the corresponding variant (will be close to 0 for winning variant).
    for (let variantIndex = 0; variantIndex < totalVariants; variantIndex++) {
      const sampledValue = betaSamples[variantIndex][drawIndex];
      const loss = highestValue - sampledValue;
      cumulativeExpectedLoss[variantIndex] += loss;
    }
  } // forloop

  const probabilityOfBeingBest = [];
  const expectedLoss = [];

  //divides number of times a variant page was won by number of times it was drawn
  for (let variantIndex = 0; variantIndex < totalVariants; variantIndex++) {
    const probability = bestVariantCounts[variantIndex] / parseFloat(draws);
    const loss = cumulativeExpectedLoss[variantIndex] / parseFloat(draws);

    probabilityOfBeingBest.push(probability);
    expectedLoss.push(loss);
  }

  //update analyses table with new values
  const currentTime = new Date();
  for (let variantIndex = 0; variantIndex < totalVariants; variantIndex++) {
    const posterior = posteriors[variantIndex];
    const variantProbability = probabilityOfBeingBest[variantIndex];
    const variantExpectedLoss = expectedLoss[variantIndex];

    await db.analysis.update({
      where: { id: posterior.analysisId },
      data: {
        calculatedWhen: currentTime,
        probabilityOfBeingBest: variantProbability,
        expectedLoss: variantExpectedLoss,
      },
    });
  }
} //end of setProbabilityOfBest

/* ====================================================================================================
   Experiment Event Handling
   ==================================================================================================== */
// Get active experiment ID, Section ID and Probability - used on frontend for showing.

// Function to get experiments list.
// This is used for the "Experiments List" page

// Function to check if experiment is still active
export function isExperimentActive(experiment, timeCheck = new Date()) {
  if (!experiment) return false;
  // make sure time passed in is valid
  let timeStamp = timeCheck;
  if (!(timeCheck instanceof Date)) timeStamp = new Date(timeCheck);
  // we only want to look at the experiments with active status
  if (experiment.status !== ExperimentStatus.active) return false;
  // also want to account for start date and end date just in case
  if (experiment.startDate && timeStamp < experiment.startDate) return false;
  if (experiment.endDate && timeStamp > experiment.endDate) return false;

  //if we don't get kicked out from the above conditions, experiment must be actively active
  return true;
}

async function handleExperiment_IncludeEvent(payload) {
  // TODO ask what this corresponds to
  // handle that
  // Create user if they don't exist, otherwise update latest session
  console.log("[handle experiment include]");

  if (!payload.client_id) {
    console.error(
      "handleExperiment_IncludeEvent: missing client_id in payload, skipping",
    );
    return null;
  }

  // Create/update user first so it exists even when variant is not found
  const user = await db.user.upsert({
    where: {
      shopifyCustomerID: payload.client_id,
    },
    update: {
      latestSession: payload.timestamp,
    },
    create: {
      id: payload.client_id,
      shopifyCustomerID: payload.client_id,
    },
  });

  // Then, tie that user to the experiment
  const variant = await getVariant(payload.experiment_id, payload.variant);

  if (!variant) {
    // [notes | ryan] currently, even though this is an error path, the client gets no notice that things went wrong.
    // should probably return a payload to the client so it can inspect what the server was working with and retry if it differs from
    // what the client sent
    console.error(
      `Variant "${payload.variant}" not found for experiment ${payload.experiment_id}`,
    );
    return;
  }

  const experimentId =
    typeof payload.experiment_id === "string"
      ? parseInt(payload.experiment_id, 10)
      : payload.experiment_id;
  const deviceType = payload.device_type ?? payload.deviceType ?? null;

  // Resolve effective max: experiment override when set, otherwise project default
  const experiment = await db.experiment.findUnique({
    where: { id: experimentId },
    include: {
      project: { select: { maxUsersPerExperiment: true } },
    },
  });
  const effectiveMax =
    experiment?.maxUsers ??
    experiment?.project?.maxUsersPerExperiment ??
    10000;

  // Run allocation logic in a transaction to serialize count+create and avoid races.
  const result = await db.$transaction(async (tx) => {
    const existingAllocation = await tx.allocation.findUnique({
      where: {
        userId_experimentId: {
          userId: user.id,
          experimentId,
        },
      },
    });

    if (existingAllocation) {
      return tx.allocation.update({
        where: {
          userId_experimentId: {
            userId: user.id,
            experimentId,
          },
        },
        data: {
          variantId: variant.id,
          deviceType,
        },
      });
    }

    const count = await tx.allocation.count({
      where: { experimentId },
    });
    if (count >= effectiveMax) {
      return null;
    }

    return tx.allocation.create({
      data: {
        userId: user.id,
        experimentId,
        variantId: variant.id,
        deviceType,
      },
    });
  });

  if (!result) {
    console.log(
      "[handle experiment include] max users reached, not creating allocation",
    );
    return { limitReached: true };
  }

  if (!result) {
    console.log(
      "[handle experiment include] an error occurred while publishing the allocation",
      result,
    );
  } else {
    console.log(
      "[handle experiment include] successful allocation upsert: ",
      result,
    );
  }
  return { result }; // should probably return the result to the client in the body of the response.
}

async function persistConversion(payload, Goal_Type) {
  // Goal_Type is expected to be a string, is expected to be exactly one of the "Goals" in the database. (Goal.name)
  // this function is responsible for:
  //  persisting the event,
  //  ascertaining whether or not the user's experiment is still active (exiting early and not persisting if not)
  //  conferring all errors to the caller and client.

  // the flow of queries is:
  // - get the experiment_id and variantId of that experiment
  // - get the goal with the correspondig goal type
  // - push the conversion
  const allocation = await db.allocation.findFirst({
    where: {
      userId: payload.client_id,
      experiment: { status: ExperimentStatus.active }, // only find allocations with active experiments. if none, ignore the event.
    },
    orderBy: { assignedWhen: "desc" },
    select: {
      experimentId: true,
      variantId: true,
    },
  });
  if (!allocation) {
    console.log("no allocation");
    return {
      ignored: true,
      error: "No active experiment found for that user.",
    };
  }
  const goal = await db.goal.findFirst({
    where: {
      name: Goal_Type,
    },
  });

  if (!goal) {
    console.error(
      'Critical! Could not find goal with the name "! Conversions are being dropped!',
    );
    return { error: "fatal server error" };
  }
  let ResultOfNewConversion = await db.conversion.upsert({
    where: {
      experimentId_goalId_userId: {
        experimentId: allocation.experimentId,
        goalId: goal.id,
        userId: payload.client_id,
      },
    },
    create: {
      deviceType: payload.device_type,
      moneyValue: new Prisma.Decimal(payload.total_price ?? 0),
      user: { connect: { id: payload.client_id } },
      variant: { connect: { id: allocation.variantId } },
      goal: { connect: { id: goal.id } },
      experiment: { connect: { id: allocation.experimentId } },
    },
    update: {
      moneyValue: new Prisma.Decimal(payload.total_price ?? 0),
    },
  });
  if (ResultOfNewConversion) {
    return { "db result": ResultOfNewConversion };
  } else {
    return { error: "failed to create New Conversion row in DB" };
  }
}

// Handler function for incoming events
export async function handleCollectedEvent(payload) {
  // If the "event" is to update user inclusion, handle that
  // normalize time
  let timeCheck = payload.timestamp;
  if (!payload.timestamp) {
    timeCheck = new Date();
  } else if (!(payload.timestamp instanceof Date)) {
    timeCheck = new Date(payload.timestamp);
  }

  // Look up experiment (flesh this out in the future) // what exactly needs to be fleshed out here?
  let experiment = null;

  // receive pixel experimentId here
  if (payload.experimentId) {
    const id =
      typeof payload.experimentId === "string"
        ? parseInt(payload.experimentId, 10)
        : payload.experimentId;
    experiment = await getExperimentById(id);
  }

  // check for if the experiment is inactive, if so move on
  if (experiment && !isExperimentActive(experiment, timeCheck)) {
    console.log("handleCollectedEvent: experiment inactive, ignoring event");
    return { ignored: true };
  }
  let result = null;
  switch (payload.event_type) {
    case "experiment_include":
      result = await handleExperiment_IncludeEvent(payload);
      break;
    case "checkout_completed":
      result = await persistConversion(payload, "Completed Checkout");
      break;
    case "checkout_started":
      result = await persistConversion(payload, "Started Checkout");
      break;
    case "page_viewed":
      result = await persistConversion(payload, "Viewed Page");
      break;
    case "product_added_to_cart":
      result = await persistConversion(payload, "Added Product To Cart");
      break;
    default:
      console.error(
        "Received an event with an unknown event type",
        payload.event_type,
      );
      return {
        ignored: true,
        error: "received an event with an unknown event type",
      };
    // todo look into side effects of this function, is there any upstream error handling that needs to be handled?
  }

  if (!result) {
    return { ignored: true };
  } else {
    console.log("[handle collected event]: ", result);
    return { result };
  }
}
