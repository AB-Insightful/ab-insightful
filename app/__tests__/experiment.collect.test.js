import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db.server", () => ({
  default: {
    experiment: {
      findUnique: vi.fn(),
    },
    user: {
      upsert: vi.fn(),
    },
    variant: {
      findFirst: vi.fn(),
    },
    allocation: {
      upsert: vi.fn(),
    },
    goal: {
      findFirst: vi.fn(),
    },
    conversion: {
      upsert: vi.fn(),
    },
    analysis: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import db from "../db.server";
import { handleCollectedEvent } from "../services/experiment.server";
import { ExperimentStatus } from "@prisma/client";

describe("handleCollectedEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a user and allocation for experiment_include", async () => {
    const payload = {
      event_type: "experiment_include",
      client_id: "test123",
      experiment_id: 2001,
      experimentId: 2001,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T08:20:00.000Z",
    };

    db.experiment.findUnique.mockResolvedValue({
      id: 2001,
      status: ExperimentStatus.active,
      startDate: null,
      endDate: null,
    });

    db.user.upsert.mockResolvedValue({
      id: "test123",
      shopifyCustomerID: "test123",
    });

    db.variant.findFirst.mockResolvedValue({
      id: 3001,
      name: "Control",
    });

    db.allocation.upsert.mockResolvedValue({
      id: 1,
      userId: "test123",
      experimentId: 2001,
      variantId: 3001,
      deviceType: "mobile",
    });

    const result = await handleCollectedEvent(payload);

    expect(db.user.upsert).toHaveBeenCalledWith({
      where: {
        shopifyCustomerID: "test123",
      },
      update: {
        latestSession: "2026-03-04T08:20:00.000Z",
      },
      create: {
        id: "test123",
        shopifyCustomerID: "test123",
      },
    });

    expect(db.variant.findFirst).toHaveBeenCalledWith({
      where: {
        experimentId: 2001,
        name: "Control",
      },
      select: {
        id: true,
        name: true,
      },
    });

    expect(db.allocation.upsert).toHaveBeenCalledWith({
      where: {
        userId_experimentId: {
          userId: "test123",
          experimentId: 2001,
        },
      },
      create: {
        userId: "test123",
        experimentId: 2001,
        variantId: 3001,
        deviceType: "mobile",
      },
      update: {
        variantId: 3001,
        deviceType: "mobile",
      },
    });

    expect(result).toEqual({
      result: {
        result: {
          id: 1,
          userId: "test123",
          experimentId: 2001,
          variantId: 3001,
          deviceType: "mobile",
        },
      },
    });
  });

  it("returns ignored when experiment is inactive", async () => {
    const payload = {
      event_type: "experiment_include",
      client_id: "test123",
      experimentId: 2001,
      experiment_id: 2001,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T08:20:00.000Z",
    };

    db.experiment.findUnique.mockResolvedValue({
      id: 2001,
      status: ExperimentStatus.paused,
      startDate: null,
      endDate: null,
    });

    const result = await handleCollectedEvent(payload);

    expect(result).toEqual({ ignored: true });
    expect(db.user.upsert).not.toHaveBeenCalled();
    expect(db.allocation.upsert).not.toHaveBeenCalled();
  });

  it("returns ignored when variant is not found", async () => {
    const payload = {
      event_type: "experiment_include",
      client_id: "test123",
      experimentId: 2001,
      experiment_id: 2001,
      variant: "Control",
      device_type: "mobile",
      timestamp: "2026-03-04T08:20:00.000Z",
    };

    db.experiment.findUnique.mockResolvedValue({
      id: 2001,
      status: ExperimentStatus.active,
      startDate: null,
      endDate: null,
    });

    db.user.upsert.mockResolvedValue({
      id: "test123",
      shopifyCustomerID: "test123",
    });

    db.variant.findFirst.mockResolvedValue(null);

    const result = await handleCollectedEvent(payload);

    expect(result).toEqual({ ignored: true });
    expect(db.allocation.upsert).not.toHaveBeenCalled();
  });
});