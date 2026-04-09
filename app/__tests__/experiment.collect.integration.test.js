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
          in: [9992, 9995, 9997],
        },
      },
    });

    await db.experiment.deleteMany({
      where: {
        id: {
          in: [9992, 9995, 9997],
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

    // max-users experiment: maxUsers=2, has Control + Variant A
    await db.experiment.create({
      data: {
        id: 9997,
        name: "Max Users Test Experiment",
        description: "Testing max users enforcement",
        status: "active",
        trafficSplit: new Prisma.Decimal(0.5),
        sectionId: "section-max",
        projectId: 9991,
        maxUsers: 2,
        variants: {
          create: [
            {
              id: 9998,
              name: "Control",
              trafficAllocation: new Prisma.Decimal(0.5),
            },
            {
              id: 9999,
              name: "Variant A",
              trafficAllocation: new Prisma.Decimal(0.5),
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

  it("does not create new allocation when experiment is at max users", async () => {
    // Allocate 2 users (maxUsers=2 for experiment 9997)
    await handleCollectedEvent({
      event_type: "experiment_include",
      client_id: "max-user-1",
      experiment_id: 9997,
      experimentId: 9997,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T08:30:00.000Z",
    });
    await handleCollectedEvent({
      event_type: "experiment_include",
      client_id: "max-user-2",
      experiment_id: 9997,
      experimentId: 9997,
      variant: "Variant A",
      device_type: "desktop",
      timestamp: "2026-03-04T08:31:00.000Z",
    });

    const countBefore = await db.allocation.count({
      where: { experimentId: 9997 },
    });
    expect(countBefore).toBe(2);

    // 3rd user should hit limit
    const result = await handleCollectedEvent({
      event_type: "experiment_include",
      client_id: "max-user-3",
      experiment_id: 9997,
      experimentId: 9997,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T08:32:00.000Z",
    });

    expect(result?.result?.limitReached).toBe(true);

    const countAfter = await db.allocation.count({
      where: { experimentId: 9997 },
    });
    expect(countAfter).toBe(2);

    const allocation3 = await db.allocation.findFirst({
      where: {
        userId: "max-user-3",
        experimentId: 9997,
      },
    });
    expect(allocation3).toBeNull();
  });

  it("allows existing users to update (e.g. variant change) when at max", async () => {
    // Allocate 2 users (maxUsers=2)
    await handleCollectedEvent({
      event_type: "experiment_include",
      client_id: "existing-update-1",
      experiment_id: 9997,
      experimentId: 9997,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T08:40:00.000Z",
    });
    await handleCollectedEvent({
      event_type: "experiment_include",
      client_id: "existing-update-2",
      experiment_id: 9997,
      experimentId: 9997,
      variant: "Variant A",
      device_type: "desktop",
      timestamp: "2026-03-04T08:41:00.000Z",
    });

    // Existing user 1 sends another event with different variant - should update
    const result = await handleCollectedEvent({
      event_type: "experiment_include",
      client_id: "existing-update-1",
      experiment_id: 9997,
      experimentId: 9997,
      variant: "Variant A",
      device_type: "desktop",
      timestamp: "2026-03-04T08:42:00.000Z",
    });

    expect(result?.result?.limitReached).toBeUndefined();
    expect(result?.result?.result).toBeTruthy();

    const allocation = await db.allocation.findUnique({
      where: {
        userId_experimentId: {
          userId: "existing-update-1",
          experimentId: 9997,
        },
      },
    });
    expect(allocation).toBeTruthy();
    expect(allocation.variantId).toBe(9999);
    expect(allocation.deviceType).toBe("desktop");
  });

  it("uses experiment maxUsers override over project default", async () => {
    // Experiment 9997 has maxUsers: 2 (override). Project 9991 has default 10000.
    // First user gets allocation
    await handleCollectedEvent({
      event_type: "experiment_include",
      client_id: "override-user-1",
      experiment_id: 9997,
      experimentId: 9997,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T08:50:00.000Z",
    });
    // Second user gets allocation
    await handleCollectedEvent({
      event_type: "experiment_include",
      client_id: "override-user-2",
      experiment_id: 9997,
      experimentId: 9997,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T08:51:00.000Z",
    });

    const count = await db.allocation.count({
      where: { experimentId: 9997 },
    });
    expect(count).toBe(2);

    // Third user should be rejected (experiment maxUsers=2, not project 10000)
    const result = await handleCollectedEvent({
      event_type: "experiment_include",
      client_id: "override-user-3",
      experiment_id: 9997,
      experimentId: 9997,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T08:52:00.000Z",
    });

    expect(result?.result?.limitReached).toBe(true);
  });
});