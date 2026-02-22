/* eslint-disable no-console */

import { seedBase } from "./seed.base.js";
import { ExperimentStatus } from "@prisma/client";

/**
 * DEMO seed = "pretty data"
 * - Adds extra experiments w/ mixed statuses
 * - Adds many users + allocations
 * - Adds conversions + analysis time series so charts + tables look great
 */

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function ensureGoal(prisma, { name, metricType, icon }) {
  return prisma.goal.upsert({
    where: { name },
    update: { metricType, icon },
    create: { name, metricType, icon },
  });
}

async function ensureExperiment(prisma, exp) {
  return prisma.experiment.upsert({
    where: { id: exp.id },
    update: {
      name: exp.name,
      description: exp.description,
      status: exp.status,
      trafficSplit: exp.trafficSplit,
      sectionId: exp.sectionId,
      startDate: exp.startDate ?? null,
      endDate: exp.endDate ?? null,
      projectId: exp.projectId,
    },
    create: {
      id: exp.id,
      name: exp.name,
      description: exp.description,
      status: exp.status,
      trafficSplit: exp.trafficSplit,
      sectionId: exp.sectionId,
      startDate: exp.startDate ?? null,
      endDate: exp.endDate ?? null,
      projectId: exp.projectId,
    },
  });
}

async function ensureVariants(prisma, experimentId, variantDefs) {
  const created = [];
  for (const v of variantDefs) {
    const row = await prisma.variant.upsert({
      where: { id: v.id },
      update: {
        name: v.name,
        description: v.description,
        configData: v.configData,
        experimentId,
      },
      create: {
        id: v.id,
        name: v.name,
        description: v.description,
        configData: v.configData,
        experimentId,
      },
    });
    created.push(row);
  }
  return created;
}

async function ensureExperimentGoals(prisma, experimentId, goals) {
  // goals: [{ goalId, role }]
  for (const g of goals) {
    await prisma.experimentGoal.upsert({
      where: { experimentId_goalId: { experimentId, goalId: g.goalId } },
      update: { goalRole: g.role },
      create: { experimentId, goalId: g.goalId, goalRole: g.role },
    });
  }
}

async function seedDemoUsers(prisma, count = 250) {
  const users = [];
  for (let i = 1; i <= count; i++) {
    const id = `DEMO-USER-${String(i).padStart(4, "0")}`;
    users.push(
      prisma.user.upsert({
        where: { id },
        update: {},
        create: {
          id,
          shopifyCustomerID: id,
          deviceType: i % 2 === 0 ? "desktop" : "mobile",
        },
      })
    );
  }
  return Promise.all(users);
}

async function seedAllocations(prisma, { experimentId, variantIds, users, seed = 1 }) {
  const rand = mulberry32(seed + experimentId);

  for (const u of users) {
    const pick = Math.floor(rand() * variantIds.length);
    const variantId = variantIds[pick];

    await prisma.allocation.upsert({
      where: { userId_experimentId: { userId: u.id, experimentId } },
      update: { variantId, deviceType: u.deviceType ?? null },
      create: {
        userId: u.id,
        experimentId,
        variantId,
        deviceType: u.deviceType ?? null,
      },
    });
  }
}

async function seedConversions(prisma, { experimentId, goalId, variantIds, pByVariantId, days = 60, seed = 99 }) {
  // idempotent reset
  await prisma.conversion.deleteMany({ where: { experimentId, goalId } });

  const allocations = await prisma.allocation.findMany({
    where: { experimentId },
    select: { userId: true, variantId: true, deviceType: true },
  });

  const rand = mulberry32(seed + experimentId);
  const today = startOfDay(new Date());
  const start = addDays(today, -days);

  const converted = new Set();
  const rows = [];

  for (let dayIndex = 1; dayIndex <= days; dayIndex++) {
    const convertedWhen = addDays(start, dayIndex);

    for (const a of allocations) {
      if (converted.has(a.userId)) continue;

      const p = pByVariantId[a.variantId] ?? 0.08;
      if (rand() < p) {
        converted.add(a.userId);

        rows.push({
          convertedWhen,
          deviceType: a.deviceType ?? (rand() < 0.5 ? "desktop" : "mobile"),
          moneyValue: null,
          userId: a.userId,
          variantId: a.variantId,
          goalId,
          experimentId,
        });
      }
    }
  }

  if (rows.length) {
    await prisma.conversion.createMany({ data: rows });
  }

  return rows.length;
}

