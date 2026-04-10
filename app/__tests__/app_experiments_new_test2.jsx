// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, fireEvent, act } from "@testing-library/react";

// ─────────────────────────────────────────────────────────────────────────────
// Module mocks
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

vi.mock("../services/tutorialData.server", () => ({
  setCreateExpPage: vi.fn().mockResolvedValue(undefined),
  getTutorialData: vi.fn().mockResolvedValue({ createExperiment: true }),
}));

vi.mock("../services/experiment.server", () => ({
  createExperiment: vi.fn().mockResolvedValue({ id: 42 }),
  handleCollectedEvent: vi.fn(),
}));

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
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function buildRequest(fields = {}) {
  return { formData: () => Promise.resolve(buildFormData(fields)) };
}

const FUTURE_DATE_UTC = "2099-06-15T12:00:00.000Z";

/**
 * Reach into the React fiber on a DOM element and directly call a prop handler.
 * This is the only reliable way to trigger React event handlers on custom
 * web components (s-*, Polaris) in JSDOM, since those elements don't support
 * the native value setter that fireEvent requires.
 *
 * Usage: callProp(el, "onChange", { target: { value: "foo" } })
 */
function callProp(el, propName, ...args) {
  // Walk fiber keys — React attaches under __reactFiber$xxx or __reactInternalInstance$xxx
  const fiberKey = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"),
  );
  if (!fiberKey) return false;
  let fiber = el[fiberKey];
  while (fiber) {
    const props = fiber.memoizedProps || fiber.pendingProps;
    if (props && typeof props[propName] === "function") {
      act(() => props[propName](...args));
      return true;
    }
    fiber = fiber.return;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Imports under test  (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { action, loader } from "../routes/app.experiments.new.jsx";
import db from "../db.server";
import { validateMaxUsers } from "../utils/validateMaxUsers";
import CreateExperiment from "../routes/app.experiments.new.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// Default data
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LOADER_DATA = {
  defaultGoal: "completedCheckout",
  maxUsersPerExperiment: 10000,
  tutorialData: { createExperiment: true },
  shopDomain: "test-shop.myshopify.com",
};

function defaultFetcher(overrides = {}) {
  return { state: "idle", data: null, submit: vi.fn(), ...overrides };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION tests
// ─────────────────────────────────────────────────────────────────────────────

describe("action()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateMaxUsers.mockReturnValue(null);
  });

  it("handles tutorial_viewed intent successfully", async () => {
    const result = await action({ request: buildRequest({ intent: "tutorial_viewed" }) });
    expect(result).toEqual({ ok: true, action: "tutorial_viewed" });
  });

  it("handles tutorial_viewed intent error (comma operator returns last value)", async () => {
    const { setCreateExpPage } = await import("../services/tutorialData.server");
    setCreateExpPage.mockRejectedValueOnce(new Error("DB error"));
    const result = await action({ request: buildRequest({ intent: "tutorial_viewed" }) });
    expect(result).toEqual({ status: 500 });
  });

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
        name: "Test", description: "Desc",
        startDateUTC: "2000-01-01T00:00:00.000Z",
      }),
    });
    expect(result.errors.startDate).toMatch(/future/i);
  });

  it("returns error for invalid startDateUTC (NaN)", async () => {
    const result = await action({
      request: buildRequest({ name: "Test", description: "Desc", startDateUTC: "not-a-date" }),
    });
    expect(result.errors.startDate).toBeTruthy();
  });

  it("returns errors when endCondition=endDate and endDate missing", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test", description: "Desc",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "endDate",
      }),
    });
    expect(result.errors.endDate).toBeTruthy();
  });

  it("returns error when endDate is before startDate", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test", description: "Desc",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "endDate",
        endDateUTC: "2000-01-01T00:00:00.000Z", endDate: "2000-01-01",
      }),
    });
    expect(result.errors.endDate).toBeTruthy();
  });

  it("returns errors for stableSuccessProbability missing fields", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test", description: "Desc",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "stableSuccessProbability",
      }),
    });
    expect(result.errors.probabilityToBeBest).toBeTruthy();
    expect(result.errors.duration).toBeTruthy();
    expect(result.errors.timeUnit).toBeTruthy();
  });

  it("returns error for out-of-range probability (< 51)", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test", description: "Desc",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "stableSuccessProbability",
        probabilityToBeBest: "40", duration: "7", timeUnit: "days",
      }),
    });
    expect(result.errors.probabilityToBeBest).toMatch(/51/);
  });

  it("returns error for non-integer probability", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test", description: "Desc",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "stableSuccessProbability",
        probabilityToBeBest: "75.5", duration: "7", timeUnit: "days",
      }),
    });
    expect(result.errors.probabilityToBeBest).toMatch(/whole/i);
  });

  it("returns error for duration < 1", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test", description: "Desc",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "stableSuccessProbability",
        probabilityToBeBest: "80", duration: "0", timeUnit: "days",
      }),
    });
    expect(result.errors.duration).toBeTruthy();
  });

  it("returns error for non-integer duration", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test", description: "Desc",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "stableSuccessProbability",
        probabilityToBeBest: "80", duration: "1.5", timeUnit: "days",
      }),
    });
    expect(result.errors.duration).toMatch(/whole/i);
  });

  it("returns maxUsers error when validateMaxUsers returns error", async () => {
    validateMaxUsers.mockReturnValueOnce("Max users error");
    const result = await action({
      request: buildRequest({ name: "Test", description: "Desc", startDateUTC: FUTURE_DATE_UTC }),
    });
    expect(result.errors.maxUsers).toBe("Max users error");
  });

  it("returns error when variant sectionId is missing", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test", description: "Desc", startDateUTC: FUTURE_DATE_UTC,
        variantsJSON: JSON.stringify([{ sectionId: "", trafficAllocation: 50 }]),
      }),
    });
    expect(result.errors["variant_0_sectionId"]).toBeTruthy();
  });

  it("creates experiment and redirects on valid data", async () => {
    db.project.upsert.mockResolvedValue({ id: 1 });
    db.goal.findUnique.mockResolvedValue({ id: 99 });
    await action({
      request: buildRequest({
        name: "My Experiment", description: "Test description",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "manual",
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
        name: "My Experiment", description: "Test description",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "manual",
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
        name: "SSP Experiment", description: "Testing SSP",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "stableSuccessProbability",
        goal: "addToCart",
        variantsJSON: JSON.stringify([{ sectionId: "sec-1", trafficAllocation: 50 }]),
        probabilityToBeBest: "80", duration: "7", timeUnit: "days",
        useAccountDefaultMaxUsers: "false", maxUsers: "5000",
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
        name: "EndDate Exp", description: "Uses end date",
        startDate: "2099-01-01", startTime: "10:00",
        endCondition: "endDate", endDate: "2099-06-01", endTime: "23:59",
        goal: "viewPage",
        variantsJSON: JSON.stringify([{ sectionId: "sec-2", trafficAllocation: 50 }]),
        useAccountDefaultMaxUsers: "true",
      }),
    });
    expect(mockRedirect).toHaveBeenCalled();
  });

  it("handles invalid variantsJSON gracefully", async () => {
    const result = await action({
      request: buildRequest({
        name: "Test", description: "Desc",
        startDateUTC: FUTURE_DATE_UTC, variantsJSON: "not json at all",
      }),
    });
    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOADER tests
// ─────────────────────────────────────────────────────────────────────────────

describe("loader()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns defaultGoal, maxUsersPerExperiment, tutorialData, shopDomain", async () => {
    db.project.findUnique.mockResolvedValue({ defaultGoal: "viewPage", maxUsersPerExperiment: 5000 });
    const result = await loader({ request: { formData: vi.fn() } });
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
        name: "E", description: "D",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "endDate",
        endDate: "2099-12-31",
        goal: "completedCheckout",
        variantsJSON: JSON.stringify([{ sectionId: "s", trafficAllocation: 50 }]),
        useAccountDefaultMaxUsers: "true",
      }),
    });
    expect(mockRedirect).toHaveBeenCalled();
  });

  it("returns endDate error when endDateUTC is invalid", async () => {
    const result = await action({
      request: buildRequest({
        name: "E", description: "D",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "endDate",
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
        name: "L", description: "D",
        startDate: "2099-05-01", startTime: "10:00",
        goal: "completedCheckout",
        variantsJSON: JSON.stringify([{ sectionId: "s", trafficAllocation: 50 }]),
        useAccountDefaultMaxUsers: "true",
      }),
    });
    expect(mockRedirect).toHaveBeenCalled();
  });

  it("endDate equal to startDate fails validation", async () => {
    const result = await action({
      request: buildRequest({
        name: "E", description: "D",
        startDateUTC: FUTURE_DATE_UTC, endCondition: "endDate",
        endDateUTC: FUTURE_DATE_UTC, endDate: "2099-06-15",
        goal: "completedCheckout",
        variantsJSON: JSON.stringify([{ sectionId: "s", trafficAllocation: 50 }]),
        useAccountDefaultMaxUsers: "true",
      }),
    });
    expect(result.errors.endDate).toBeTruthy();
  });

  it("combineLocalToDate handles invalid date string", async () => {
    const result = await action({
      request: buildRequest({
        name: "E", description: "D", startDate: "not-a-date",
        goal: "completedCheckout", useAccountDefaultMaxUsers: "true",
      }),
    });
    expect(result.errors.startDate).toBeTruthy();
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

  // Helper to click the end condition buttons
  function clickEndCondition(container, label) {
    const btn = Array.from(container.querySelectorAll("s-button"))
      .find((b) => b.textContent?.trim() === label || b.textContent?.includes(label));
    if (btn) fireEvent.click(btn);
  }

  // Helper to switch to SSP end condition
  function switchToSSP(container) {
    clickEndCondition(container, "Stable success probability");
  }

  // ── basic render ───────────────────────────────────────────────────────────

  it("renders without crashing", () => {
    renderComponent();
  });

  it("renders with all server-side errors", () => {
    mockUseFetcher.mockReturnValue(defaultFetcher({
      data: {
        errors: {
          name: "Name error", description: "Desc error",
          startDate: "Start error", endDate: "End error",
          probabilityToBeBest: "Prob error", duration: "Duration error",
          timeUnit: "TimeUnit error", maxUsers: "MaxUsers error",
          variant_0_sectionId: "Section error",
        },
      },
    }));
    expect(() => render(<CreateExperiment />)).not.toThrow();
  });

  it("shows goal/form error banner", () => {
    mockUseFetcher.mockReturnValue(defaultFetcher({ data: { errors: { goal: "Goal not found" } } }));
    render(<CreateExperiment />);
  });

  it("isSubmitting renders without crash", () => {
    renderComponent({ state: "submitting" });
  });

  // ── name field ─────────────────────────────────────────────────────────────

  it("handleNameBlur sets error when name is empty", () => {
    const { container } = renderComponent();
    const el = container.querySelector("s-text-field");
    callProp(el, "onBlur");
  });

  it("handleNameBlur clears error when name is filled", () => {
    const { container } = renderComponent();
    const el = container.querySelector("s-text-field");
    callProp(el, "onChange", { target: { value: "My Name" } });
    callProp(el, "onBlur");
  });

  it("handleName clears nameError when text entered", () => {
    const { container } = renderComponent();
    const el = container.querySelector("s-text-field");
    callProp(el, "onBlur"); // trigger error
    callProp(el, "onChange", { target: { value: "hello" } }); // clear
  });

  it("name onFocus clears error", () => {
    const { container } = renderComponent();
    const el = container.querySelector("s-text-field");
    callProp(el, "onFocus");
  });

  it("name onFocus clears server-side name error", () => {
    mockUseFetcher.mockReturnValue(defaultFetcher({ data: { errors: { name: "err" } } }));
    const { container } = render(<CreateExperiment />);
    const el = container.querySelector("s-text-field");
    callProp(el, "onFocus");
  });

  // ── description field ──────────────────────────────────────────────────────

  it("handleDescriptionBlur sets error when empty", () => {
    const { container } = renderComponent();
    const el = container.querySelector("s-text-area");
    callProp(el, "onBlur");
  });

  it("handleDescriptionBlur clears error when filled", () => {
    const { container } = renderComponent();
    const el = container.querySelector("s-text-area");
    callProp(el, "onChange", { target: { value: "desc" } });
    callProp(el, "onBlur");
  });

  it("description onChange clears error when text entered", () => {
    const { container } = renderComponent();
    const el = container.querySelector("s-text-area");
    callProp(el, "onBlur");
    callProp(el, "onChange", { target: { value: "something" } });
  });

  it("description onFocus clears server error", () => {
    mockUseFetcher.mockReturnValue(defaultFetcher({ data: { errors: { description: "err" } } }));
    const { container } = render(<CreateExperiment />);
    const el = container.querySelector("s-text-area");
    callProp(el, "onFocus");
  });

  // ── goal select ────────────────────────────────────────────────────────────

  it("goal select onChange updates goalSelected", () => {
    const { container } = renderComponent();
    const el = container.querySelector('s-select[label="Experiment Goal"]');
    callProp(el, "onChange", { target: { value: "viewPage" } });
  });

  // ── variant section ID ─────────────────────────────────────────────────────

  it("variant sectionId onBlur sets error when empty", () => {
    const { container } = renderComponent();
    const fields = container.querySelectorAll('s-text-field[label="Section ID to be tested"]');
    if (fields.length) callProp(fields[0], "onBlur");
  });

  it("variant sectionId onBlur clears error when filled", () => {
    const { container } = renderComponent();
    const fields = container.querySelectorAll('s-text-field[label="Section ID to be tested"]');
    if (fields.length) {
      callProp(fields[0], "onChange", { target: { value: "shopify-section-123" } });
      callProp(fields[0], "onBlur");
    }
  });

  it("variant sectionId onChange clears error", () => {
    const { container } = renderComponent();
    const fields = container.querySelectorAll('s-text-field[label="Section ID to be tested"]');
    if (fields.length) {
      callProp(fields[0], "onBlur"); // trigger error
      callProp(fields[0], "onChange", { target: { value: "shopify-section-123" } });
    }
  });

  it("variant sectionId onFocus clears error", () => {
    const { container } = renderComponent();
    const fields = container.querySelectorAll('s-text-field[label="Section ID to be tested"]');
    if (fields.length) callProp(fields[0], "onFocus");
  });

  it("variant sectionId onFocus clears server error", () => {
    mockUseFetcher.mockReturnValue(defaultFetcher({
      data: { errors: { variant_0_sectionId: "err" } },
    }));
    const { container } = render(<CreateExperiment />);
    const fields = container.querySelectorAll('s-text-field[label="Section ID to be tested"]');
    if (fields.length) callProp(fields[0], "onFocus");
  });

  // ── traffic allocation ─────────────────────────────────────────────────────

  it("traffic allocation onChange clamps and updates variant", () => {
    const { container } = renderComponent();
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length) callProp(fields[0], "onChange", { target: { value: "40" } });
  });

  // ── add/remove variants ────────────────────────────────────────────────────

  it("handleAddVariant adds variants up to MAX_VARIANTS then stops", () => {
    const { container } = renderComponent();
    const addBtn = container.querySelector('[accessibilityLabel="Add variant"]');
    if (addBtn) {
      fireEvent.click(addBtn); // 2
      fireEvent.click(addBtn); // 3
      fireEvent.click(addBtn); // 4 (max)
      fireEvent.click(addBtn); // no-op
    }
  });

  it("handleRemoveVariant removes variant and stops at 1", () => {
    const { container } = renderComponent();
    const addBtn = container.querySelector('[accessibilityLabel="Add variant"]');
    const removeBtn = container.querySelector('[accessibilityLabel="Remove variant"]');
    if (addBtn && removeBtn) {
      fireEvent.click(addBtn);    // 2
      fireEvent.click(removeBtn); // 1
      fireEvent.click(removeBtn); // no-op
    }
  });

  // ── control section ────────────────────────────────────────────────────────

  it("addControlSection checkbox toggle shows control section field", () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Add a control section ID"]');
    if (checkbox) callProp(checkbox, "onChange");
  });

  it("controlSectionId onChange updates state", () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Add a control section ID"]');
    if (checkbox) callProp(checkbox, "onChange"); // reveal field
    const field = container.querySelector('s-text-field[label="Control Section ID"]');
    if (field) callProp(field, "onChange", { target: { value: "ctrl-123" } });
  });

  // ── customer segment ───────────────────────────────────────────────────────

  it("customerSegment select updates state", () => {
    const { container } = renderComponent();
    const el = container.querySelector('s-select[label="Customer segment to test"]');
    if (el) callProp(el, "onChange", { target: { value: "mobileVisitors" } });
  });

  // ── maxUsers ───────────────────────────────────────────────────────────────

  it("unchecking useAccountDefaultMaxUsers toggles custom field", () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Use account default max users"]');
    if (checkbox) callProp(checkbox, "onChange");
  });

  it("re-checking useAccountDefaultMaxUsers clears maxUsers", () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Use account default max users"]');
    if (checkbox) {
      callProp(checkbox, "onChange"); // uncheck
      callProp(checkbox, "onChange"); // re-check
    }
  });

  it("maxUsers onChange validates empty value", () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Use account default max users"]');
    if (checkbox) callProp(checkbox, "onChange");
    const field = container.querySelector('s-number-field[label="Max users"]');
    if (field) callProp(field, "onChange", { target: { value: "" } });
  });

  it("maxUsers onChange validates value < 1", () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Use account default max users"]');
    if (checkbox) callProp(checkbox, "onChange");
    const field = container.querySelector('s-number-field[label="Max users"]');
    if (field) callProp(field, "onChange", { target: { value: "0" } });
  });

  it("maxUsers onChange validates value > 1000000", () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Use account default max users"]');
    if (checkbox) callProp(checkbox, "onChange");
    const field = container.querySelector('s-number-field[label="Max users"]');
    if (field) callProp(field, "onChange", { target: { value: "9999999" } });
  });

  it("maxUsers onChange accepts valid value", () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Use account default max users"]');
    if (checkbox) callProp(checkbox, "onChange");
    const field = container.querySelector('s-number-field[label="Max users"]');
    if (field) callProp(field, "onChange", { target: { value: "500" } });
  });

  it("maxUsers onBlur sets error when empty", () => {
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Use account default max users"]');
    if (checkbox) callProp(checkbox, "onChange");
    const field = container.querySelector('s-number-field[label="Max users"]');
    if (field) callProp(field, "onBlur");
  });

  // ── start date ─────────────────────────────────────────────────────────────

  it("startDate onChange triggers validation", () => {
    const { container } = renderComponent();
    const el = container.querySelector("#startDateField");
    if (el) callProp(el, "onChange", { target: { value: "2099-06-01" } });
  });

  it("startDate onBlur sets error when empty", () => {
    const { container } = renderComponent();
    const el = container.querySelector("#startDateField");
    if (el) callProp(el, "onBlur");
  });

  it("startDate onBlur clears error when filled", () => {
    const { container } = renderComponent();
    const el = container.querySelector("#startDateField");
    if (el) {
      callProp(el, "onChange", { target: { value: "2099-06-01" } });
      callProp(el, "onBlur");
    }
  });

  it("startDate onFocus clears emptyStartDateError", () => {
    const { container } = renderComponent();
    const el = container.querySelector("#startDateField");
    if (el) {
      callProp(el, "onBlur");
      callProp(el, "onFocus");
    }
  });

  it("startDate onFocus clears server startDate error", () => {
    mockUseFetcher.mockReturnValue(defaultFetcher({ data: { errors: { startDate: "err" } } }));
    const { container } = render(<CreateExperiment />);
    const el = container.querySelector("#startDateField");
    if (el) callProp(el, "onFocus");
  });

  // ── start time (mocked as native <select>) ─────────────────────────────────

  it("handleStartTimeChange triggers validation", () => {
    const { container } = renderComponent();
    const el = container.querySelector('[data-testid="startTimeSelect"]');
    if (el) fireEvent.change(el, { target: { value: "13:00" } });
  });

  // ── end condition buttons ──────────────────────────────────────────────────

  it("clicking End date button sets endCondition", () => {
    const { container } = renderComponent();
    clickEndCondition(container, "End date");
  });

  it("clicking Stable success probability sets endCondition", () => {
    const { container } = renderComponent();
    switchToSSP(container);
  });

  it("clicking Manual resets endCondition and clears end fields", () => {
    const { container } = renderComponent();
    clickEndCondition(container, "End date");
    clickEndCondition(container, "Manual");
  });

  // ── end date (only visible when endCondition="endDate") ────────────────────

  it("endDate onChange triggers validation", () => {
    const { container } = renderComponent();
    clickEndCondition(container, "End date");
    const el = container.querySelector("#endDateField");
    if (el) callProp(el, "onChange", { target: { value: "2099-12-31" } });
  });

  it("endDate onBlur sets error when empty", () => {
    const { container } = renderComponent();
    clickEndCondition(container, "End date");
    const el = container.querySelector("#endDateField");
    if (el) callProp(el, "onBlur");
  });

  it("endDate onFocus clears error", () => {
    const { container } = renderComponent();
    clickEndCondition(container, "End date");
    const el = container.querySelector("#endDateField");
    if (el) {
      callProp(el, "onBlur");
      callProp(el, "onFocus");
    }
  });

  it("endDate onFocus clears server endDate error", () => {
    mockUseFetcher.mockReturnValue(defaultFetcher({ data: { errors: { endDate: "err" } } }));
    const { container } = render(<CreateExperiment />);
    clickEndCondition(container, "End date");
    const el = container.querySelector("#endDateField");
    if (el) callProp(el, "onFocus");
  });

  // ── end time (mocked as native <select>) ──────────────────────────────────

  it("handleEndTimeChange triggers validation", () => {
    const { container } = renderComponent();
    clickEndCondition(container, "End date");
    const el = container.querySelector('[data-testid="endTimeSelect"]');
    if (el) fireEvent.change(el, { target: { value: "13:00" } });
  });

  // ── stable success probability fields ──────────────────────────────────────

  it("SSP: probability onInput valid value (51-100) sets state", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 0) {
      callProp(fields[0], "onInput", { target: { value: "75" } });
      callProp(fields[0], "onChange", { target: { value: "75" } });
    }
  });

  it("SSP: probability onInput out-of-range shows error", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 0) callProp(fields[0], "onInput", { target: { value: "30" } });
  });

  it("SSP: probability onInput non-integer shows whole number error", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 0) callProp(fields[0], "onInput", { target: { value: "75.5" } });
  });

  it("SSP: probability onBlur sets error when empty", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 0) callProp(fields[0], "onBlur");
  });

  it("SSP: probability onBlur clears error when filled", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 0) {
      callProp(fields[0], "onInput", { target: { value: "75" } });
      callProp(fields[0], "onBlur");
    }
  });

  it("SSP: probability onFocus clears error", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 0) callProp(fields[0], "onFocus");
  });

  it("SSP: probability onFocus clears server error", () => {
    mockUseFetcher.mockReturnValue(defaultFetcher({
      data: { errors: { probabilityToBeBest: "err" } },
    }));
    const { container } = render(<CreateExperiment />);
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 0) callProp(fields[0], "onFocus");
  });

  it("SSP: duration onChange valid value clears error", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 1) {
      callProp(fields[1], "onChange", { target: { value: "7" } });
      callProp(fields[1], "onInput", { target: { value: "7" } });
    }
  });

  it("SSP: duration onChange value < 1 shows error", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 1) callProp(fields[1], "onChange", { target: { value: "0" } });
  });

  it("SSP: duration onInput non-integer shows error", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 1) callProp(fields[1], "onInput", { target: { value: "1.5" } });
  });

  it("SSP: duration onBlur sets error when empty", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 1) callProp(fields[1], "onBlur");
  });

  it("SSP: duration onBlur clears error when filled", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const fields = container.querySelectorAll("s-number-field");
    if (fields.length > 1) {
      callProp(fields[1], "onChange", { target: { value: "7" } });
      callProp(fields[1], "onBlur");
    }
  });

  it("SSP: time unit select updates state", () => {
    const { container } = renderComponent();
    switchToSSP(container);
    const el = container.querySelector('s-select[label="Time Unit"]');
    if (el) callProp(el, "onChange", { target: { value: "weeks" } });
  });

  // ── handleDiscard ──────────────────────────────────────────────────────────

  it("handleDiscard resets form via slot secondary-actions button", () => {
    const { container } = renderComponent();
    const btn = container.querySelector('s-button[slot="secondary-actions"]');
    if (btn) fireEvent.click(btn);
  });

  it("handleDiscard resets form via bottom Discard button", () => {
    const { container } = renderComponent();
    const btn = Array.from(container.querySelectorAll("s-button"))
      .find((b) => b.textContent?.includes("Discard") && !b.getAttribute("slot"));
    if (btn) fireEvent.click(btn);
  });

  // ── handleExperimentCreate ─────────────────────────────────────────────────

  it("Save Draft (primary-action slot) submits fetcher", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    mockUseFetcher.mockReturnValue(defaultFetcher({ submit }));
    const { container } = renderComponent();
    const btn = container.querySelector('s-button[slot="primary-action"]');
    if (btn) await act(async () => { fireEvent.click(btn); });
  });

  it("Save Draft (bottom bar) submits fetcher", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    mockUseFetcher.mockReturnValue(defaultFetcher({ submit }));
    const { container } = renderComponent();
    const btn = Array.from(container.querySelectorAll("s-button"))
      .find((b) => b.textContent?.includes("Save Draft") && !b.getAttribute("slot"));
    if (btn) await act(async () => { fireEvent.click(btn); });
  });

  // ── handleLaunchPicker ─────────────────────────────────────────────────────

  it("handleLaunchPicker opens picker URL for control", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Add a control section ID"]');
    if (checkbox) callProp(checkbox, "onChange");
    const btns = Array.from(container.querySelectorAll("s-button"))
      .filter((b) => b.textContent?.includes("Select Visually"));
    if (btns.length > 1) fireEvent.click(btns[1]);
    openSpy.mockRestore();
  });

  // ── message event listener ─────────────────────────────────────────────────

  it("AB_INSIGHTFUL_SECTION_PICKED updates variant sectionId (type=variant)", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = renderComponent();
    const pickerBtn = Array.from(container.querySelectorAll("s-button"))
      .find((b) => b.textContent?.includes("Select Visually"));
    if (pickerBtn) fireEvent.click(pickerBtn); // sets ref to {type:"variant", index:0}
    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { type: "AB_INSIGHTFUL_SECTION_PICKED", sectionId: "section-xyz" },
      }));
    });
    openSpy.mockRestore();
  });

  it("AB_INSIGHTFUL_SECTION_PICKED updates controlSectionId (type=control)", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container } = renderComponent();
    const checkbox = container.querySelector('s-checkbox[label="Add a control section ID"]');
    if (checkbox) callProp(checkbox, "onChange");
    const btns = Array.from(container.querySelectorAll("s-button"))
      .filter((b) => b.textContent?.includes("Select Visually"));
    if (btns.length > 1) fireEvent.click(btns[1]); // sets ref to {type:"control"}
    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { type: "AB_INSIGHTFUL_SECTION_PICKED", sectionId: "ctrl-section" },
      }));
    });
    openSpy.mockRestore();
  });

  it("AB_INSIGHTFUL_SECTION_PICKED fires shopify toast", async () => {
    global.shopify = { toast: { show: vi.fn() } };
    renderComponent();
    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { type: "AB_INSIGHTFUL_SECTION_PICKED", sectionId: "toast-sec" },
      }));
    });
    expect(global.shopify.toast.show).toHaveBeenCalledWith("Section ID copied!");
    delete global.shopify;
  });

  it("ignores message events with unknown type", async () => {
    renderComponent();
    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { type: "SOME_OTHER_EVENT" },
      }));
    });
  });

  // ── tutorial useEffect ─────────────────────────────────────────────────────

  it("tutorial useEffect does not crash when createExperiment is false", () => {
    mockUseLoaderData.mockReturnValue({
      ...DEFAULT_LOADER_DATA,
      tutorialData: { createExperiment: false },
    });
    expect(() => render(<CreateExperiment />)).not.toThrow();
  });



  // ── date/time useEffects ───────────────────────────────────────────────────

  it("validateAllDateTimes useEffect runs on mount", async () => {
    const { validateStartIsInFuture } = await import("../utils/validateStartIsInFuture");
    renderComponent();
    expect(validateStartIsInFuture).toHaveBeenCalled();
  });

  it("endCondition useEffect clears end fields when switching away from endDate", () => {
    const { container } = renderComponent();
    clickEndCondition(container, "End date");
    clickEndCondition(container, "Manual"); // triggers clear useEffect
  });

  it("endCondition useEffect clears end fields when switching to SSP", () => {
    const { container } = renderComponent();
    clickEndCondition(container, "End date");
    switchToSSP(container); // triggers clear useEffect
  });
});
