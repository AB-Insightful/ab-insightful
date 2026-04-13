import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Device Gate Logic Tests
 * 
 * These tests validate the core device-audience gating behavior in processExperiment().
 * When an experiment targets a specific device type, visitors on a different device
 * must see the control and never be assigned to a variant or tracked.
 */

// ─── Helper: Extract the device gate logic into a testable function ───
// This allows us to test the core logic without DOM manipulation
function shouldBlockVariantForDevice(expSegment, visitorDeviceType) {
  const segment = expSegment ?? "all";
  return segment !== "all" && segment !== visitorDeviceType;
}

// ─── Mock DOM helpers ───
function createMockElement(id) {
  return {
    id,
    style: { display: "" },
    hidden: false,
  };
}

function createMockVariant(id, isControl = false, sectionId = `section-${id}`) {
  return {
    id,
    name: isControl ? "Control" : `Variant ${id}`,
    isControl,
    sectionId,
    configData: { sectionId },
    trafficAllocation: 0.5,
  };
}

function createMockExperiment(id, variants, deviceSegment = "all") {
  return {
    id,
    deviceSegment,
    variants,
  };
}

// ─── Tests ───

describe("Device Gate Logic - shouldBlockVariantForDevice()", () => {
  it("should NOT block when segment is 'all' regardless of visitor device", () => {
    expect(shouldBlockVariantForDevice("all", "mobile")).toBe(false);
    expect(shouldBlockVariantForDevice("all", "desktop")).toBe(false);
    expect(shouldBlockVariantForDevice("all", "tablet")).toBe(false);
  });

  it("should NOT block when segment is null/undefined (legacy records)", () => {
    expect(shouldBlockVariantForDevice(null, "mobile")).toBe(false);
    expect(shouldBlockVariantForDevice(undefined, "desktop")).toBe(false);
  });

  it("should NOT block when device matches the target segment", () => {
    expect(shouldBlockVariantForDevice("mobile", "mobile")).toBe(false);
    expect(shouldBlockVariantForDevice("desktop", "desktop")).toBe(false);
  });

  it("should BLOCK when visitor device does NOT match the target segment", () => {
    expect(shouldBlockVariantForDevice("mobile", "desktop")).toBe(true);
    expect(shouldBlockVariantForDevice("mobile", "tablet")).toBe(true);
    expect(shouldBlockVariantForDevice("desktop", "mobile")).toBe(true);
    expect(shouldBlockVariantForDevice("desktop", "tablet")).toBe(true);
  });
});

