export async function seedProd(prisma) {
  const project = await prisma.project.upsert({
    where: { shop: "dev-example.myshopify.com" },
    update: {
      name: "Default Project",
      maxUsersPerExperiment: 10000,
    },
    create: {
      shop: "dev-example.myshopify.com",
      name: "Default Project",
      maxUsersPerExperiment: 10000,
    },
  });

  const session = await prisma.session.upsert({
    where: { id: "prod-seed-session" },
    update: {
      shop: project.shop,
    },
    create: {
      id: "prod-seed-session",
      shop: project.shop,
      state: "seed",
      accessToken: "seed-token",
      isOnline: true,
    },
  });

  await prisma.goal.upsert({
    where: { name: "Completed Checkout" },
    update: {},
    create: {
      name: "Completed Checkout",
      metricType: "revenue",
      icon: "shopping_cart",
    },
  });

  await prisma.goal.upsert({
    where: { name: "Started Checkout" },
    update: {},
    create: {
      name: "Started Checkout",
      metricType: "conversion",
      icon: "checkout",
    },
  });

  await prisma.goal.upsert({
    where: { name: "Viewed Page" },
    update: {},
    create: {
      name: "Viewed Page",
      metricType: "conversion",
      icon: "visibility",
    },
  });

  await prisma.goal.upsert({
    where: { name: "Added Product To Cart" },
    update: {},
    create: {
      name: "Added Product To Cart",
      metricType: "conversion",
      icon: "add_shopping_cart",
    },
  });

  await prisma.tutorialData.upsert({
    where: { id: 1 },
    update: {
      sessionId: session.id,
      generalSettings: false,
      createExperiment: false,
      viewedListExperiment: false,
      viewedReportsPage: false,
      onSiteTracking: false,
    },
    create: {
      id: 1,
      sessionId: session.id,
      generalSettings: false,
      createExperiment: false,
      viewedListExperiment: false,
      viewedReportsPage: false,
      onSiteTracking: false,
    },
  });

  console.log('Prod seed completed successfully.');
}