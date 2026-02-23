// Helper functions for experiment related operations
import db from "../db.server";
import betaFactory from "@stdlib/random-base-beta";
import { Prisma } from "@prisma/client";

// Function to create an experiment. Returns the created experiment object.
export async function createExperiment(
  experimentData,
  {
    variantEnabled = false,
    controlSectionId = "",
    primaryVariantSectionId = "",
    secondaryVariantSectionId = "",
  } = {},
) {
  console.log("Creating experiment with data:", experimentData);

  const variantCreates = [];

  variantCreates.push({
    name: "Control",
    configData: controlSectionId
      ? { sectionId: controlSectionId }
      : null,
  });

  if (primaryVariantSectionId) {
    variantCreates.push({
      name: "Variant A",
      configData: { sectionId: primaryVariantSectionId },
    });
  }

  if (variantEnabled && secondaryVariantSectionId) {
    variantCreates.push({
      name: "Variant B",
      configData: { sectionId: secondaryVariantSectionId },
    });
  }

  // Update Prisma database using npx prisma
  const result = await db.experiment.create({
    data: {
      ...experimentData, // Will include all DB fields of a new experiment
      variants: {
        create: variantCreates,
      },
    },
  });
  console.log("Created experiment:", result);
  return result;
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
export async function getMostRecentExperiment(){

  //query to retrieve most recent experiment tuple
  return db.experiment.findFirst({
    where: { status: "active"},
    orderBy: { createdAt: "desc" },
  }); //newest experiment first

}

//uses experiment id to find name of goal for experiment since there is no direct attribute for it in this table
export async function getNameOfExpGoal(expId){

  //grabs first analysis tuple that matches experiment id, works because all goals should be the same for 1 experiment
  return db.analysis.findFirst({
    where: { experimentId: expId},
    include: { goal: true, },
  }); 
}

// Function to pause an experiment 
export async function pauseExperiment(experimentId){
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

  // Prevent redundant updates if already paused
  if (experiment.status === "paused") {
    console.log(`pauseExperiment: Experiment ${id} is already paused.`);
    return experiment;
  }

  const prevStatus = experiment.status;

  // This nested write to the DB ensure atomicity
  const updated = await db.experiment.update({
    where: { id },
    data: {
      status: "paused",
      endDate: new Date(),
      history: {
        create: {
          prevStatus: prevStatus,
          newStatus: "paused",
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

  // Prevent redundant updates if already archived
  if (experiment.status === "archived") {
    console.log(`archiveExperiment: Experiment ${id} is already archived.`);
    return experiment;
  }

  const prevStatus = experiment.status;

  // This nested write to the DB ensure atomicity
  const updated = await db.experiment.update({
    where: { id },
    data: {
      status: "archived",
      endDate: experiment.endDate || new Date(),
      history: {
        create: {
          prevStatus: prevStatus,
          newStatus: "archived",
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
  if (!experiment) throw new Error(`Experiment with ID ${id} not found`);

  // Only resume if it's actually paused
  if (experiment.status === "active") {
    console.log(`resumeExperiment: Experiment ${id} is already active.`);
    return experiment;
  }

  const prevStatus = experiment.status;

  return await db.experiment.update({
    where: { id },
    data: {
      status: "active", // Resuming typically moves it back to active
      startDate: experiment.startDate || new Date(),
      history: {
        create: {
          prevStatus: prevStatus,
          newStatus: "active",
        },
      },
    },
  });
} // end resumeExperiment()

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

export async function getExperimentReportData(experimentId) {
  const experiment = await db.experiment.findUnique({
    where: {
      id: experimentId,
    },
    include: {
      analyses: {
        include: {
          variant: true,
          goal: true,
        },
        orderBy: { calculatedWhen: "desc" }, // newest analyses first
      },
      variants: true,
    },
  });
  return experiment;
}

//takes a list of experiment objects and updates their analyses
//Needs to change function parameter to take PK and FK to iterate through multiple setProbabilityOfBest
export async function updateProbabilityOfBest(experiment) {
  //DRAW_CONSTANT functions as a limit on the amount of computations this does. The more computations the more accurate but also the more heavy load
  const DRAW_CONSTANT = 20000;
  for (let i = 0; i < experiment.length; i++) {
    const curExp = experiment[i];
    await setProbabilityOfBest({
      experimentId: curExp.id,
      goalId: curExp.goalId,
      draws: DRAW_CONSTANT,
      controlVariantId: null,
    });
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
  draws = 1000,
  controlVariantId = null,
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
    where: { experimentId, goalId },
    orderBy: { calculatedWhen: "desc" },
  });
  if (!allAnalysisRows.length)
    return { updated: 0, reason: "No Analysis rows found" };

  //reduces variant entries down to ones that have not been calculated yet.
  const uncalculatedRows = await db.analysis.findMany({
    where: {
      experimentId,
      goalId,
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

// Get active experiment ID, Section ID and Probability - used on frontend for showing.
export async function GetFrontendExperimentsData() {
  const experiments = await db.experiment.findMany({
    where: {
      status: "active",
    },
    select: {
      id: true,
      sectionId: true,
      controlSectionId: true,
      trafficSplit: true,
    },
  });

  return experiments;
}

// Function to get experiments list.
// This is used for the "Experiments List" page
export async function getExperimentsList() {
  const experiments = await db.experiment.findMany({
    select: {//selecting only relevant fields for the experiments list page
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      analyses: {
        include: {//including analyses to get the most recent conversion rate for the experiment list page
          variant: true,
        },
      },
    },
  });

  return experiments; // Returns an array of experiments,
}

//get the experiment list, additionally analyses for conversion rate
export async function getExperimentsList1() {
  const experiments = await db.experiment.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
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
export async function getAnalysis(experimentId, variantId) {
  return db.analysis.findFirst({
    where: { experimentId, variantId },
    orderBy: { calculatedWhen: "desc" },
    include: { goal: true}
  });
}

//convenience: return conversionRate as a float (or null)
export async function getVariantConversionRate(experimentId, variantId) {
  const row = await getAnalysis(experimentId, variantId);
  if (!row) return null;
  const num = row.conversionRate;
  return num;
}

// Improvement calculation for an experiment
export async function getImprovement(experimentId) {
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
  const controlAnalysis = await getAnalysis(experimentId, control.id);
  const controlRate = controlAnalysis ? controlAnalysis.conversionRate : null;
  if (!(typeof controlRate === "number") || controlRate <= 0) return null;

  // find best treatment rate
  let best = null;
  for (const v of variants) {
    const a = await getAnalysis(experimentId, v.id);
    const rate = a ? a.conversionRate : null;
    if (typeof rate === "number" && (best === null || rate > best)) best = rate;
  }

  if (best === null || best >= 1 || best <= 0) return null;
  if (controlRate === null || controlRate >= 1 || controlRate <= 0) return null;

  // improvement formula
  const improvement = ((best - controlRate) / controlRate) * 100;
  return improvement;
}

// Function to check if experiment is still active
export function isExperimentActive(experiment, timeCheck = new Date()) {
  if (!experiment) return false;
  // make sure time passed in is valid
  let timeStamp = timeCheck;
  if (!(timeCheck instanceof Date)) timeStamp = new Date(timeCheck);
  // we only want to look at the experiments with running status
  if (experiment.status !== "running") return false;
  // also want to account for start date and end date just in case
  if (experiment.startDate && timeStamp < experiment.startDate) return false;
  if (experiment.endDate && timeStamp > experiment.endDate) return false;

  //if we don't get kicked out from the above conditions, experiment must be actively running
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
  // First, get the variant ID from the variant name
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

  // Now create or update the allocation
  // TODO seems like there needs to be more error handling with this result variable here.
  const result = await db.allocation.upsert({
    where: {
      userId_experimentId: {
        userId: user.id,
        experimentId: payload.experiment_id,
      },
    },
    create: {
      userId: user.id,
      experimentId: payload.experiment_id,
      variantId: variant.id,
    },
    update: {
      variantId: variant.id,
    },
  });
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
  return { result: result }; // should probably return the result to the client in the body of the response.
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
      experiment: { status: "active" }, // only find allocations with active experiments. if none, ignore the event.
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
      moneyValue: 0, // TODO change to actually compute this (why do we need this anyways?)
      user: { connect: { id: payload.client_id } },
      variant: { connect: { id: allocation.variantId } },
      goal: { connect: { id: goal.id } },
      experiment: { connect: { id: allocation.experimentId } },
    },
    update: {
      moneyValue: new Prisma.Decimal(0),
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

// function to manually end an experiment
export async function manuallyEndExperiment(experimentId) {
  // Validate input into function, throws error if not valid
  if (!experimentId)
    throw new Error(`manuallyEndExperiment: experimentId is required`);
  // normalize id for db
  const checkId =
    typeof experimentId === "string"
      ? parseInt(experimentId, 10)
      : experimentId;
  // look up experiment
  const experiment = await getExperimentById(checkId);
  // throw an error if we cant find experiment
  if (!experiment)
    throw new Error(`manuallyEndExperiment: Experiment ${checkId} not found`);
  // check if the experiment has already ended, if it has we move on
  if (experiment.status === "archived") {
    console.log(
      `manuallyEndExperiment: Experiment ${checkId} already archived`,
    );
    return experiment;
  }

  const now = new Date();
  // save the experiment's change in status, we might want to track this later on
  const prevStatus = experiment.status;
  // update the experiment in the actual db
  // we're also creating the history record here
  const updated = await db.experiment.update({
    where: { id: checkId },
    data: {
      status: "archived",
      endDate: experiment.endDate ?? now,
      history: {
        create: {
          prevStatus,
          newStatus: "archived",
        },
      },
    },
    include: {
      history: true,
    },
  });
  // log the experiment and then return our updated experiment
  console.log(`manuallyEndExperiment: Experiment ${checkId} has now archived`);
  return updated;
}
