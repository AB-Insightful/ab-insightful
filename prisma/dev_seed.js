/* eslint-disable no-console */
/**
 * Prisma seed script using upsert for idempotency.
 * 
 */

import { error } from "console";



async function seed(prisma) {

  // ----- Project -----
  const project = await prisma.project.upsert({
    where: { shop: 'dev-example.myshopify.com' },
    update: { name: 'Dev Example Project' },
    create: {
      shop: 'dev-example.myshopify.com',
      name: 'Dev Example Project',
    },
  });

  // ----- Goals -----
  const completedCheckoutGoal = await prisma.goal.upsert({
    where: { name: 'Completed Checkout' },
    update: {},
    create: {
      name: 'Completed Checkout',
      metricType: 'revenue',
      icon: 'shopping_cart',
    },
  });

  const startedCheckoutGoal = await prisma.goal.upsert({
    where: { name: 'Started Checkout' },
    update: {},
    create: {
      name: 'Started Checkout',
      metricType: 'conversion',
      icon: 'checkout',
    },
  });

  const viewedPageGoal = await prisma.goal.upsert({
    where: { name: 'Viewed Page' },
    update: {},
    create: {
      name: 'Viewed Page',
      metricType: 'conversion',
      icon: 'visibility',
    },
  });

  const addedToCartGoal = await prisma.goal.upsert({
    where: { name: 'Added Product To Cart' },
    update: {},
    create: {
      name: 'Added Product To Cart',
      metricType: 'conversion',
      icon: 'add_shopping_cart',
    },
  });

  // ----- Experiments -----
  const experiment = await prisma.experiment.upsert({
    where: { id: 2001 },
    update: {
      name: 'Homepage Hero Test',
      description: 'Test whether a new hero layout improves engagement.',
      status: 'draft',
      trafficSplit: '1.0',
      sectionId: 'hero-home',
      projectId: project.id,
    },
    create: {
      id: 2001,
      name: 'Homepage Hero Test',
      description: 'Test whether a new hero layout improves engagement.',
      status: 'draft',
      trafficSplit: '1.0',
      sectionId: 'hero-home',
      projectId: project.id,
    },
  });

  const experiment2 = await prisma.experiment.upsert({
    where: { id: 2002 },
    update: {
      name: 'Product Page Layout Test',
      description: 'Test whether rearranging product info improves engagement.',
      status: 'draft',
      trafficSplit: '1.0',
      sectionId: 'product-page',
      projectId: project.id,
    },
    create: {
      id: 2002,
      name: 'Product Page Layout Test',
      description: 'Test whether rearranging product info improves engagement.',
      status: 'draft',
      trafficSplit: '1.0',
      sectionId: 'product-page',
      projectId: project.id,
    },
  });

  const experiment3 = await prisma.experiment.upsert({
    where: { id: 2003 },
    update: {
      name: 'Add-to-Cart Button Color Test',
      description: 'Measure conversion rate impact of different button colors.',
      status: 'active',
      trafficSplit: '1.0',
      sectionId: 'add-to-cart',
      projectId: project.id,
    },
    create: {
      id: 2003,
      name: 'Add-to-Cart Button Color Test',
      description: 'Measure conversion rate impact of different button colors.',
      status: 'active',
      trafficSplit: '1.0',
      sectionId: 'add-to-cart',
      projectId: project.id,
    },
  });

  const experiment4 = await prisma.experiment.upsert({
    where: { id: 2004 },
    update: {
      name: 'Pricing Display Test',
      description: 'Evaluate if showing discounts more prominently increases checkout starts.',
      status: 'paused',
      trafficSplit: '1.0',
      sectionId: 'pricing-display',
      projectId: project.id,
    },
    create: {
      id: 2004,
      name: 'Pricing Display Test',
      description: 'Evaluate if showing discounts more prominently increases checkout starts.',
      status: 'paused',
      trafficSplit: '1.0',
      sectionId: 'pricing-display',
      projectId: project.id,
    },
  });

  const experiment5 = await prisma.experiment.upsert({
    where: { id: 2005 },
    update: {
      name: 'Checkout Form Simplification',
      description: 'Determine whether a simplified checkout form reduces drop-off rate.',
      status: 'draft',
      trafficSplit: '1.0',
      sectionId: 'checkout-form',
      projectId: project.id,
    },
    create: {
      id: 2005,
      name: 'Checkout Form Simplification',
      description: 'Determine whether a simplified checkout form reduces drop-off rate.',
      status: 'draft',
      trafficSplit: '1.0',
      sectionId: 'checkout-form',
      projectId: project.id,
    },
  });

  const experiment6 = await prisma.experiment.upsert({
    where: { id: 2006 },
    update: {
      name: 'Email Opt-In Modal Timing',
      description: 'Test whether timing of email capture modal affects signup conversion.',
      status: 'draft',
      trafficSplit: '1.0',
      sectionId: 'email-modal',
      projectId: project.id,
    },
    create: {
      id: 2006,
      name: 'Email Opt-In Modal Timing',
      description: 'Test whether timing of email capture modal affects signup conversion.',
      status: 'draft',
      trafficSplit: '1.0',
      sectionId: 'email-modal',
      projectId: project.id,
    },
  });

  // ----- Variants for All Experiments -----
  const experiments = [experiment, experiment2, experiment3, experiment4, experiment5, experiment6];
  const variantConfigs = [
    { idStart: 3001, control: { layout: 'current' }, variant: { layout: 'cta' } },
    { idStart: 3003, control: { layout: 'default' }, variant: { layout: 'sticky_cta' } },
    { idStart: 3005, control: { color: 'green' }, variant: { color: 'orange' } },
    { idStart: 3007, control: { showDiscount: false }, variant: { showDiscount: true } },
    { idStart: 3009, control: { steps: 3 }, variant: { steps: 1 } },
    { idStart: 3011, control: { delay: 10 }, variant: { delay: 30 } },
  ];

  for (let i = 0; i < experiments.length; i++) {
    const exp = experiments[i];
    const base = variantConfigs[i];
    await prisma.variant.upsert({
      where: { id: base.idStart },
      update: {
        name: 'Control',
        description: 'Control variant',
        configData: base.control,
        experimentId: exp.id,
      },
      create: {
        id: base.idStart,
        name: 'Control',
        description: 'Control variant',
        configData: base.control,
        experimentId: exp.id,
      },
    });

    await prisma.variant.upsert({
      where: { id: base.idStart + 1 },
      update: {
        name: 'Variant A',
        description: 'Treatment variant',
        configData: base.variant,
        experimentId: exp.id,
      },
      create: {
        id: base.idStart + 1,
        name: 'Variant A',
        description: 'Treatment variant',
        configData: base.variant,
        experimentId: exp.id,
      },
    });
  }

  // ----- Experiment ↔ Goals (join) for all experiments -----
  async function upsertExperimentGoal(expId, goalId, role) {
    await prisma.experimentGoal.upsert({
      where: {
        experimentId_goalId: {
          experimentId: expId,
          goalId,
        },
      },
      update: { goalRole: role },
      create: {
        experimentId: expId,
        goalId,
        goalRole: role,
      },
    });
  }

  const goalRoles = [
    { goalId: completedCheckoutGoal.id, role: 'primary' },
    { goalId: startedCheckoutGoal.id, role: 'secondary' },
    { goalId: viewedPageGoal.id, role: 'secondary' },
    { goalId: addedToCartGoal.id, role: 'secondary' },
  ];

  for (const exp of experiments) {
    for (const g of goalRoles) {
      await upsertExperimentGoal(exp.id, g.goalId, g.role);
    }
  }

  // ----- User + Allocation (requested additions) -----
  const seededUserId = 'df6a7311-081b-47fb-8518-41f7c203a314';

  const seededUser = await prisma.user.upsert({
    where: { id: seededUserId },
    update: {
      shopifyCustomerID: seededUserId,
    },
    create: {
      id: seededUserId,
      shopifyCustomerID: seededUserId,
    },
  });

  await prisma.allocation.upsert({
    where: { id: seededUserId },
    update: {
      userId: seededUser.id,
      experimentId: 2003,
      variantId: 3003,
    },
    create: {
      // Allocation.id is Int in your schema; this will only work if your actual DB/client uses String for this field.
      // Keeping your requested value as-is.
      id: seededUserId,
      userId: seededUser.id,
      experimentId: 2003,
      variantId: 3003,
    },
  });

  // ----- Analysis Data for Active/Paused Experiments -----
  // Generate time-series analysis data for experiments 2003 (active) and 2004 (paused)
  // This creates daily snapshots to support trend visualizations

  // Helper to create date offsets from today
  const daysAgo = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  };

  // Analysis data for Experiment 2003 (Add-to-Cart Button Color Test) - Active
  // Control variant (3005) vs Variant A (3006)
  const exp2003AnalysisData = [
    // Day 1 - initial data
    { id: 5001, daysAnalyzed: 1, calculatedWhen: daysAgo(13), variantId: 3005, totalUsers: 120, totalConversions: 8, conversionRate: 0.067, probBest: 0.35, expectedLoss: 0.012, postAlpha: 9, postBeta: 113 },
    { id: 5002, daysAnalyzed: 1, calculatedWhen: daysAgo(13), variantId: 3006, totalUsers: 115, totalConversions: 10, conversionRate: 0.087, probBest: 0.65, expectedLoss: 0.005, postAlpha: 11, postBeta: 106 },
    // Day 3
    { id: 5003, daysAnalyzed: 3, calculatedWhen: daysAgo(11), variantId: 3005, totalUsers: 340, totalConversions: 24, conversionRate: 0.071, probBest: 0.28, expectedLoss: 0.018, postAlpha: 25, postBeta: 317 },
    { id: 5004, daysAnalyzed: 3, calculatedWhen: daysAgo(11), variantId: 3006, totalUsers: 355, totalConversions: 35, conversionRate: 0.099, probBest: 0.72, expectedLoss: 0.003, postAlpha: 36, postBeta: 321 },
    // Day 5
    { id: 5005, daysAnalyzed: 5, calculatedWhen: daysAgo(9), variantId: 3005, totalUsers: 580, totalConversions: 42, conversionRate: 0.072, probBest: 0.18, expectedLoss: 0.022, postAlpha: 43, postBeta: 539 },
    { id: 5006, daysAnalyzed: 5, calculatedWhen: daysAgo(9), variantId: 3006, totalUsers: 595, totalConversions: 62, conversionRate: 0.104, probBest: 0.82, expectedLoss: 0.002, postAlpha: 63, postBeta: 534 },
    // Day 7
    { id: 5007, daysAnalyzed: 7, calculatedWhen: daysAgo(7), variantId: 3005, totalUsers: 820, totalConversions: 61, conversionRate: 0.074, probBest: 0.12, expectedLoss: 0.028, postAlpha: 62, postBeta: 760 },
    { id: 5008, daysAnalyzed: 7, calculatedWhen: daysAgo(7), variantId: 3006, totalUsers: 840, totalConversions: 92, conversionRate: 0.110, probBest: 0.88, expectedLoss: 0.001, postAlpha: 93, postBeta: 749 },
    // Day 10
    { id: 5009, daysAnalyzed: 10, calculatedWhen: daysAgo(4), variantId: 3005, totalUsers: 1180, totalConversions: 89, conversionRate: 0.075, probBest: 0.08, expectedLoss: 0.032, postAlpha: 90, postBeta: 1092 },
    { id: 5010, daysAnalyzed: 10, calculatedWhen: daysAgo(4), variantId: 3006, totalUsers: 1210, totalConversions: 139, conversionRate: 0.115, probBest: 0.92, expectedLoss: 0.0008, postAlpha: 140, postBeta: 1072 },
    // Day 13 (latest)
    { id: 5011, daysAnalyzed: 13, calculatedWhen: daysAgo(1), variantId: 3005, totalUsers: 1520, totalConversions: 117, conversionRate: 0.077, probBest: 0.05, expectedLoss: 0.038, postAlpha: 118, postBeta: 1404 },
    { id: 5012, daysAnalyzed: 13, calculatedWhen: daysAgo(1), variantId: 3006, totalUsers: 1545, totalConversions: 185, conversionRate: 0.120, probBest: 0.95, expectedLoss: 0.0005, postAlpha: 186, postBeta: 1361 },
  ];

  // Analysis data for Experiment 2004 (Pricing Display Test) - Paused
  // Control variant (3007) vs Variant A (3008)
  const exp2004AnalysisData = [
    // Day 1
    { id: 5101, daysAnalyzed: 1, calculatedWhen: daysAgo(20), variantId: 3007, totalUsers: 95, totalConversions: 5, conversionRate: 0.053, probBest: 0.52, expectedLoss: 0.008, postAlpha: 6, postBeta: 91 },
    { id: 5102, daysAnalyzed: 1, calculatedWhen: daysAgo(20), variantId: 3008, totalUsers: 102, totalConversions: 5, conversionRate: 0.049, probBest: 0.48, expectedLoss: 0.009, postAlpha: 6, postBeta: 98 },
    // Day 4
    { id: 5103, daysAnalyzed: 4, calculatedWhen: daysAgo(17), variantId: 3007, totalUsers: 380, totalConversions: 22, conversionRate: 0.058, probBest: 0.55, expectedLoss: 0.006, postAlpha: 23, postBeta: 359 },
    { id: 5104, daysAnalyzed: 4, calculatedWhen: daysAgo(17), variantId: 3008, totalUsers: 395, totalConversions: 21, conversionRate: 0.053, probBest: 0.45, expectedLoss: 0.007, postAlpha: 22, postBeta: 375 },
    // Day 7
    { id: 5105, daysAnalyzed: 7, calculatedWhen: daysAgo(14), variantId: 3007, totalUsers: 680, totalConversions: 41, conversionRate: 0.060, probBest: 0.58, expectedLoss: 0.005, postAlpha: 42, postBeta: 640 },
    { id: 5106, daysAnalyzed: 7, calculatedWhen: daysAgo(14), variantId: 3008, totalUsers: 705, totalConversions: 39, conversionRate: 0.055, probBest: 0.42, expectedLoss: 0.006, postAlpha: 40, postBeta: 667 },
    // Day 10 (paused here - last data point)
    { id: 5107, daysAnalyzed: 10, calculatedWhen: daysAgo(11), variantId: 3007, totalUsers: 950, totalConversions: 58, conversionRate: 0.061, probBest: 0.56, expectedLoss: 0.004, postAlpha: 59, postBeta: 893 },
    { id: 5108, daysAnalyzed: 10, calculatedWhen: daysAgo(11), variantId: 3008, totalUsers: 980, totalConversions: 55, conversionRate: 0.056, probBest: 0.44, expectedLoss: 0.005, postAlpha: 56, postBeta: 926 },
  ];

  // Upsert Analysis records for experiment 2003
  for (const data of exp2003AnalysisData) {
    await prisma.analysis.upsert({
      where: { id: data.id },
      update: {
        calculatedWhen: data.calculatedWhen,
        daysAnalyzed: data.daysAnalyzed,
        totalUsers: data.totalUsers,
        totalConversions: data.totalConversions,
        conversionRate: data.conversionRate,
        probabilityOfBeingBest: data.probBest,
        expectedLoss: data.expectedLoss,
        credIntervalLift: { lower: -0.02, upper: 0.08 },
        postAlpha: data.postAlpha,
        postBeta: data.postBeta,
        experimentId: experiment3.id,
        variantId: data.variantId,
        goalId: completedCheckoutGoal.id,
      },
      create: {
        id: data.id,
        calculatedWhen: data.calculatedWhen,
        daysAnalyzed: data.daysAnalyzed,
        totalUsers: data.totalUsers,
        totalConversions: data.totalConversions,
        conversionRate: data.conversionRate,
        probabilityOfBeingBest: data.probBest,
        expectedLoss: data.expectedLoss,
        credIntervalLift: { lower: -0.02, upper: 0.08 },
        postAlpha: data.postAlpha,
        postBeta: data.postBeta,
        experimentId: experiment3.id,
        variantId: data.variantId,
        goalId: completedCheckoutGoal.id,
      },
    });
  }

  // Upsert Analysis records for experiment 2004
  for (const data of exp2004AnalysisData) {
    await prisma.analysis.upsert({
      where: { id: data.id },
      update: {
        calculatedWhen: data.calculatedWhen,
        daysAnalyzed: data.daysAnalyzed,
        totalUsers: data.totalUsers,
        totalConversions: data.totalConversions,
        conversionRate: data.conversionRate,
        probabilityOfBeingBest: data.probBest,
        expectedLoss: data.expectedLoss,
        credIntervalLift: { lower: -0.015, upper: 0.025 },
        postAlpha: data.postAlpha,
        postBeta: data.postBeta,
        experimentId: experiment4.id,
        variantId: data.variantId,
        goalId: completedCheckoutGoal.id,
      },
      create: {
        id: data.id,
        calculatedWhen: data.calculatedWhen,
        daysAnalyzed: data.daysAnalyzed,
        totalUsers: data.totalUsers,
        totalConversions: data.totalConversions,
        conversionRate: data.conversionRate,
        probabilityOfBeingBest: data.probBest,
        expectedLoss: data.expectedLoss,
        credIntervalLift: { lower: -0.015, upper: 0.025 },
        postAlpha: data.postAlpha,
        postBeta: data.postBeta,
        experimentId: experiment4.id,
        variantId: data.variantId,
        goalId: completedCheckoutGoal.id,
      },
    });
  }

  console.log('✅ Database successfully seeded.');
}

export function run_dev_seeding(prisma) {

  seed(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

