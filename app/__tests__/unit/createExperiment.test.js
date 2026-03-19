import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.server", () => ({
  default: {
    experiment: {
      create: vi.fn(),
    },
  },
}));

import db from "../../db.server";
import { createExperiment } from "../../services/experiment.server";

describe("createExperiment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.experiment.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 1, ...data }),
    );
  });

  it("creates Control + Variant A with correct traffic split for a single variant", async () => {
    await createExperiment(
      { name: "Test", description: "desc" },
      {
        controlSectionId: "ctrl-section",
        variants: [{ sectionId: "var-a-section", trafficAllocation: 0.5 }],
      },
    );

    const call = db.experiment.create.mock.calls[0][0];
    const variants = call.data.variants.create;

    expect(variants).toHaveLength(2);
    expect(variants[0]).toMatchObject({
      name: "Control",
      configData: { sectionId: "ctrl-section" },
      trafficAllocation: 0.5,
    });
    expect(variants[1]).toMatchObject({
      name: "Variant A",
      configData: { sectionId: "var-a-section" },
      trafficAllocation: 0.5,
    });
  });

  it("creates Control + Variant A + Variant B for two treatment variants", async () => {
    await createExperiment(
      { name: "ABC" },
      {
        controlSectionId: "ctrl",
        variants: [
          { sectionId: "a-sec", trafficAllocation: 0.33 },
          { sectionId: "b-sec", trafficAllocation: 0.34 },
        ],
      },
    );

    const variants = db.experiment.create.mock.calls[0][0].data.variants.create;

    expect(variants).toHaveLength(3);
    expect(variants[0].name).toBe("Control");
    expect(variants[1].name).toBe("Variant A");
    expect(variants[2].name).toBe("Variant B");
    expect(variants[0].trafficAllocation).toBeCloseTo(0.33, 2);
    expect(variants[1].trafficAllocation).toBe(0.33);
    expect(variants[2].trafficAllocation).toBe(0.34);
  });

  it("throws when treatment allocations exceed 1.0", async () => {
    await expect(
      createExperiment(
        { name: "Over" },
        {
          variants: [
            { sectionId: "a", trafficAllocation: 0.6 },
            { sectionId: "b", trafficAllocation: 0.5 },
          ],
        },
      ),
    ).rejects.toThrow(/exceed 1\.0/i);

    expect(db.experiment.create).not.toHaveBeenCalled();
  });

  it("sets controlSectionId to null when omitted", async () => {
    await createExperiment(
      { name: "No ctrl section" },
      { variants: [{ sectionId: "a", trafficAllocation: 0.5 }] },
    );

    const variants = db.experiment.create.mock.calls[0][0].data.variants.create;
    expect(variants[0].configData).toBeNull();
  });

  it("handles a single variant with 100% traffic (control gets 0)", async () => {
    await createExperiment(
      { name: "Full traffic" },
      { variants: [{ sectionId: "a", trafficAllocation: 1.0 }] },
    );

    const variants = db.experiment.create.mock.calls[0][0].data.variants.create;
    expect(variants[0].trafficAllocation).toBe(0);
    expect(variants[1].trafficAllocation).toBe(1.0);
  });

  it("auto-labels variants A through C for three treatments", async () => {
    await createExperiment(
      { name: "Multi" },
      {
        variants: [
          { sectionId: "a", trafficAllocation: 0.25 },
          { sectionId: "b", trafficAllocation: 0.25 },
          { sectionId: "c", trafficAllocation: 0.25 },
        ],
      },
    );

    const variants = db.experiment.create.mock.calls[0][0].data.variants.create;
    expect(variants.map((v) => v.name)).toEqual([
      "Control",
      "Variant A",
      "Variant B",
      "Variant C",
    ]);
  });

  it("defaults to no variants when options are omitted", async () => {
    await createExperiment({ name: "Bare" });

    const variants = db.experiment.create.mock.calls[0][0].data.variants.create;
    expect(variants).toHaveLength(1);
    expect(variants[0].name).toBe("Control");
    expect(variants[0].trafficAllocation).toBe(1.0);
  });

  it("spreads experimentData into the create call", async () => {
    await createExperiment(
      { name: "E", description: "D", endCondition: "manual" },
      { variants: [{ sectionId: "a", trafficAllocation: 0.5 }] },
    );

    const data = db.experiment.create.mock.calls[0][0].data;
    expect(data.name).toBe("E");
    expect(data.description).toBe("D");
    expect(data.endCondition).toBe("manual");
  });
});