async function seedAnalysisSeries(prisma, { experimentId, goalId, variantIds, days = 60, seed = 123 }) {
  // idempotent reset
  await prisma.analysis.deleteMany({ where: { experimentId, goalId } });

  const rand = mulberry32(seed + experimentId);
  const today = startOfDay(new Date());
  const start = addDays(today, -days);

  // Make later variants “better” so demo charts look good
  const baseRates = {};
  variantIds.forEach((vid, i) => {
    baseRates[vid] = 0.06 + i * 0.02; // control ~6%, A ~8%, B ~10% etc.
  });

  const rows = [];

  for (let dayIndex = 1; dayIndex <= days; dayIndex++) {
    const calculatedWhen = addDays(start, dayIndex);

    for (const variantId of variantIds) {
      const noise = (rand() - 0.5) * 0.01; // +/- 0.5%
      const rate = Math.max(0.01, Math.min(0.5, baseRates[variantId] + noise));

      const totalUsers = 250 + Math.floor(rand() * 900) + dayIndex * 10;
      const totalConversions = Math.max(0, Math.round(totalUsers * rate));
      const conversionRate = totalConversions / totalUsers;

      const postAlpha = totalConversions + 1;
      const postBeta = totalUsers - totalConversions + 1;

      const isBestCandidate = variantId === variantIds[variantIds.length - 1];
      rows.push({
        calculatedWhen,
        daysAnalyzed: dayIndex,
        totalUsers,
        totalConversions,
        conversionRate,
        probabilityOfBeingBest: isBestCandidate ? 0.75 + rand() * 0.2 : 0.05 + rand() * 0.25,
        expectedLoss: isBestCandidate ? 0.001 + rand() * 0.006 : 0.01 + rand() * 0.03,
        credIntervalLift: { lower: -0.02, upper: 0.08 },
        postAlpha,
        postBeta,
        experimentId,
        variantId,
        goalId,
      });
    }
  }

  await prisma.analysis.createMany({ data: rows });
  return rows.length;
}

