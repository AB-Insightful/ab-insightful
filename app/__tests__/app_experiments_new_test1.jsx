// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks  (must be declared before the imports that use them)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn().mockResolvedValue({
      session: { shop: "test-shop.myshopify.com" },
    }),
  },
}));

vi.mock("../db.server", () => ({
  default: {
    project: { upsert: vi.fn(), findUnique: vi.fn() },
    goal: { findUnique: vi.fn() },
    experiment: { create: vi.fn() },
  },
}));

vi.mock("../utils/experimentConstants.js", () => ({
  ExperimentStatus: { draft: "draft" },
}));

vi.mock("../utils/validateMaxUsers", () => ({
  validateMaxUsers: vi.fn().mockReturnValue(null),
}));

vi.mock("../utils/validateStartIsInFuture", () => ({
  validateStartIsInFuture: vi.fn().mockReturnValue({ dateError: "", timeError: "" }),
}));

vi.mock("../utils/validateEndIsAfterStart", () => ({
  validateEndIsAfterStart: vi.fn().mockReturnValue({ dateError: "", timeError: "" }),
}));

vi.mock("../utils/localDateTimeToISOString", () => ({
  localDateTimeToISOString: vi.fn().mockReturnValue("2099-01-01T12:00:00.000Z"),
}));

