import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The embed script runs in a browser context and isn't exported as modules.
 * We extract the pure logic functions and test them in isolation.
 */

// --- weightedRandomSelect (copied from embed) ---
function weightedRandomSelect(variants) {
  const rand = Math.random();
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.trafficAllocation;
    if (rand < cumulative) return v;
  }
  return variants[variants.length - 1];
}

// --- migrateOldCookies (copied from embed) ---
function migrateOldCookies(assignments, experiments, getCookieFn) {
  const oldControl = getCookieFn("ab-control-ids");
  const oldVariant = getCookieFn("ab-variant-ids");
  if (!oldControl && !oldVariant) return assignments;

  const expMap = {};
  experiments.forEach((exp) => {
    expMap[String(exp.id)] = exp.variants;
  });

  if (oldControl) {
    oldControl.split(",").forEach((raw) => {
      const id = raw.trim();
      if (!id || assignments[id] != null) return;
      const variants = expMap[id];
      if (!variants) return;
      const control = variants.find((v) => v.isControl);
      if (control) assignments[id] = control.id;
    });
  }

  if (oldVariant) {
    oldVariant.split(",").forEach((raw) => {
      const id = raw.trim();
      if (!id || assignments[id] != null) return;
      const variants = expMap[id];
      if (!variants) return;
      const treatment = variants.find((v) => !v.isControl);
      if (treatment) assignments[id] = treatment.id;
    });
  }

  return assignments;
}

describe("weightedRandomSelect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects the first variant when random is below its allocation", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const variants = [
      { id: 1, name: "Control", trafficAllocation: 0.5 },
      { id: 2, name: "Variant A", trafficAllocation: 0.5 },
    ];
    expect(weightedRandomSelect(variants)).toEqual(variants[0]);
  });

  it("selects the second variant when random exceeds first allocation", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    const variants = [
      { id: 1, name: "Control", trafficAllocation: 0.5 },
      { id: 2, name: "Variant A", trafficAllocation: 0.5 },
    ];
    expect(weightedRandomSelect(variants)).toEqual(variants[1]);
  });

  it("selects the last variant when random is very close to 1.0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const variants = [
      { id: 1, name: "Control", trafficAllocation: 0.33 },
      { id: 2, name: "Variant A", trafficAllocation: 0.33 },
      { id: 3, name: "Variant B", trafficAllocation: 0.34 },
    ];
    expect(weightedRandomSelect(variants)).toEqual(variants[2]);
  });

  it("selects from three variants correctly based on allocation boundaries", () => {
    const variants = [
      { id: 1, name: "Control", trafficAllocation: 0.25 },
      { id: 2, name: "Variant A", trafficAllocation: 0.25 },
      { id: 3, name: "Variant B", trafficAllocation: 0.5 },
    ];

    vi.spyOn(Math, "random").mockReturnValue(0.24);
    expect(weightedRandomSelect(variants).name).toBe("Control");

    vi.spyOn(Math, "random").mockReturnValue(0.26);
    expect(weightedRandomSelect(variants).name).toBe("Variant A");

    vi.spyOn(Math, "random").mockReturnValue(0.51);
    expect(weightedRandomSelect(variants).name).toBe("Variant B");
  });

  it("returns the sole variant when there's only one", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const variants = [{ id: 1, name: "Control", trafficAllocation: 1.0 }];
    expect(weightedRandomSelect(variants)).toEqual(variants[0]);
  });
});

describe("migrateOldCookies", () => {
  const experiments = [
    {
      id: 1,
      variants: [
        { id: 10, name: "Control", isControl: true },
        { id: 11, name: "Variant A", isControl: false },
      ],
    },
    {
      id: 2,
      variants: [
        { id: 20, name: "Control", isControl: true },
        { id: 21, name: "Variant A", isControl: false },
      ],
    },
  ];

  it("returns assignments unchanged when no legacy cookies exist", () => {
    const getCookie = vi.fn().mockReturnValue(null);
    const result = migrateOldCookies({}, experiments, getCookie);
    expect(result).toEqual({});
  });

  it("migrates ab-control-ids into Control variant assignments", () => {
    const getCookie = vi.fn((name) =>
      name === "ab-control-ids" ? "1,2" : null,
    );

    const result = migrateOldCookies({}, experiments, getCookie);
    expect(result["1"]).toBe(10);
    expect(result["2"]).toBe(20);
  });

  it("migrates ab-variant-ids into treatment variant assignments", () => {
    const getCookie = vi.fn((name) =>
      name === "ab-variant-ids" ? "1" : null,
    );

    const result = migrateOldCookies({}, experiments, getCookie);
    expect(result["1"]).toBe(11);
  });

  it("does not overwrite existing assignments during migration", () => {
    const getCookie = vi.fn((name) =>
      name === "ab-control-ids" ? "1" : null,
    );

    const existing = { "1": 999 };
    const result = migrateOldCookies(existing, experiments, getCookie);
    expect(result["1"]).toBe(999);
  });

  it("ignores experiment IDs not present in the current experiments list", () => {
    const getCookie = vi.fn((name) =>
      name === "ab-control-ids" ? "99" : null,
    );

    const result = migrateOldCookies({}, experiments, getCookie);
    expect(result["99"]).toBeUndefined();
  });

  it("handles both old cookies at the same time", () => {
    const getCookie = vi.fn((name) => {
      if (name === "ab-control-ids") return "1";
      if (name === "ab-variant-ids") return "2";
      return null;
    });

    const result = migrateOldCookies({}, experiments, getCookie);
    expect(result["1"]).toBe(10);
    expect(result["2"]).toBe(21);
  });
});
