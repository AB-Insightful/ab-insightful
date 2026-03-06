import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.server", () => ({
  default: {
    experiment: {
      findMany: vi.fn(),
    },
  },
}));

import db from "../db.server";
import { GetFrontendExperimentsData } from "../services/experiment.server";

describe("GetFrontendExperimentsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no active experiments exist", async () => {
    db.experiment.findMany.mockResolvedValue([]);
    const result = await GetFrontendExperimentsData();
    expect(result).toEqual([]);
  });

  it("maps experiment data with variant-level fields for the storefront", async () => {
    db.experiment.findMany.mockResolvedValue([
      {
        id: 1,
        variants: [
          { id: 10, name: "Control", configData: { sectionId: "sec-ctrl" }, trafficAllocation: "0.5" },
          { id: 11, name: "Variant A", configData: { sectionId: "sec-a" }, trafficAllocation: "0.5" },
        ],
      },
    ]);

    const result = await GetFrontendExperimentsData();

    expect(result).toEqual([
      {
        id: 1,
        variants: [
          { id: 10, name: "Control", sectionId: "sec-ctrl", trafficAllocation: 0.5, isControl: true },
          { id: 11, name: "Variant A", sectionId: "sec-a", trafficAllocation: 0.5, isControl: false },
        ],
      },
    ]);
  });

  it("sets sectionId to null when configData is missing", async () => {
    db.experiment.findMany.mockResolvedValue([
      {
        id: 2,
        variants: [
          { id: 20, name: "Control", configData: null, trafficAllocation: "1.0" },
        ],
      },
    ]);

    const result = await GetFrontendExperimentsData();
    expect(result[0].variants[0].sectionId).toBeNull();
  });

  it("converts trafficAllocation strings to numbers", async () => {
    db.experiment.findMany.mockResolvedValue([
      {
        id: 3,
        variants: [
          { id: 30, name: "Control", configData: null, trafficAllocation: "0.33" },
          { id: 31, name: "Variant A", configData: null, trafficAllocation: "0.67" },
        ],
      },
    ]);

    const result = await GetFrontendExperimentsData();
    expect(typeof result[0].variants[0].trafficAllocation).toBe("number");
    expect(result[0].variants[0].trafficAllocation).toBeCloseTo(0.33);
    expect(result[0].variants[1].trafficAllocation).toBeCloseTo(0.67);
  });

  it("only queries active experiments (verified via findMany args)", async () => {
    db.experiment.findMany.mockResolvedValue([]);
    await GetFrontendExperimentsData();

    const call = db.experiment.findMany.mock.calls[0][0];
    expect(call.where.status).toBe("active");
  });

  it("handles multiple experiments with multiple variants", async () => {
    db.experiment.findMany.mockResolvedValue([
      {
        id: 1,
        variants: [
          { id: 10, name: "Control", configData: { sectionId: "c1" }, trafficAllocation: "0.5" },
          { id: 11, name: "Variant A", configData: { sectionId: "a1" }, trafficAllocation: "0.5" },
        ],
      },
      {
        id: 2,
        variants: [
          { id: 20, name: "Control", configData: { sectionId: "c2" }, trafficAllocation: "0.34" },
          { id: 21, name: "Variant A", configData: { sectionId: "a2" }, trafficAllocation: "0.33" },
          { id: 22, name: "Variant B", configData: { sectionId: "b2" }, trafficAllocation: "0.33" },
        ],
      },
    ]);

    const result = await GetFrontendExperimentsData();

    expect(result).toHaveLength(2);
    expect(result[0].variants).toHaveLength(2);
    expect(result[1].variants).toHaveLength(3);
    expect(result[1].variants[2].name).toBe("Variant B");
    expect(result[1].variants[2].isControl).toBe(false);
  });
});
