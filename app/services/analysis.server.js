//database queries and functions tied to analysis table. Place relevant functions here.
import db from "../db.server";

import { setProbabilityOfBest } from "./experiment.server";

//get analysis by id
export async function getAnalysisById(id) {
  //needs to be the latest info ??
  if (id) {
    const experimentAnalysis = await db.analysis.findUnique({
      where: {
        id: id,
      },
      orderBy: {
        probabilityOfBeingBest: "desc",
      },
    });
    return experimentAnalysis;
  }
  return null;
}

// Function to aggregate real Allocation and Conversion data for active experiments into new Analysis rows for all active experiments
export async function createAnalysisSnapshot() {
  // 1. Get active experiments with their variants and goals
  const experiments = await db.experiment.findMany({
    where: { status: "active" },
    select: {
      id: true,
      startDate: true,
      variants: { select: { id: true } },
      experimentGoals: { select: { goalId: true } },
    },
  });

  // Check if any experiments exist
  if (!experiments.length) {
    return new Response(
      JSON.stringify({
        message: "no experiments; no analysis. no-op.",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  // Create list of experiment IDs
  const experimentIds = experiments.map((e) => e.id);

  // 2. Aggregate allocations and conversions
  const allocationGroups = await db.allocation.groupBy({
    by: ["experimentId", "variantId"],
    _count: { id: true },
    where: { experimentId: { in: experimentIds } },
  });
  const conversionGroups = await db.conversion.groupBy({
    by: ["experimentId", "variantId", "goalId"],
    _count: { id: true },
    where: { experimentId: { in: experimentIds } },
  });

  // 3. Build lookup maps to access allocation / conversion data
  const allocationMap = new Map();
  // Basically what this is saying is make a data structure with key value pairs. The key will always be "experimentID-variantid" and the value will be the count.
  for (const row of allocationGroups) {
    allocationMap.set(`${row.experimentId}-${row.variantId}`, row._count.id);
  }

  const conversionMap = new Map();
  for (const row of conversionGroups) {
    conversionMap.set(
      `${row.experimentId}-${row.variantId}-${row.goalId}`,
      row._count.id,
    );
  }

  // 4. Build Analysis rows for every (experiment, variant, goal) combo
  const now = new Date();
  const analysisRows = [];

  for (const exp of experiments) {
    // If we have a start date, use it to calculate days analyzed. If it's less than one day, just use one day as the number of days analyzed.
    const daysAnalyzed = exp.startDate
      ? Math.max(
          1,
          Math.floor((now - new Date(exp.startDate)) / (1000 * 60 * 60 * 24)),
        )
      : 1;

    for (const variant of exp.variants) {
      const totalUsers = allocationMap.get(`${exp.id}-${variant.id}`) ?? 0;
      // Nothing to do if there's no total users. In otherwords, experiment with no data.
      if (totalUsers === 0) continue;

      // At this point we're looking at each experiment -> it's variants -> the goals of that experiment
      for (const eg of exp.experimentGoals) {
        const totalConversions =
          conversionMap.get(`${exp.id}-${variant.id}-${eg.goalId}`) ?? 0;
        const conversionRate = totalConversions / totalUsers;
        const postAlpha = totalConversions + 1;
        const postBeta = totalUsers - totalConversions + 1;

        // Stack all the analysis data into the rows so it can be inserted all together later
        analysisRows.push({
          daysAnalyzed,
          totalUsers,
          totalConversions,
          conversionRate,
          postAlpha,
          postBeta,
          credIntervalLift: { lower: 0, upper: 0 },
          experimentId: exp.id,
          variantId: variant.id,
          goalId: eg.goalId,
        });
      }
    }
  }

  // 5. Bulk-create the rows (probabilityOfBeingBest and expectedLoss default to null because they get filled out in the next step)
  let ret = new Response(
    JSON.stringify({
      message: "no analysis rows created.",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );

  if (analysisRows.length) {
    const resp = await db.analysis.createMany({ data: analysisRows });
    ret = new Response(
      JSON.stringify({
        message: "created new analysis rows.",
        data: resp,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 6. Use existing probability of best calculation to fill in probability of best and expected loss
  for (const exp of experiments) {
    for (const eg of exp.experimentGoals) {
      await setProbabilityOfBest({
        experimentId: exp.id,
        goalId: eg.goalId,
      });
    }
  }
  return ret;
}
