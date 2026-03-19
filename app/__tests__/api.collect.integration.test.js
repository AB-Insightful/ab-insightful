// @vitest-environment node

import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import db from "../db.server";
import { action } from "../routes/api.collect.jsx";
import { handleCollectedEvent } from "../services/experiment.server";

describe("api.collect route integration", () => {
  beforeEach(async () => {
    await db.allocation.deleteMany();
    await db.conversion.deleteMany();
    await db.user.deleteMany();

    await db.variant.deleteMany({
      where: {
        experimentId: 8882,
      },
    });

    await db.experiment.deleteMany({
      where: {
        id: 8882,
      },
    });

    await db.project.deleteMany({
      where: {
        id: 8881,
      },
    });

    await db.project.create({
      data: {
        id: 8881,
        shop: "route-integration-test-shop.myshopify.com",
        name: "Route Integration Test Project",
      },
    });

    await db.experiment.create({
      data: {
        id: 8882,
        name: "Route Integration Test Experiment",
        description: "Testing api.collect action",
        status: "active",
        trafficSplit: new Prisma.Decimal(1),
        sectionId: "section-route",
        projectId: 8881,
        variants: {
          create: [
            {
              id: 8883,
              name: "Control",
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

  it("accepts POST and triggers experiment_include pipeline", async () => {
    const payload = {
      event_type: "experiment_include",
      client_id: "route-test-user",
      experiment_id: 8882,
      experimentId: 8882,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T09:00:00.000Z",
    };

    const request = new Request("http://localhost/api/collect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const response = await action({ request });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toBeNull();

    // API uses fire-and-forget; run handleCollectedEvent directly to verify pipeline
    await handleCollectedEvent(payload);

    const user = await db.user.findUnique({
      where: { shopifyCustomerID: "route-test-user" },
    });
    expect(user).toBeTruthy();
    expect(user.id).toBe("route-test-user");

    const allocation = await db.allocation.findUnique({
      where: {
        userId_experimentId: {
          userId: "route-test-user",
          experimentId: 8882,
        },
      },
    });
    expect(allocation).toBeTruthy();
    expect(allocation.variantId).toBe(8883);
    expect(allocation.deviceType).toBe("mobile");
  });

  it("handles OPTIONS preflight", async () => {
    const request = new Request("http://localhost/api/collect", {
      method: "OPTIONS",
    });

    const response = await action({ request });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});