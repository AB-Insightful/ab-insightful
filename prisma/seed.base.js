
/* eslint-disable no-console */
/**
 * Prisma base seed script using upsert for idempotency.
 * 
 */


export async function seedBase(prisma) {

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

  async function upsertExperimentGoal(experimentId, goalId, role) {
    await prisma.experimentGoal.upsert({
        where: { experimentId_goalId: { experimentId, goalId } },
        update: { goalRole: role },
        create: { experimentId, goalId, goalRole: role },
    });
  }

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
      trafficSplit: 1.0,
      sectionId: 'hero-home',
      projectId: project.id,
    },
    create: {
      id: 2001,
      name: 'Homepage Hero Test',
      description: 'Test whether a new hero layout improves engagement.',
      status: 'draft',
      trafficSplit: 1.0,
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
      trafficSplit: 1.0,
      sectionId: 'product-page',
      projectId: project.id,
    },
    create: {
      id: 2002,
      name: 'Product Page Layout Test',
      description: 'Test whether rearranging product info improves engagement.',
      status: 'draft',
      trafficSplit: 1.0,
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
      trafficSplit: 1.0,
      sectionId: 'add-to-cart',
      projectId: project.id,
    },
    create: {
      id: 2003,
      name: 'Add-to-Cart Button Color Test',
      description: 'Measure conversion rate impact of different button colors.',
      status: 'active',
      trafficSplit: 1.0,
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
      trafficSplit: 1.0,
      sectionId: 'pricing-display',
      projectId: project.id,
    },
    create: {
      id: 2004,
      name: 'Pricing Display Test',
      description: 'Evaluate if showing discounts more prominently increases checkout starts.',
      status: 'paused',
      trafficSplit: 1.0,
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
      trafficSplit: 1.0,
      sectionId: 'checkout-form',
      projectId: project.id,
    },
    create: {
      id: 2005,
      name: 'Checkout Form Simplification',
      description: 'Determine whether a simplified checkout form reduces drop-off rate.',
      status: 'draft',
      trafficSplit: 1.0,
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
      trafficSplit: 1.0,
      sectionId: 'email-modal',
      projectId: project.id,
    },
    create: {
      id: 2006,
      name: 'Email Opt-In Modal Timing',
      description: 'Test whether timing of email capture modal affects signup conversion.',
      status: 'draft',
      trafficSplit: 1.0,
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

  // ----- Session (seed) -----
  const session = await prisma.session.upsert({
    where: { id: "dev-seed-session" },
    update: {
      shop: project.shop,
    },
    create: {
      id: "dev-seed-session",
      shop: project.shop,
      state: "seed",
      accessToken: "seed-token",
      isOnline: true,
    },
  });

  // ----- TutorialData -----
  await prisma.tutorialData.upsert({
    where: { sessionId: session.id },
    update: {
      generalSettings: true,
      createExperiment: true,
      viewedListExperiment: false,
      viewedReportsPage: false,
      onSiteTracking: false,
    },
    create: {
      sessionId: session.id,
      generalSettings: true,
      createExperiment: true,
      viewedListExperiment: false,
      viewedReportsPage: false,
      onSiteTracking: false,
    },
  });

    // ----- ContactEmail -----
  await prisma.contactEmail.upsert({
    where: { email_projectId: { email: "dev@example.com", projectId: project.id } },
    update: {},
    create: { email: "dev@example.com", projectId: project.id },
  });

  console.log("Base seed completed successfully.");
}