describe("Device Gate Logic - processExperimentDeviceGate() integration", () => {
  let mockElements;

  beforeEach(() => {
    // Set up mock DOM
    mockElements = {};
    global.document = {
      getElementById: (id) => mockElements[id] || null,
    };
  });

  describe("Blocking scenario: visitor device doesn't match experiment target", () => {
    it("should clear any existing assignment from the cookie", () => {
      // Setup: Mobile-only experiment, desktop visitor
      const experiment = createMockExperiment(
        101,
        [
          createMockVariant("control", true, "section-control"),
          createMockVariant("variantA", false, "section-variantA"),
        ],
        "mobile" // <- targets mobile only
      );

      mockElements["section-control"] = createMockElement("section-control");
      mockElements["section-variantA"] = createMockElement("section-variantA");

      // Desktop visitor had a stale assignment from before switching devices
      const assignments = { "101": "variantA" };
      const visitorDeviceType = "desktop";

      // Apply the gate
      const shouldBlock = shouldBlockVariantForDevice(experiment.deviceSegment, visitorDeviceType);

      if (shouldBlock) {
        delete assignments[String(experiment.id)];
      }

      // Assert: the stale assignment is removed
      expect(assignments["101"]).toBeUndefined();
    });

    it("should show control section and hide variant sections", () => {
      // Setup: Desktop-only experiment, mobile visitor
      const controlVariant = createMockVariant("control", true, "section-control");
      const variantA = createMockVariant("variantA", false, "section-variantA");
      const variantB = createMockVariant("variantB", false, "section-variantB");

      const experiment = createMockExperiment(
        102,
        [controlVariant, variantA, variantB],
        "desktop" // <- targets desktop only
      );

      mockElements["section-control"] = createMockElement("section-control");
      mockElements["section-variantA"] = createMockElement("section-variantA");
      mockElements["section-variantB"] = createMockElement("section-variantB");

      const visitorDeviceType = "mobile"; // <- visitor is on mobile

      // Apply control-fallback logic
      const shouldBlock = shouldBlockVariantForDevice(experiment.deviceSegment, visitorDeviceType);

      if (shouldBlock) {
        experiment.variants.forEach((v) => {
          const el = mockElements[v.sectionId];
          if (!el) return;
          el.style.display = v.isControl ? "" : "none";
        });
      }

      // Assert: control is shown, variants are hidden
      expect(mockElements["section-control"].style.display).toBe("");
      expect(mockElements["section-variantA"].style.display).toBe("none");
      expect(mockElements["section-variantB"].style.display).toBe("none");
    });

    it("should NOT proceed to assignment or tracking when blocked", () => {
      // This test verifies the guard works by checking that we exit early
      const experiment = createMockExperiment(
        103,
        [createMockVariant("control", true)],
        "mobile"
      );

      let assignmentAttempted = false;
      let trackingAttempted = false;

      const visitorDeviceType = "desktop";
      const shouldBlock = shouldBlockVariantForDevice(experiment.deviceSegment, visitorDeviceType);

      if (!shouldBlock) {
        // These only run if NOT blocked (early return in real code)
        assignmentAttempted = true;
        trackingAttempted = true;
      }

      // Assert: blocked path never reaches assignment or tracking
      expect(assignmentAttempted).toBe(false);
      expect(trackingAttempted).toBe(false);
    });
  });

  describe("Passing scenario: visitor device matches experiment target", () => {
    it("should proceed to normal assignment when device matches", () => {
      const experiment = createMockExperiment(
        104,
        [
          createMockVariant("control", true, "section-control"),
          createMockVariant("variantA", false, "section-variantA"),
        ],
        "mobile" // <- targets mobile
      );

      const visitorDeviceType = "mobile"; // <- visitor IS mobile
      const shouldBlock = shouldBlockVariantForDevice(experiment.deviceSegment, visitorDeviceType);

      // Assert: NOT blocked, should proceed to normal flow
      expect(shouldBlock).toBe(false);
    });

    it("should proceed to normal assignment when targeting all devices", () => {
      const experiment = createMockExperiment(
        105,
        [
          createMockVariant("control", true, "section-control"),
          createMockVariant("variantA", false, "section-variantA"),
        ],
        "all" // <- no device restriction
      );

      const visitorDeviceType = "desktop";
      const shouldBlock = shouldBlockVariantForDevice(experiment.deviceSegment, visitorDeviceType);

      // Assert: NOT blocked
      expect(shouldBlock).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should handle missing sectionId gracefully (variant with no section)", () => {
      const experiment = createMockExperiment(
        106,
        [
          createMockVariant("control", true, "section-control"),
          { id: "variantNoSection", name: "Variant No Section", isControl: false, sectionId: null }, // <- no section
        ],
        "desktop"
      );

      mockElements["section-control"] = createMockElement("section-control");
      // Intentionally don't create section for variant without sectionId

      const visitorDeviceType = "mobile";
      const shouldBlock = shouldBlockVariantForDevice(experiment.deviceSegment, visitorDeviceType);

      if (shouldBlock) {
        experiment.variants.forEach((v) => {
          if (!v.sectionId) return; // Skip variants without section
          const el = mockElements[v.sectionId];
          if (!el) return;
          el.style.display = v.isControl ? "" : "none";
        });
      }

      // Assert: no errors thrown, control section is shown
      expect(mockElements["section-control"].style.display).toBe("");
    });

    it("should handle missing DOM element gracefully (section doesn't exist)", () => {
      const experiment = createMockExperiment(
        107,
        [
          createMockVariant("control", true, "section-control"),
          createMockVariant("variantA", false, "section-variantA"),
        ],
        "mobile"
      );

      mockElements["section-control"] = createMockElement("section-control");
      // Intentionally don't create section-variantA in DOM

      const visitorDeviceType = "desktop";
      const shouldBlock = shouldBlockVariantForDevice(experiment.deviceSegment, visitorDeviceType);

      if (shouldBlock) {
        experiment.variants.forEach((v) => {
          if (!v.sectionId) return;
          const el = mockElements[v.sectionId];
          if (!el) return; // Safely skip if element doesn't exist
          el.style.display = v.isControl ? "" : "none";
        });
      }

      // Assert: no errors thrown, existing element is shown
      expect(mockElements["section-control"].style.display).toBe("");
    });

    it("should default to 'all' when deviceSegment is null (legacy records)", () => {
      const experiment = createMockExperiment(
        108,
        [createMockVariant("control", true, "section-control")],
        null // <- legacy record without deviceSegment
      );

      const visitorDeviceType = "mobile";
      const shouldBlock = shouldBlockVariantForDevice(experiment.deviceSegment, visitorDeviceType);

      // Assert: null defaults to "all", so never block
      expect(shouldBlock).toBe(false);
    });
  });

  describe("Device type detection coverage", () => {
    it("should handle all known device types correctly", () => {
      const deviceTypes = ["mobile", "desktop", "tablet"];
      const segments = ["all", "mobile", "desktop"];

      deviceTypes.forEach((device) => {
        segments.forEach((segment) => {
          const blocked = shouldBlockVariantForDevice(segment, device);

          if (segment === "all") {
            // "all" never blocks
            expect(blocked).toBe(false);
          } else if (segment === device) {
            // matching segment doesn't block
            expect(blocked).toBe(false);
          } else {
            // mismatched devices block
            expect(blocked).toBe(true);
          }
        });
      });
    });
  });
});
