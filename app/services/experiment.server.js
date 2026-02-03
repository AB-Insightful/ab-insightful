// Helper functions for experiment related operations
import db from "../db.server";
import betaFactory from "@stdlib/random-base-beta";

// Function to create an experiment. Returns the created experiment object.
export async function createExperiment(experimentData) {
  console.log("Creating experiment with data:", experimentData);
  // Update Prisma database using npx prisma
  const result = await db.experiment.create({
    data: {
      ...experimentData, // Will include all DB fields of a new experiment
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

//takes a singular experiment and adds an entry with all relevant statistics update (probabilityOfBeingBest, alpha, beta, )
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
      trafficSplit: true,
    },
  });

  return experiments;
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
    select: { id: true, conversionRate: true, calculatedWhen: true },
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
  const user = await db.user.upsert({
    where: {
      shopifyCustomerID: payload.user_id,
    },
    update: {
      latestSession: payload.timestamp,
    },
    create: {
      shopifyCustomerID: payload.user_id,
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
      // The where clause must match the unique constraint: [userId, experimentId]
      userId_experimentId: {
        userId: user.id,
        experimentId: payload.experiment_id,
      },
    },
    create: {
      // When creating, connect to existing records using their IDs
      userId: user.id,
      experimentId: payload.experiment_id,
      variantId: variant.id,
    },
    update: {
      // If allocation already exists, update the variant (in case it changed)
      variantId: variant.id,
    },
  });
  return; // should probably return the result to the client in the body of the response.
}
async function handle_NewVisitorEvent(payload) {
  // potentially already handled?
  console.log("[handle_NewVisitorEvent] Not implemented", payload);
}
async function handle_CompletedCheckoutEvent(payload) {
  console.log("[handle_CompletedCheckoutEvent] Not Implemented", payload);
}
async function handle_StartedCheckoutEvent(payload) {
  console.log("[handle_StartedCheckoutEvent] Not Implemented", payload);
}
async function handle_ViewedPageEvent(payload) {
  console.log("[handle_ViewedPageEvent] Not Implemented", payload);
  // for now, assume that every piece of information is there.
  // create or upsert?
  const result = await db.conversion.upsert({
    where: {
      user_id: payload.client_id,
    },
    update: {},
    create: {},
  });
  // payload needs to have the following:
  //Time

  //Customer ID

  //Page URL

  //Products in cart (if any)

  //Page Associated resource (product, blog, etc)
}
async function handle_AddedToCartEvent(payload) {
  console.log("[handle_AddedToCartEvent] Not Implemented", payload);
}
// Handler function for incoming events
// todo refactor "event type" as an ENUM
// [notes | ryan] the Conversion table will be on of the primary tables you update.
// do I also need to update the goal table? Find the ID of
export async function handleCollectedEvent(payload) {
  // If the "event" is to update user inclusion, handle that

  // normalize time
  // TODO rewrite this logic, a little round-about
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

  // this is where we would put all the DB writes for the experiment
  // if I had one

  // for now, if experiment is active, log it
  console.log("handleCollectedEvent: event accepted:", payload);

  let result = null;
  switch (payload.event_type) {
    // do new_visitor and experiment_include correspond to the same event?
    case "experiment_include":
      result = await handleExperiment_IncludeEvent(payload);
      break;
    case "new_visitor":
      result = await handle_NewVisitorEvent(payload);
      break;
    case "completed_checkout":
      result = await handle_CompletedCheckoutEvent(payload);
      break;
    case "started_checkout":
      result = await handle_StartedCheckoutEvent(payload);
      break;
    case "viewed_page":
      result = await handle_ViewedPageEvent(payload);
      break;
    case "added_to_cart":
      result = await handle_AddedToCartEvent(payload);
      break;
    default:
      console.error("Received an event with an unknown event type");
      // todo look into side effects of this function, is there any upstream error handling that needs to be handled?
      break;

      return { ignored: false };
  }
  /*
  This code has been refactored to a separate function
  if (payload.event_type === "experiment_include") {
    // TODO ask what this corresponds to
    // handle that
    // Create user if they don't exist, otherwise update latest session
    const user = await db.user.upsert({
      where: {
        shopifyCustomerID: payload.user_id,
      },
      update: {
        latestSession: payload.timestamp,
      },
      create: {
        shopifyCustomerID: payload.user_id,
      },
    });

    // Then, tie that user to the experiment
    // First, get the variant ID from the variant name
    const variant = await getVariant(payload.experiment_id, payload.variant);

    if (!variant) {
      console.error(
        `Variant "${payload.variant}" not found for experiment ${payload.experiment_id}`,
      );
      return;
    }

    // Now create or update the allocation
    const result = await db.allocation.upsert({
      where: {
        // The where clause must match the unique constraint: [userId, experimentId]
        userId_experimentId: {
          userId: user.id,
          experimentId: payload.experiment_id,
        },
      },
      create: {
        // When creating, connect to existing records using their IDs
        userId: user.id,
        experimentId: payload.experiment_id,
        variantId: variant.id,
      },
      update: {
        // If allocation already exists, update the variant (in case it changed)
        variantId: variant.id,
      },
    });
    return;
  }
    */
  // so, from the looks of things, this code needs to be ran FIRST, to check the timestamp, and if the experiment is still active. If either of those
  // are bad, we fail and communicate the error to the client.
  /*
  // normalize time
  let timeCheck = payload.timestamp;
  if (!payload.timestamp) {
    timeCheck = new Date();
  } else if (!(payload.timestamp instanceof Date)) {
    timeCheck = new Date(payload.timestamp);
  }

  // Look up experiment (flesh this out in the future)
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

  // this is where we would put all the DB writes for the experiment
  // if I had one

  // for now, if experiment is active, log it
  console.log("handleCollectedEvent: event accepted:", payload);

  return { ignored: false };
*/
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