export async function seedDemo(prisma) {
  console.log("Running demo seed...");

  await seedBase(prisma);

  // Grab base project
  const project = await prisma.project.findUnique({
    where: { shop: "dev-example.myshopify.com" },
  });
  if (!project) throw new Error("Base seed project missing. Did seedBase(prisma) run?");

  // Ensure a couple extra goals for demo variety
  const completedCheckout = await prisma.goal.findUnique({ where: { name: "Completed Checkout" } });
  if (!completedCheckout) throw new Error("Base goal missing: Completed Checkout");

  const newsletterSignup = await ensureGoal(prisma, {
    name: "Newsletter Signup",
    metricType: "conversion",
    icon: "mail",
  });

  const productViewDepth = await ensureGoal(prisma, {
    name: "Product View Depth",
    metricType: "conversion",
    icon: "insights",
  });

  // Create a bunch of demo experiments
  const today = startOfDay(new Date());

  const demoExperiments = [
    {
      id: 9101,
      name: "DEMO - PDP Upsell Widget",
      description: "Show upsell widget and track checkout conversions.",
      status: ExperimentStatus.active,
      trafficSplit: "1.0",
      sectionId: "pdp-upsell",
      startDate: addDays(today, -35),
      endDate: null,
      projectId: project.id,
    },
    {
      id: 9102,
      name: "DEMO - Free Shipping Threshold",
      description: "Test threshold messaging impact on revenue and checkout.",
      status: ExperimentStatus.active,
      trafficSplit: "1.0",
      sectionId: "shipping-threshold",
      startDate: addDays(today, -28),
      endDate: null,
      projectId: project.id,
    },
    {
      id: 9103,
      name: "DEMO - Newsletter Modal",
      description: "Compare modal timing and copy for newsletter signup.",
      status: ExperimentStatus.active,
      trafficSplit: "1.0",
      sectionId: "newsletter-modal",
      startDate: addDays(today, -21),
      endDate: null,
      projectId: project.id,
    },
    {
      id: 9104,
      name: "DEMO - Cart Drawer Layout",
      description: "Cart drawer layout changes; paused due to design review.",
      status: ExperimentStatus.paused,
      trafficSplit: "1.0",
      sectionId: "cart-drawer",
      startDate: addDays(today, -40),
      endDate: null,
      projectId: project.id,
    },
    {
      id: 9105,
      name: "DEMO - Homepage Collection Tiles",
      description: "Completed experiment; treatment won.",
      status: ExperimentStatus.completed,
      trafficSplit: "1.0",
      sectionId: "home-collections",
      startDate: addDays(today, -70),
      endDate: addDays(today, -10),
      projectId: project.id,
    },
    {
      id: 9106,
      name: "DEMO - Announcement Bar Copy",
      description: "Archived historical experiment.",
      status: ExperimentStatus.archived,
      trafficSplit: "1.0",
      sectionId: "announcement-bar",
      startDate: addDays(today, -120),
      endDate: addDays(today, -90),
      projectId: project.id,
    },
    // add some drafts so the table looks real
    {
      id: 9107,
      name: "DEMO - Checkout Trust Badges",
      description: "Draft experiment in planning.",
      status: ExperimentStatus.draft,
      trafficSplit: "1.0",
      sectionId: "checkout-badges",
      startDate: null,
      endDate: null,
      projectId: project.id,
    },
    {
      id: 9108,
      name: "DEMO - Sticky ATC",
      description: "Draft experiment in backlog.",
      status: ExperimentStatus.draft,
      trafficSplit: "1.0",
      sectionId: "sticky-atc",
      startDate: null,
      endDate: null,
      projectId: project.id,
    },
  ];

  for (const exp of demoExperiments) {
    await ensureExperiment(prisma, exp);
  }

  // Variants per experiment (some with 3 variants to demo multi-variant UI)
  // Variant IDs also far away from base (base uses ~3001-3012)
  const variantMap = {
    9101: [
      { id: 9201, name: "Control", description: "Current PDP", configData: { layout: "control" } },
      { id: 9202, name: "Variant A", description: "Upsell widget", configData: { widget: "upsell" } },
    ],
    9102: [
      { id: 9211, name: "Control", description: "Current threshold copy", configData: { thresholdCopy: "standard" } },
      { id: 9212, name: "Variant A", description: "New copy", configData: { thresholdCopy: "optimized" } },
      { id: 9213, name: "Variant B", description: "Aggressive copy", configData: { thresholdCopy: "aggressive" } },
    ],
    9103: [
      { id: 9221, name: "Control", description: "Delay 10s", configData: { delay: 10 } },
      { id: 9222, name: "Variant A", description: "Delay 30s", configData: { delay: 30 } },
    ],
    9104: [
      { id: 9231, name: "Control", description: "Classic drawer", configData: { drawer: "classic" } },
      { id: 9232, name: "Variant A", description: "Modern drawer", configData: { drawer: "modern" } },
    ],
    9105: [
      { id: 9241, name: "Control", description: "Old tiles", configData: { tiles: "old" } },
      { id: 9242, name: "Variant A", description: "New tiles", configData: { tiles: "new" } },
    ],
    9106: [
      { id: 9251, name: "Control", description: "Old bar", configData: { bar: "old" } },
      { id: 9252, name: "Variant A", description: "New bar", configData: { bar: "new" } },
    ],
    9107: [
      { id: 9261, name: "Control", description: "N/A", configData: { } },
      { id: 9262, name: "Variant A", description: "N/A", configData: { } },
    ],
    9108: [
      { id: 9271, name: "Control", description: "N/A", configData: { } },
      { id: 9272, name: "Variant A", description: "N/A", configData: { } },
    ],
  };

  for (const exp of demoExperiments) {
    await ensureVariants(prisma, exp.id, variantMap[exp.id]);
  }

  // Goal mappings: give each experiment a primary + some secondaries
  for (const exp of demoExperiments) {
    const primaryGoalId =
      exp.id === 9103 ? newsletterSignup.id :
      exp.id === 9101 ? completedCheckout.id :
      exp.id === 9102 ? completedCheckout.id :
      exp.id === 9105 ? completedCheckout.id :
      exp.id === 9106 ? completedCheckout.id :
      productViewDepth.id;

    await ensureExperimentGoals(prisma, exp.id, [
      { goalId: primaryGoalId, role: "primary" },
      { goalId: completedCheckout.id, role: "secondary" },
      { goalId: newsletterSignup.id, role: "secondary" },
    ]);
  }

  // Users
  const users = await seedDemoUsers(prisma, 280);

  // Allocate users to ACTIVE/PAUSED/COMPLETED experiments (drafts typically have few/no allocations)
  const allocTargets = [
    { experimentId: 9101, variantIds: variantMap[9101].map(v => v.id), seed: 10 },
    { experimentId: 9102, variantIds: variantMap[9102].map(v => v.id), seed: 20 },
    { experimentId: 9103, variantIds: variantMap[9103].map(v => v.id), seed: 30 },
    { experimentId: 9104, variantIds: variantMap[9104].map(v => v.id), seed: 40 },
    { experimentId: 9105, variantIds: variantMap[9105].map(v => v.id), seed: 50 },
  ];

  for (const t of allocTargets) {
    await seedAllocations(prisma, {
      experimentId: t.experimentId,
      variantIds: t.variantIds,
      users,
      seed: t.seed,
    });
  }

  // Conversions (pretty outcomes)
  // Make “last” variant in each experiment usually best
  const conversionTargets = [
    { experimentId: 9101, goalId: completedCheckout.id, variantIds: variantMap[9101].map(v => v.id), days: 60, seed: 111,
      pByVariantId: { 9201: 0.06, 9202: 0.095 } },
    { experimentId: 9102, goalId: completedCheckout.id, variantIds: variantMap[9102].map(v => v.id), days: 60, seed: 222,
      pByVariantId: { 9211: 0.055, 9212: 0.075, 9213: 0.085 } },
    { experimentId: 9103, goalId: newsletterSignup.id, variantIds: variantMap[9103].map(v => v.id), days: 45, seed: 333,
      pByVariantId: { 9221: 0.08, 9222: 0.11 } },
    { experimentId: 9104, goalId: completedCheckout.id, variantIds: variantMap[9104].map(v => v.id), days: 35, seed: 444,
      pByVariantId: { 9231: 0.065, 9232: 0.062 } }, // paused: roughly flat
    { experimentId: 9105, goalId: completedCheckout.id, variantIds: variantMap[9105].map(v => v.id), days: 60, seed: 555,
      pByVariantId: { 9241: 0.06, 9242: 0.09 } }, // completed: strong winner
  ];

  for (const t of conversionTargets) {
    const count = await seedConversions(prisma, t);
    console.log(`Seeded conversions exp ${t.experimentId}: ${count}`);
  }

  // Analysis series (pretty graphs)
  // Active: long series; paused: shorter; completed: long series; drafts: none
  const analysisTargets = [
    { experimentId: 9101, goalId: completedCheckout.id, variantIds: variantMap[9101].map(v => v.id), days: 60, seed: 1010 },
    { experimentId: 9102, goalId: completedCheckout.id, variantIds: variantMap[9102].map(v => v.id), days: 60, seed: 2020 },
    { experimentId: 9103, goalId: newsletterSignup.id, variantIds: variantMap[9103].map(v => v.id), days: 45, seed: 3030 },
    { experimentId: 9104, goalId: completedCheckout.id, variantIds: variantMap[9104].map(v => v.id), days: 35, seed: 4040 },
    { experimentId: 9105, goalId: completedCheckout.id, variantIds: variantMap[9105].map(v => v.id), days: 60, seed: 5050 },
    { experimentId: 9106, goalId: completedCheckout.id, variantIds: variantMap[9106].map(v => v.id), days: 20, seed: 6060 },
  ];

  for (const t of analysisTargets) {
    const rows = await seedAnalysisSeries(prisma, t);
    console.log(`Seeded analysis rows exp ${t.experimentId}: ${rows}`);
  }

  console.log("Demo seed completed successfully.");
}