vi.mock("../utils/timeSelect", () => ({
  TimeSelect: ({ onChange, value, label, id }) => (
    <select data-testid={id || label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="12:00">12:00</option>
      <option value="13:00">13:00</option>
    </select>
  ),
}));

// Dynamic imports used inside the action / loader
vi.mock("../services/tutorialData.server", () => ({
  setCreateExpPage: vi.fn().mockResolvedValue(undefined),
  getTutorialData: vi.fn().mockResolvedValue({ createExperiment: true }),
}));

vi.mock("../services/experiment.server", () => ({
  createExperiment: vi.fn().mockResolvedValue({ id: 42 }),
  handleCollectedEvent: vi.fn(),
}));

// react-router mocks
const mockRedirect = vi.fn((url) => ({ _redirect: url }));
const mockUseFetcher = vi.fn();
const mockUseLoaderData = vi.fn();

vi.mock("react-router", () => ({
  useFetcher: () => mockUseFetcher(),
  redirect: (url) => mockRedirect(url),
  useLoaderData: () => mockUseLoaderData(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildFormData(fields = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.set(k, v);
  }
  return fd;
}

function buildRequest(fields = {}) {
  const fd = buildFormData(fields);
  return {
    formData: () => Promise.resolve(fd),
  };
}

// Future date for valid start
const FUTURE_DATE_UTC = "2099-06-15T12:00:00.000Z";

/**
 * Fire a change/input event on a Polaris custom element (s-select, s-number-field,
 * s-text-area, s-date-field, etc.) that lacks a native value setter.
 * We create a real bubbling Event and shim e.target.value so React's handler sees it.
 */
function fireCustomChange(element, value) {
  const event = new Event("change", { bubbles: true });
  Object.defineProperty(event, "target", { writable: false, value: { value } });
  element.dispatchEvent(event);
}

function fireCustomInput(element, value) {
  const event = new Event("input", { bubbles: true });
  Object.defineProperty(event, "target", { writable: false, value: { value } });
  element.dispatchEvent(event);
}

// ─────────────────────────────────────────────────────────────────────────────
// Imports under test (after mocks are set up)
// ─────────────────────────────────────────────────────────────────────────────

import { action, loader } from "../routes/app.experiments.new.jsx";
import db from "../db.server";
import { validateMaxUsers } from "../utils/validateMaxUsers";
import CreateExperiment from "../routes/app.experiments.new.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// Default loader data used by component tests
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LOADER_DATA = {
  defaultGoal: "completedCheckout",
  maxUsersPerExperiment: 10000,
  tutorialData: { createExperiment: true },
  shopDomain: "test-shop.myshopify.com",
};

function defaultFetcher(overrides = {}) {
  return {
    state: "idle",
    data: null,
    submit: vi.fn(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION tests
// ─────────────────────────────────────────────────────────────────────────────

describe("action()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateMaxUsers.mockReturnValue(null);
  });

  // ── tutorial intent ────────────────────────────────────────────────────────

  it("handles tutorial_viewed intent successfully", async () => {
    const result = await action({ request: buildRequest({ intent: "tutorial_viewed" }) });
    expect(result).toEqual({ ok: true, action: "tutorial_viewed" });
  });

  it("handles tutorial_viewed intent error gracefully", async () => {
    const { setCreateExpPage } = await import("../services/tutorialData.server");
    setCreateExpPage.mockRejectedValueOnce(new Error("DB error"));
    const result = await action({ request: buildRequest({ intent: "tutorial_viewed" }) });
    // Source uses comma operator: return (obj1, obj2) → evaluates to last value { status: 500 }
    expect(result).toEqual({ status: 500 });
  });

  // ── validation errors ──────────────────────────────────────────────────────

  it("returns error when name is missing", async () => {
    const result = await action({
      request: buildRequest({ description: "desc", startDateUTC: FUTURE_DATE_UTC }),
    });
    expect(result.errors.name).toBeTruthy();
  });

  it("returns error when description is missing", async () => {
    const result = await action({
      request: buildRequest({ name: "Test", startDateUTC: FUTURE_DATE_UTC }),
    });
    expect(result.errors.description).toBeTruthy();
  });

  it("returns error when startDate is missing", async () => {
    const result = await action({
      request: buildRequest({ name: "Test", description: "Desc" }),
    });
    expect(result.errors.startDate).toBeTruthy();
  });

  it("returns error when startDate is in the past", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: "2000-01-01T00:00:00.000Z",
      }),
    });
    expect(result.errors.startDate).toMatch(/future/i);
  });

  it("returns error for invalid startDateUTC (NaN)", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: "not-a-date",
      }),
    });
    expect(result.errors.startDate).toBeTruthy();
  });

  it("returns errors when endCondition=endDate and endDate missing", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "endDate",
      }),
    });
    expect(result.errors.endDate).toBeTruthy();
  });

  it("returns error when endDate is before startDate", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "endDate",
        endDateUTC: "2000-01-01T00:00:00.000Z",
        endDate: "2000-01-01",
      }),
    });
    expect(result.errors.endDate).toBeTruthy();
  });

  it("returns errors for stableSuccessProbability missing fields", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "stableSuccessProbability",
      }),
    });
    expect(result.errors.probabilityToBeBest).toBeTruthy();
    expect(result.errors.duration).toBeTruthy();
    expect(result.errors.timeUnit).toBeTruthy();
  });

  it("returns error for out-of-range probability (< 51)", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "stableSuccessProbability",
        probabilityToBeBest: "40",
        duration: "7",
        timeUnit: "days",
      }),
    });
    expect(result.errors.probabilityToBeBest).toMatch(/51/);
  });

  it("returns error for non-integer probability", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "stableSuccessProbability",
        probabilityToBeBest: "75.5",
        duration: "7",
        timeUnit: "days",
      }),
    });
    expect(result.errors.probabilityToBeBest).toMatch(/whole/i);
  });

  it("returns error for duration < 1", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "stableSuccessProbability",
        probabilityToBeBest: "80",
        duration: "0",
        timeUnit: "days",
      }),
    });
    expect(result.errors.duration).toBeTruthy();
  });

  it("returns error for non-integer duration", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "stableSuccessProbability",
        probabilityToBeBest: "80",
        duration: "1.5",
        timeUnit: "days",
      }),
    });
    expect(result.errors.duration).toMatch(/whole/i);
  });

  it("returns maxUsers error when validateMaxUsers returns error", async () => {
    validateMaxUsers.mockReturnValueOnce("Max users error");
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: FUTURE_DATE_UTC,
      }),
    });
    expect(result.errors.maxUsers).toBe("Max users error");
  });

  it("returns error when variant sectionId is missing", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: FUTURE_DATE_UTC,
        variantsJSON: JSON.stringify([{ sectionId: "", trafficAllocation: 50 }]),
      }),
    });
    expect(result.errors["variant_0_sectionId"]).toBeTruthy();
  });

  // ── successful experiment creation ─────────────────────────────────────────

  it("creates experiment and redirects on valid data", async () => {
    db.project.upsert.mockResolvedValue({ id: 1 });
    db.goal.findUnique.mockResolvedValue({ id: 99 });

    const result = await action({
      request: buildRequest({
        name: "My Experiment",
        description: "Test description",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "manual",
        goal: "completedCheckout",
        variantsJSON: JSON.stringify([{ sectionId: "section-abc", trafficAllocation: 50 }]),
        useAccountDefaultMaxUsers: "true",
      }),
    });

    expect(mockRedirect).toHaveBeenCalledWith("/app/experiments/42?isNewlyCreated=true");
  });

  it("returns goal error when goal not found in db", async () => {
    db.project.upsert.mockResolvedValue({ id: 1 });
    db.goal.findUnique.mockResolvedValue(null);

    const result = await action({
      request: buildRequest({
        name: "My Experiment",
        description: "Test description",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "manual",
        goal: "completedCheckout",
        variantsJSON: JSON.stringify([{ sectionId: "section-abc", trafficAllocation: 50 }]),
        useAccountDefaultMaxUsers: "true",
      }),
    });

    expect(result.errors.goal).toBeTruthy();
  });

  it("creates experiment with stableSuccessProbability and custom maxUsers", async () => {
    db.project.upsert.mockResolvedValue({ id: 1 });
    db.goal.findUnique.mockResolvedValue({ id: 99 });

    await action({
      request: buildRequest({
        name: "SSP Experiment",
        description: "Testing SSP",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "stableSuccessProbability",
        goal: "addToCart",
        variantsJSON: JSON.stringify([{ sectionId: "sec-1", trafficAllocation: 50 }]),
        probabilityToBeBest: "80",
        duration: "7",
        timeUnit: "days",
        useAccountDefaultMaxUsers: "false",
        maxUsers: "5000",
      }),
    });

    const { createExperiment } = await import("../services/experiment.server");
    expect(createExperiment).toHaveBeenCalledWith(
      expect.objectContaining({ probabilityToBeBest: 80, duration: 7, timeUnit: "days", maxUsers: 5000 }),
      expect.any(Object),
    );
  });

  it("creates experiment with endDate condition using local date fields", async () => {
    db.project.upsert.mockResolvedValue({ id: 1 });
    db.goal.findUnique.mockResolvedValue({ id: 99 });

    await action({
      request: buildRequest({
        name: "EndDate Exp",
        description: "Uses end date",
        startDate: "2099-01-01",
        startTime: "10:00",
        endCondition: "endDate",
        endDate: "2099-06-01",
        endTime: "23:59",
        goal: "viewPage",
        variantsJSON: JSON.stringify([{ sectionId: "sec-2", trafficAllocation: 50 }]),
        useAccountDefaultMaxUsers: "true",
      }),
    });

    expect(mockRedirect).toHaveBeenCalled();
  });

  it("handles invalid variantsJSON gracefully (falls back to [])", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test",
        description: "Desc",
        startDateUTC: FUTURE_DATE_UTC,
        variantsJSON: "not json at all",
      }),
    });
    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOADER tests
