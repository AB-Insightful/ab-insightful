/* eslint-disable no-console */
/**
 * Prisma dev seed script
 * 
 */

import { seedBase } from "./seed.base.js";



export async function seedDev(prisma) {
  await seedBase(prisma);

  const completedCheckoutGoal = await prisma.goal.findUnique({
    where: { name: "Completed Checkout" },
  });

  if (!completedCheckoutGoal) {
    throw new Error("Completed Checkout goal missing. Did seedBase(prisma) run?");
  }

  const seededUserId = '25483AF2-8116-495D-a412-dfbb395adb42';

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
    where: {
      userId_experimentId: {
        userId: seededUserId,
        experimentId: 2003
      }
    },
    update: {
      userId: seededUser.id,
      experimentId: 2003,
      variantId: 3005,
    },
    create: {
      userId: seededUser.id,
      experimentId: 2003,
      variantId: 3005,
    },
  });

    await prisma.conversion.deleteMany({
    where: { experimentId: 2003, goalId: completedCheckoutGoal.id },
  });

  await prisma.conversion.upsert({
    where: {
      experimentId_goalId_userId: {
        experimentId: 2003,
        goalId: completedCheckoutGoal.id,
        userId: seededUser.id,
      },
    },
    update: {
      convertedWhen: new Date("2025-01-10T00:00:00.000Z"),
      deviceType: "desktop",
      moneyValue: null,
      variantId: 3005,
    },
    create: {
      convertedWhen: new Date("2025-01-10T00:00:00.000Z"),
      deviceType: "desktop",
      moneyValue: null,
      userId: seededUser.id,
      variantId: 3005,
      goalId: completedCheckoutGoal.id,
      experimentId: 2003,
    },
  });

    await prisma.analysis.deleteMany({ where: { experimentId: 2003 } });

  console.log('Dev seed completed successfully.');
}