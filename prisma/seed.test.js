
/* eslint-disable no-console */

import { seedBase } from "./seed.base.js";
import { ExperimentStatus } from "@prisma/client";

/**
 * Test Seed template
 * 
 * This file is meant to test features
 * 
 * How to use:
 * - Add what you need below using usert() so this seed is idempotent
 * - Use IDs (ex: 9000+) that is reserved for test-only records
 */

export async function seedTest(prisma) {

    console.log("Running test seed...");

    await seedBase(prisma);

    const project = await prisma.project.findUnique({
    where: { shop: "dev-example.myshopify.com" },
    });

    if (!project) {
    throw new Error("Base seed project not found. Did seedBase(prisma) run?");
    }
    

  // TEMPLATE: Create a test user
  const testUserId = "TEST-USER-0001";

  const testUser = await prisma.user.upsert({
    where: { id: testUserId },
    update: {},
    create: {
      id: testUserId,
      shopifyCustomerID: testUserId,
    },
  });

  // TEMPLATE: Create a test experiment (DRAFT / ACTIVE / PAUSED)
  const testExperiment = await prisma.experiment.upsert({
    where: { id: 9001 },
    update: {
      name: "TEST Experiment - Active",
      description: "Fixture experiment for automated tests.",
      status: ExperimentStatus.active,
      trafficSplit: "1.0",
      sectionId: "test-section",
      projectId: project.id,
    },
    create: {
      id: 9001,
      name: "TEST Experiment - Active",
      description: "Fixture experiment for automated tests.",
      status: ExperimentStatus.active,
      trafficSplit: "1.0",
      sectionId: "test-section",
      projectId: project.id,
    },
  });

  // TEMPLATE: Create variants for that experiment
  const controlVariant = await prisma.variant.upsert({
    where: { id: 9101 },
    update: {
      name: "Control",
      description: "Control variant fixture",
      configData: { version: "control" },
      experimentId: testExperiment.id,
    },
    create: {
      id: 9101,
      name: "Control",
      description: "Control variant fixture",
      configData: { version: "control" },
      experimentId: testExperiment.id,
    },
  });

  const variantA = await prisma.variant.upsert({
    where: { id: 9102 },
    update: {
      name: "Variant A",
      description: "Treatment variant fixture",
      configData: { version: "A" },
      experimentId: testExperiment.id,
    },
    create: {
      id: 9102,
      name: "Variant A",
      description: "Treatment variant fixture",
      configData: { version: "A" },
      experimentId: testExperiment.id,
    },
  });

  // TEMPLATE: Allocate a user to a variant
  await prisma.allocation.upsert({
    where: {
      userId_experimentId: {
        userId: testUser.id,
        experimentId: testExperiment.id,
      },
    },
    update: {
      variantId: variantA.id,
    },
    create: {
      userId: testUser.id,
      experimentId: testExperiment.id,
      variantId: variantA.id,
    },
  });

  // TEMPLATE: Add deterministic analysis data (no daysAgo())
  const completedCheckoutGoal = await prisma.goal.findUnique({
    where: { name: "Completed Checkout" },
  });

  await prisma.analysis.upsert({
    where: { id: 9201 },
    update: {
      calculatedWhen: new Date("2025-01-01T00:00:00.000Z"),
      daysAnalyzed: 7,
      totalUsers: 1000,
      totalConversions: 120,
      conversionRate: 0.12,
      probabilityOfBeingBest: 0.8,
      expectedLoss: 0.01,
      credIntervalLift: { lower: 0.01, upper: 0.05 },
      postAlpha: 121,
      postBeta: 881,
      experimentId: testExperiment.id,
      variantId: variantA.id,
      goalId: completedCheckoutGoal.id,
    },
    create: {
      id: 9201,
      calculatedWhen: new Date("2025-01-01T00:00:00.000Z"),
      daysAnalyzed: 7,
      totalUsers: 1000,
      totalConversions: 120,
      conversionRate: 0.12,
      probabilityOfBeingBest: 0.8,
      expectedLoss: 0.01,
      credIntervalLift: { lower: 0.01, upper: 0.05 },
      postAlpha: 121,
      postBeta: 881,
      experimentId: testExperiment.id,
      variantId: variantA.id,
      goalId: completedCheckoutGoal.id,
    },
  });

  console.log("Test seed completed successfully.");
}