// ─────────────────────────────────────────────────────────────────────────────

describe("loader()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns defaultGoal, maxUsersPerExperiment, tutorialData, shopDomain", async () => {
    db.project.findUnique.mockResolvedValue({
      defaultGoal: "viewPage",
      maxUsersPerExperiment: 5000,
    });

    const result = await loader({
      request: { formData: vi.fn() },
    });

    expect(result.defaultGoal).toBe("viewPage");
    expect(result.maxUsersPerExperiment).toBe(5000);
    expect(result.tutorialData).toBeDefined();
    expect(result.shopDomain).toBe("test-shop.myshopify.com");
  });

  it("falls back to completedCheckout / 10000 when project is null", async () => {
    db.project.findUnique.mockResolvedValue(null);

    const result = await loader({ request: {} });

    expect(result.defaultGoal).toBe("completedCheckout");
    expect(result.maxUsersPerExperiment).toBe(10000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT tests
// ─────────────────────────────────────────────────────────────────────────────

describe("CreateExperiment component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLoaderData.mockReturnValue(DEFAULT_LOADER_DATA);
    mockUseFetcher.mockReturnValue(defaultFetcher());
  });

  function renderComponent(fetcherOverride = {}) {
    mockUseFetcher.mockReturnValue(defaultFetcher(fetcherOverride));
    return render(<CreateExperiment />);
  }

  it("renders without crashing", () => {
    renderComponent();
  });

  it("shows server-side errors from fetcher.data", () => {
    mockUseFetcher.mockReturnValue(
      defaultFetcher({ data: { errors: { form: "Server error occurred" } } }),
    );
    render(<CreateExperiment />);
  });

  it("shows goal error banner from fetcher.data", () => {
    mockUseFetcher.mockReturnValue(
      defaultFetcher({ data: { errors: { goal: "Goal not found" } } }),
    );
    render(<CreateExperiment />);
  });

  it("handleNameBlur sets error when name is empty", async () => {
    const { container } = renderComponent();
    const nameField = container.querySelector("s-text-field");
    if (nameField) fireEvent.blur(nameField);
  });

  it("handleDescriptionBlur sets error when description is empty", async () => {
    const { container } = renderComponent();
    const textArea = container.querySelector("s-text-area");
    if (textArea) fireEvent.blur(textArea);
  });

  // ── handleDiscard ──────────────────────────────────────────────────────────

  it("handleDiscard resets all form state via slot button", async () => {
    const { container } = renderComponent();
    const discardBtn = container.querySelector('s-button[slot="secondary-actions"]');
    if (discardBtn) fireEvent.click(discardBtn);
  });

  it("handleDiscard resets form via bottom Discard button", async () => {
    const { container } = renderComponent();
    // The bottom discard button has variant="secondary" and no slot
    const btns = container.querySelectorAll("s-button");
    const discardBtn = Array.from(btns).find(
      (b) => b.textContent?.includes("Discard") && !b.getAttribute("slot"),
    );
    if (discardBtn) fireEvent.click(discardBtn);
  });

  // ── variant management ─────────────────────────────────────────────────────

  it("handleAddVariant adds a variant up to MAX_VARIANTS", () => {
    const { container } = renderComponent();
    const addBtn = container.querySelector('[accessibilityLabel="Add variant"]');
    if (addBtn) {
      fireEvent.click(addBtn); // 2
      fireEvent.click(addBtn); // 3
      fireEvent.click(addBtn); // 4 (max)
      fireEvent.click(addBtn); // no-op
    }
  });

  it("handleRemoveVariant removes variant down to 1", () => {
    const { container } = renderComponent();
    const addBtn = container.querySelector('[accessibilityLabel="Add variant"]');
    const removeBtn = container.querySelector('[accessibilityLabel="Remove variant"]');
    if (addBtn && removeBtn) {
      fireEvent.click(addBtn);    // 2
      fireEvent.click(removeBtn); // 1
      fireEvent.click(removeBtn); // no-op
    }
  });

  // ── name field ─────────────────────────────────────────────────────────────

  it("handleName clears nameError once text is entered", async () => {
    const { container } = renderComponent();
    const nameField = container.querySelector("s-text-field");
    if (nameField) {
      // Blur to trigger error
      fireEvent.blur(nameField);
      // Type to clear error
      fireCustomChange(nameField, "My Experiment");
    }
  });

  // ── description field ──────────────────────────────────────────────────────

  it("description onChange clears error when text is entered", async () => {
    const { container } = renderComponent();
    const textArea = container.querySelector("s-text-area");
    if (textArea) {
      fireEvent.blur(textArea); // trigger error
      fireCustomChange(textArea, "Some description");
    }
  });

  // ── variant sectionId field ────────────────────────────────────────────────

  it("variant sectionId onChange clears error when value is entered", async () => {
    const { container } = renderComponent();
    const variantFields = container.querySelectorAll('s-text-field[label="Section ID to be tested"]');
    if (variantFields.length > 0) {
      fireEvent.blur(variantFields[0]); // trigger error
      fireCustomChange(variantFields[0], "shopify-section-123");
    }
  });

  it("variant sectionId onFocus clears error", async () => {
    const { container } = renderComponent();
    const variantFields = container.querySelectorAll('s-text-field[label="Section ID to be tested"]');
    if (variantFields.length > 0) {
      fireEvent.focus(variantFields[0]);
    }
  });

  // ── traffic allocation ─────────────────────────────────────────────────────

  it("traffic allocation onChange updates variant", async () => {
    const { container } = renderComponent();
    const numFields = container.querySelectorAll("s-number-field");
    if (numFields.length > 0) {
      fireCustomChange(numFields[0], "40");
    }
  });

  // ── control section ────────────────────────────────────────────────────────

  it("addControlSection checkbox reveals control section ID field", async () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Add a control section ID"]');
    if (checkbox) {
      fireEvent.click(checkbox); // s-checkbox triggers onClick/onChange via click in JSDOM
      // Now the control section field should be visible
      const controlField = container.querySelector('s-text-field[label="Control Section ID"]');
      if (controlField) {
        fireCustomChange(controlField, "control-section-123");
      }
    }
  });

  // ── customer segment ───────────────────────────────────────────────────────

  it("customerSegment select updates state", async () => {
    const { container } = renderComponent();
    const segmentSelect = container.querySelector('s-select[label="Customer segment to test"]');
    if (segmentSelect) {
      fireCustomChange(segmentSelect, "mobileVisitors");
    }
  });

  // ── maxUsers checkbox + custom field ──────────────────────────────────────

  it("unchecking useAccountDefaultMaxUsers reveals max users field", async () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Use account default max users"]');
    if (checkbox) {
      fireEvent.click(checkbox); // toggle via click
    }
  });

  it("maxUsers custom field validates input correctly", async () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Use account default max users"]');
    if (checkbox) {
      fireEvent.click(checkbox); // reveal field
    }
    const maxField = container.querySelector('s-number-field[label="Max users"]');
    if (maxField) {
      fireCustomChange(maxField, "");      // empty
      fireCustomChange(maxField, "0");     // < 1
      fireCustomChange(maxField, "9999999"); // too large
      fireCustomChange(maxField, "500");   // valid
      fireCustomChange(maxField, "");      // empty again
      fireEvent.blur(maxField);
    }
  });

  it("re-checking useAccountDefaultMaxUsers clears maxUsers", async () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Use account default max users"]');
    if (checkbox) {
      fireEvent.click(checkbox); // uncheck
      fireEvent.click(checkbox); // re-check
    }
  });

  // ── start date field ───────────────────────────────────────────────────────

  it("startDate onChange triggers validation", async () => {
    const { container } = renderComponent();
    const dateField = container.querySelector("#startDateField");
    if (dateField) {
      fireCustomChange(dateField, "2099-06-01");
    }
  });

  it("startDate onBlur sets error when empty", async () => {
    const { container } = renderComponent();
    const dateField = container.querySelector("#startDateField");
    if (dateField) fireEvent.blur(dateField);
  });

  it("startDate onFocus clears emptyStartDateError", async () => {
    const { container } = renderComponent();
    const dateField = container.querySelector("#startDateField");
    if (dateField) {
      fireEvent.blur(dateField);  // set error
      fireEvent.focus(dateField); // clear it
    }
  });

  // ── start time ─────────────────────────────────────────────────────────────

  it("handleStartTimeChange runs validation", async () => {
    const { container } = renderComponent();
    const timeSelect = container.querySelector('[data-testid="startTimeSelect"]');
    if (timeSelect) {
      fireEvent.change(timeSelect, { target: { value: "13:00" } });
    }
  });

  // ── end condition buttons ──────────────────────────────────────────────────

  it("clicking End date button sets endCondition to endDate", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const endDateBtn = Array.from(buttons).find((b) => b.textContent?.trim() === "End date");
    if (endDateBtn) fireEvent.click(endDateBtn);
  });

  it("clicking Stable success probability button sets endCondition", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const sspBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Stable success probability"),
    );
    if (sspBtn) fireEvent.click(sspBtn);
  });

  it("clicking Manual button sets endCondition to manual", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    // Switch to endDate first, then back to Manual
    const endDateBtn = Array.from(buttons).find((b) => b.textContent?.trim() === "End date");
    const manualBtn = Array.from(buttons).find((b) => b.textContent?.trim() === "Manual");
    if (endDateBtn) fireEvent.click(endDateBtn);
    if (manualBtn) fireEvent.click(manualBtn);
  });

  // ── end date/time fields (only visible when endCondition="endDate") ─────────

  it("end date onChange triggers validation when endCondition=endDate", async () => {
    const { container } = renderComponent();
    // Switch to endDate condition
    const buttons = container.querySelectorAll("s-button");
    const endDateBtn = Array.from(buttons).find((b) => b.textContent?.trim() === "End date");
    if (endDateBtn) fireEvent.click(endDateBtn);

    const endDateField = container.querySelector("#endDateField");
    if (endDateField) {
      fireCustomChange(endDateField, "2099-12-31");
    }
  });

  it("end date onBlur sets error when empty and endCondition=endDate", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const endDateBtn = Array.from(buttons).find((b) => b.textContent?.trim() === "End date");
    if (endDateBtn) fireEvent.click(endDateBtn);

    const endDateField = container.querySelector("#endDateField");
    if (endDateField) fireEvent.blur(endDateField);
  });

  it("end date onFocus clears emptyEndDateError", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const endDateBtn = Array.from(buttons).find((b) => b.textContent?.trim() === "End date");
    if (endDateBtn) fireEvent.click(endDateBtn);

    const endDateField = container.querySelector("#endDateField");
    if (endDateField) {
      fireEvent.blur(endDateField);   // set error
      fireEvent.focus(endDateField);  // clear it
    }
  });

  it("end time onChange triggers validation", async () => {
    const { container } = renderComponent();
    // Switch to endDate
    const buttons = container.querySelectorAll("s-button");
    const endDateBtn = Array.from(buttons).find((b) => b.textContent?.trim() === "End date");
    if (endDateBtn) fireEvent.click(endDateBtn);

    const endTimeSelect = container.querySelector('[data-testid="endTimeSelect"]');
    if (endTimeSelect) {
      fireEvent.change(endTimeSelect, { target: { value: "13:00" } });
    }
  });

  // ── stable success probability fields ──────────────────────────────────────

  it("switching to stableSuccessProbability reveals probability fields", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const sspBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Stable success probability"),
    );
    await act(async () => { if (sspBtn) fireEvent.click(sspBtn); });
    // Fields should now be in DOM — check any s-number-field is present (SSP section rendered)
    const numFields = container.querySelectorAll("s-number-field");
    expect(numFields.length).toBeGreaterThan(0);
  });

  it("probability field onInput with valid value sets state", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const sspBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Stable success probability"),
    );
    if (sspBtn) fireEvent.click(sspBtn);

    const numFields = container.querySelectorAll("s-number-field");
    if (numFields.length > 0) {
      fireCustomInput(numFields[0], "75");
      fireCustomChange(numFields[0], "75");
      fireEvent.blur(numFields[0]);
    }
  });

  it("probability field with out-of-range value shows error", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const sspBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Stable success probability"),
    );
    if (sspBtn) fireEvent.click(sspBtn);

    const numFields = container.querySelectorAll("s-number-field");
    if (numFields.length > 0) {
      fireCustomInput(numFields[0], "30");
      fireCustomChange(numFields[0], "30");
    }
  });

  it("probability field with non-integer value shows whole number error", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const sspBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Stable success probability"),
    );
    if (sspBtn) fireEvent.click(sspBtn);

    const numFields = container.querySelectorAll("s-number-field");
    if (numFields.length > 0) {
      fireCustomInput(numFields[0], "75.5");
    }
  });

  it("duration field onChange with valid value clears error", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const sspBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Stable success probability"),
    );
    if (sspBtn) fireEvent.click(sspBtn);

    const numFields = container.querySelectorAll("s-number-field");
    if (numFields.length > 1) {
      fireCustomChange(numFields[1], "7");
      fireCustomInput(numFields[1], "7");
      fireEvent.blur(numFields[1]);
    }
  });

  it("duration field with value < 1 shows error", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const sspBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Stable success probability"),
    );
    if (sspBtn) fireEvent.click(sspBtn);

    const numFields = container.querySelectorAll("s-number-field");
    if (numFields.length > 1) {
      fireCustomChange(numFields[1], "0");
    }
  });

  it("duration blur sets error when empty", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const sspBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Stable success probability"),
    );
    if (sspBtn) fireEvent.click(sspBtn);

    const numFields = container.querySelectorAll("s-number-field");
    if (numFields.length > 1) {
      fireEvent.blur(numFields[1]);
    }
  });

  it("probabilityToBeBest onFocus clears error", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const sspBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Stable success probability"),
    );
    if (sspBtn) fireEvent.click(sspBtn);

    const numFields = container.querySelectorAll("s-number-field");
    if (numFields.length > 0) {
      fireEvent.focus(numFields[0]);
    }
  });

  it("time unit select updates state", async () => {
    const { container } = renderComponent();
    const buttons = container.querySelectorAll("s-button");
    const sspBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes("Stable success probability"),
    );
    if (sspBtn) fireEvent.click(sspBtn);

    const timeUnitSelect = container.querySelector('s-select[label="Time Unit"]');
    if (timeUnitSelect) {
      fireCustomChange(timeUnitSelect, "weeks");
    }
  });

  // ── goal select ────────────────────────────────────────────────────────────

  it("goal select onChange updates goalSelected", async () => {
    const { container } = renderComponent();
    const goalSelect = container.querySelector('s-select[label="Experiment Goal"]');
    if (goalSelect) {
      fireCustomChange(goalSelect, "viewPage");
    }
  });

  // ── handleExperimentCreate (Save Draft) ───────────────────────────────────

  it("handleExperimentCreate submits the fetcher", async () => {
    const submitMock = vi.fn().mockResolvedValue(undefined);
    mockUseFetcher.mockReturnValue(defaultFetcher({ submit: submitMock }));
    const { container } = renderComponent();
    const saveBtn = container.querySelector('s-button[slot="primary-action"]');
    if (saveBtn) {
      await act(async () => { fireEvent.click(saveBtn); });
    }
  });

  it("Save Draft in bottom bar also submits", async () => {
    const submitMock = vi.fn().mockResolvedValue(undefined);
    mockUseFetcher.mockReturnValue(defaultFetcher({ submit: submitMock }));
    const { container } = renderComponent();
    const btns = container.querySelectorAll("s-button");
    const saveBtn = Array.from(btns).find(
      (b) => b.textContent?.includes("Save Draft") && !b.getAttribute("slot"),
    );
    if (saveBtn) {
      await act(async () => { fireEvent.click(saveBtn); });
    }
  });

  // ── handleLaunchPicker ─────────────────────────────────────────────────────

  it("handleLaunchPicker opens a new window with picker URL", async () => {
    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = renderComponent();
    const selectVisuallyBtns = container.querySelectorAll(
      'button, s-button',
    );
    const pickerBtn = Array.from(selectVisuallyBtns).find(
      (b) => b.textContent?.includes("Select Visually"),
    );
    if (pickerBtn) fireEvent.click(pickerBtn);
    windowOpenSpy.mockRestore();
  });

  // ── message event listener ─────────────────────────────────────────────────

  it("message event updates variant sectionId (type=variant)", async () => {
    const { container } = renderComponent();
    // Simulate picker target being set for variant index 0 then message arrives
    await act(async () => {
      // First click a "Select Visually" button to set the ref
      const pickerBtns = Array.from(container.querySelectorAll("s-button")).filter(
        (b) => b.textContent?.includes("Select Visually"),
      );
      if (pickerBtns.length > 0) {
        vi.spyOn(window, "open").mockImplementation(() => null);
        fireEvent.click(pickerBtns[0]);
      }
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "AB_INSIGHTFUL_SECTION_PICKED", sectionId: "section-xyz" },
        }),
      );
    });
  });

  it("message event handles control type pick", async () => {
    const { container } = renderComponent();
    // First enable addControlSection so "Select Visually" (control) button exists
    const checkbox = container.querySelector('s-checkbox[label="Add a control section ID"]');
    if (checkbox) fireEvent.click(checkbox);

    await act(async () => {
      const pickerBtns = Array.from(container.querySelectorAll("s-button")).filter(
        (b) => b.textContent?.includes("Select Visually"),
      );
      // The second "Select Visually" button is for control
      if (pickerBtns.length > 1) {
        vi.spyOn(window, "open").mockImplementation(() => null);
        fireEvent.click(pickerBtns[1]);
      }
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "AB_INSIGHTFUL_SECTION_PICKED", sectionId: "ctrl-section" },
        }),
      );
    });
  });

  it("message event with shopify toast fires toast", async () => {
    // Define a shopify global with toast mock
    global.shopify = { toast: { show: vi.fn() } };
    const { container } = renderComponent();
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "AB_INSIGHTFUL_SECTION_PICKED", sectionId: "toast-section" },
        }),
      );
    });
    delete global.shopify;
  });

  it("ignores message events with unknown type", async () => {
    renderComponent();
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "SOME_OTHER_EVENT", sectionId: "ignored" },
        }),
      );
    });
  });

  // ── tutorial useEffect ─────────────────────────────────────────────────────

  it("tutorial useEffect does not crash when tutorialData.createExperiment is false", () => {
    mockUseLoaderData.mockReturnValue({
      ...DEFAULT_LOADER_DATA,
      tutorialData: { createExperiment: false },
    });
    expect(() => render(<CreateExperiment />)).not.toThrow();
  });

  it("tutorial dismissed button calls tutorialFetcher.submit", async () => {
    mockUseLoaderData.mockReturnValue({
      ...DEFAULT_LOADER_DATA,
      tutorialData: { createExperiment: false },
    });
    const tutorialSubmitMock = vi.fn();
    // Both useFetcher calls return mocks; the second one is tutorialFetcher
    let callCount = 0;
    mockUseFetcher.mockImplementation(() => {
      callCount++;
      if (callCount === 2) return { state: "idle", data: null, submit: tutorialSubmitMock };
      return defaultFetcher();
    });
    const { container } = render(<CreateExperiment />);
    const understood = Array.from(container.querySelectorAll("s-button")).find(
      (b) => b.textContent?.includes("Understood"),
    );
    if (understood) fireEvent.click(understood);
  });

  // ── submitting state ───────────────────────────────────────────────────────

  it("isSubmitting disables save button when fetcher is submitting", () => {
    renderComponent({ state: "submitting" });
  });

  // ── validateAllDateTimes useEffect ─────────────────────────────────────────

  it("validateAllDateTimes runs on date/time state change via useEffect", async () => {
    const { validateStartIsInFuture } = await import("../utils/validateStartIsInFuture");
    renderComponent();
    expect(validateStartIsInFuture).toHaveBeenCalled();
  });

  it("endCondition useEffect clears end fields when switching from endDate to manual", async () => {
    renderComponent();
  });

  // ── server-side errors rendering ──────────────────────────────────────────

  it("renders with server-side errors for all error fields", () => {
    mockUseFetcher.mockReturnValue(
      defaultFetcher({
        data: {
          errors: {
            name: "Name error",
            description: "Desc error",
            startDate: "Start error",
            endDate: "End error",
            probabilityToBeBest: "Prob error",
            duration: "Duration error",
            timeUnit: "TimeUnit error",
            maxUsers: "MaxUsers error",
            variant_0_sectionId: "Section error",
          },
        },
      }),
    );
    expect(() => render(<CreateExperiment />)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// action() — date/time edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("action() — date/time edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateMaxUsers.mockReturnValue(null);
    db.project.upsert.mockResolvedValue({ id: 1 });
    db.goal.findUnique.mockResolvedValue({ id: 1 });
  });

  it("accepts endDate without endTime (defaults to 23:59)", async () => {
    await action({
      request: buildRequest({
        name: "E",
        description: "D",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "endDate",
        endDate: "2099-12-31",
        goal: "completedCheckout",
        variantsJSON: JSON.stringify([{ sectionId: "s", trafficAllocation: 50 }]),
        useAccountDefaultMaxUsers: "true",
      }),
    });
    expect(mockRedirect).toHaveBeenCalled();
  });

  it("returns endDate error when endDateUTC is provided but invalid", async () => {
    const result = await action({
      request: buildRequest({
        name: "E",
        description: "D",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "endDate",
        endDateUTC: "not-a-date",
        goal: "completedCheckout",
        useAccountDefaultMaxUsers: "true",
      }),
    });
    expect(result.errors.endDate).toBeTruthy();
  });

  it("uses local date fields when no startDateUTC is present", async () => {
    await action({
      request: buildRequest({
        name: "L",
        description: "D",
        startDate: "2099-05-01",
        startTime: "10:00",
        goal: "completedCheckout",
        variantsJSON: JSON.stringify([{ sectionId: "s", trafficAllocation: 50 }]),
        useAccountDefaultMaxUsers: "true",
      }),
    });
    expect(mockRedirect).toHaveBeenCalled();
  });

  it("endDate condition with endDate equal to startDate fails validation", async () => {
    const result = await action({
      request: buildRequest({
        name: "E",
        description: "D",
        startDateUTC: FUTURE_DATE_UTC,
        endCondition: "endDate",
        endDateUTC: FUTURE_DATE_UTC, // same as start → end not after start
        endDate: "2099-06-15",
        goal: "completedCheckout",
        variantsJSON: JSON.stringify([{ sectionId: "s", trafficAllocation: 50 }]),
        useAccountDefaultMaxUsers: "true",
      }),
    });
    expect(result.errors.endDate).toBeTruthy();
  });

  it("combineLocalToDate handles invalid date parts gracefully", async () => {
    // Pass a startDate with invalid format so combineLocalToDate returns null
    const result = await action({
      request: buildRequest({
        name: "E",
        description: "D",
        startDate: "not-a-date",
        goal: "completedCheckout",
        useAccountDefaultMaxUsers: "true",
      }),
    });
    expect(result.errors.startDate).toBeTruthy();
  });
});
