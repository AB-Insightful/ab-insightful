// @vitest-environment node

import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import db from "../db.server";
import { handleCollectedEvent } from "../services/experiment.server";

describe("handleCollectedEvent integration", () => {
  beforeEach(async () => {
    // clear runtime tables first
    await db.allocation.deleteMany();
    await db.conversion.deleteMany();
    await db.user.deleteMany();

    // clear only this test's fixed records
    await db.variant.deleteMany({
      where: {
        experimentId: {
          in: [9992, 9995],
        },
      },
    });

    await db.experiment.deleteMany({
      where: {
        id: {
          in: [9992, 9995],
        },
      },
    });

    await db.project.deleteMany({
      where: {
        id: {
          in: [9991, 9994],
        },
      },
    });

    // happy-path project/experiment/variant
    await db.project.create({
      data: {
        id: 9991,
        shop: "integration-test-shop.myshopify.com",
        name: "Integration Test Project",
      },
    });

    await db.experiment.create({
      data: {
        id: 9992,
        name: "Integration Test Experiment",
        description: "Testing experiment include pipeline",
        status: "active",
        trafficSplit: new Prisma.Decimal(1),
        sectionId: "section-1",
        projectId: 9991,
        variants: {
          create: [
            {
              id: 9993,
              name: "Control",
              trafficAllocation: new Prisma.Decimal(1),
            },
          ],
        },
      },
    });

    // failure-path project/experiment with NO matching Control variant
    await db.project.create({
      data: {
        id: 9994,
        shop: "integration-test-shop-2.myshopify.com",
        name: "Integration Test Project Missing Variant",
      },
    });

    await db.experiment.create({
      data: {
        id: 9995,
        name: "Integration Test Experiment Missing Variant",
        description: "Testing missing variant path",
        status: "active",
        trafficSplit: new Prisma.Decimal(1),
        sectionId: "section-2",
        projectId: 9994,
        variants: {
          create: [
            {
              id: 9996,
              name: "Variant A",
              trafficAllocation: new Prisma.Decimal(1),
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("creates a user and allocation with deviceType from experiment_include", async () => {
    const payload = {
      event_type: "experiment_include",
      client_id: "test123",
      experiment_id: 9992,
      experimentId: 9992,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T08:20:00.000Z",
    };

    const result = await handleCollectedEvent(payload);

    expect(result).toBeTruthy();
    expect(result).not.toEqual({ ignored: true });

    const user = await db.user.findUnique({
      where: {
        shopifyCustomerID: "test123",
      },
    });

    expect(user).toBeTruthy();
    expect(user.id).toBe("test123");
    expect(user.shopifyCustomerID).toBe("test123");

    const allocation = await db.allocation.findUnique({
      where: {
        userId_experimentId: {
          userId: "test123",
          experimentId: 9992,
        },
      },
    });

    expect(allocation).toBeTruthy();
    expect(allocation.userId).toBe("test123");
    expect(allocation.experimentId).toBe(9992);
    expect(allocation.variantId).toBe(9993);
    expect(allocation.deviceType).toBe("mobile");
  });

  it("returns ignored and does not create an allocation when the variant is not found", async () => {
    const payload = {
      event_type: "experiment_include",
      client_id: "missing-variant-user",
      experiment_id: 9995,
      experimentId: 9995,
      variant: "Control",
      device_type: "desktop",
      timestamp: "2026-03-04T08:25:00.000Z",
    };

    const result = await handleCollectedEvent(payload);

    expect(result).toEqual({ ignored: true });

    const user = await db.user.findUnique({
      where: {
        shopifyCustomerID: "missing-variant-user",
      },
    });

    expect(user).toBeTruthy();
    expect(user.id).toBe("missing-variant-user");

    const allocation = await db.allocation.findFirst({
      where: {
        userId: "missing-variant-user",
        experimentId: 9995,
      },
    });

    expect(allocation).toBeNull();
  });
});