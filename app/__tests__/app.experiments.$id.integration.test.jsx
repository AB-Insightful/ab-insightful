// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockRevalidate = vi.fn();
const mockSubmit = vi.fn();

let mockFetcher = {
  state: "idle",
  data: null,
  submit: mockSubmit,
};

let mockSearch = "";
let mockLoaderData = null;

vi.mock("react-router", () => ({
  useFetcher: () => mockFetcher,
  useLoaderData: () => mockLoaderData,
  useRevalidator: () => ({ revalidate: mockRevalidate }),
  useSearchParams: () => [new URLSearchParams(mockSearch)],
  redirect: vi.fn(),
}));

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(),
  },
}));

vi.mock("../routes/policies/experimentPolicy", () => ({
  canRenameExperiment: vi.fn(() => true),
  isLockedStatus: vi.fn((status) =>
    status === "completed" || status === "archived",
  ),
  canEditStructure: vi.fn((status) => status === "draft"),
  canEditSchedule: vi.fn((status) =>
    status === "draft" || status === "active" || status === "paused",
  ),
  allowedStatusIntents: vi.fn((status) => {
    if (status === "draft") return new Set(["start", "delete"]);
    if (status === "active") return new Set(["pause", "end", "archive", "delete"]);
    if (status === "paused") return new Set(["resume", "end", "archive", "delete"]);
    if (status === "completed") return new Set(["archive"]);
    if (status === "archived") return new Set();
    return new Set();
  }),
}));

vi.mock("../utils/experimentConstants.js", () => ({
  ExperimentStatus: {
    draft: "draft",
    active: "active",
    paused: "paused",
    completed: "completed",
    archived: "archived",
  },
}));

vi.mock("../utils/validateStartIsInFuture", () => ({
  validateStartIsInFuture: vi.fn(() => ({
    dateError: "",
    timeError: "",
  })),
}));

vi.mock("../utils/validateEndIsAfterStart", () => ({
  validateEndIsAfterStart: vi.fn(() => ({
    dateError: "",
    timeError: "",
  })),
}));

vi.mock("../utils/validateMaxUsers", () => ({
  validateMaxUsers: vi.fn(() => ""),
}));

vi.mock("../utils/localDateTimeToISOString", () => ({
  localDateTimeToISOString: vi.fn(
    (date, time) => `${date}T${time || "00:00"}:00.000Z`,
  ),
}));

vi.mock("../utils/timeSelect", () => ({
  TimeSelect: ({ id, label, value, onChange, disabled }) => (
    <label>
      {label}
      <select
        data-testid={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">--</option>
        <option value="08:00">08:00</option>
        <option value="12:00">12:00</option>
        <option value="23:59">23:59</option>
      </select>
    </label>
  ),
}));

import EditExperiment from "../routes/app.experiments.$id.jsx";

function makeLoaderData(overrides = {}) {
  const experimentOverrides = overrides.experiment || {};

  return {
    shop: "test-shop.myshopify.com",
    appHandle: "ab-insightful-1",
    experiment: {
      id: 1,
      status: "draft",
      name: "My Experiment",
      description: "Experiment description",
      controlSectionId: "control-section",
      variants: [{ sectionId: "variant-a-section", trafficAllocation: 50 }],
      startDate: "2099-01-01",
      startTime: "08:00",
      endDate: "",
      endTime: "",
      endCondition: "manual",
      goal: "completedCheckout",
      probabilityToBeBest: null,
      duration: null,
      timeUnit: "days",
      maxUsers: null,
      maxUsersPerExperiment: 10000,
      userCount: 123,
      effectiveMax: 10000,
      ...experimentOverrides,
    },
  };
}

describe("app.experiments.$id integration-ish flows", () => {
  const originalClipboard = navigator.clipboard;
  const originalShopify = window.shopify;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFetcher = {
      state: "idle",
      data: null,
      submit: mockSubmit,
    };

    mockSearch = "";
    mockLoaderData = makeLoaderData();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    window.shopify = {
      navigation: {
        navigate: vi.fn(),
      },
      toast: {
        show: vi.fn(),
      },
    };

    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    window.shopify = originalShopify;
  });

  it("renders loaded experiment data across aside and form", () => {
    mockLoaderData = {
        shop: "test-shop.myshopify.com",
        appHandle: "ab-insightful-1",
        experiment: {
        id: 1,
        status: "active",
        name: "Integrated Experiment",
        description: "Integration style test",
        controlSectionId: "control-section",
        variants: [
            { sectionId: "variant-a-section", trafficAllocation: 30 },
            { sectionId: "variant-b-section", trafficAllocation: 20 },
        ],
        startDate: "2099-01-01",
        startTime: "08:00",
        endDate: "",
        endTime: "",
        endCondition: "manual",
        goal: "completedCheckout",
        probabilityToBeBest: null,
        duration: null,
        timeUnit: "days",
        maxUsers: null,
        maxUsersPerExperiment: 10000,
        userCount: 123,
        effectiveMax: 10000,
        },
    };

    const { container } = render(<EditExperiment />);

    expect(container.querySelector('[slot="aside"]')?.textContent).toContain(
        "2 Variations",
    );
    expect(
        container
        .querySelector('s-text-area[label="Experiment Description"]')
        ?.getAttribute("value"),
    ).toBe("Integration style test");
    expect(container.querySelector('[slot="aside"]')?.textContent).toContain(
        "Active",
    );
    });

  it("flows from draft popover start action into fetcher success revalidation", async () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "draft" },
    });

    const { rerender, container } = render(<EditExperiment />);

    const popover = container.querySelector("#status-popover-1");
    const startButton = Array.from(popover?.querySelectorAll("button") || []).find(
      (el) => (el.textContent || "").trim() === "Start",
    );

    expect(startButton).toBeTruthy();
    fireEvent.click(startButton);

    expect(mockSubmit).toHaveBeenCalledWith(
      { intent: "start" },
      { method: "post" },
    );

    mockFetcher = {
      state: "idle",
      data: { ok: true, action: "active" },
      submit: mockSubmit,
    };

    rerender(<EditExperiment />);

    await waitFor(() => {
      expect(mockRevalidate).toHaveBeenCalled();
    });
  });

  it("flows from completed popover archive action into submit", () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "completed" },
    });

    const { container } = render(<EditExperiment />);
    const popover = container.querySelector("#status-popover-1");
    const archiveButton = Array.from(popover?.querySelectorAll("button") || []).find(
      (el) => (el.textContent || "").trim() === "Archive",
    );

    expect(archiveButton).toBeTruthy();
    fireEvent.click(archiveButton);

    expect(mockSubmit).toHaveBeenCalledWith(
      { intent: "archive" },
      { method: "post" },
    );
  });

  it("submits save draft with stable success probability loaded state", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        status: "draft",
        endCondition: "stableSuccessProbability",
        probabilityToBeBest: 80,
        duration: 7,
        timeUnit: "days",
      },
    });

    render(<EditExperiment />);

    fireEvent.click(screen.getAllByText("Save Draft")[0]);

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const [formArg, optionsArg] = mockSubmit.mock.calls[0];

    expect(formArg).toBeInstanceOf(FormData);
    expect(optionsArg).toEqual({ method: "POST" });
    expect(formArg.get("endCondition")).toBe("stableSuccessProbability");
    expect(formArg.get("probabilityToBeBest")).toBe("80");
    expect(formArg.get("duration")).toBe("7");
    expect(formArg.get("timeUnit")).toBe("days");
  });

  it("renders archived rename-only mode while still allowing save submission", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        status: "archived",
        name: "Archived Experiment",
      },
    });

    const { container } = render(<EditExperiment />);

    expect(
      container.querySelector('s-text-field[label="Experiment Name"]')?.getAttribute("disabled"),
    ).toBe("false");
    expect(
      container.querySelector('s-text-area[label="Experiment Description"]')?.getAttribute("disabled"),
    ).toBe("true");

    fireEvent.click(screen.getAllByText("Save Draft")[0]);

    expect(mockSubmit).toHaveBeenCalledWith(
      { name: "Archived Experiment" },
      { method: "POST" },
    );
  });

  it("renders newly-created success banner with report navigation action", () => {
    mockSearch = "isNewlyCreated=true";
    mockLoaderData = makeLoaderData({
      experiment: { status: "draft" },
    });

    const { container } = render(<EditExperiment />);
    const banner = container.querySelector('s-banner[tone="success"]');

    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("Start Experiment");
    expect(banner?.textContent).toContain("Copy Experiment Link");
    expect(banner?.textContent).toContain("Copy Reports Link");
    expect(banner?.textContent).toContain("Navigate to Reports");
  });

  it("flows from active popover pause action into fetcher success revalidation", async () => {
    mockLoaderData = makeLoaderData({
        experiment: { status: "active" },
    });

    const { rerender, container } = render(<EditExperiment />);

    const popover = container.querySelector("#status-popover-1");
    const pauseButton = Array.from(popover?.querySelectorAll("button") || []).find(
        (el) => (el.textContent || "").trim() === "Pause",
    );

    expect(pauseButton).toBeTruthy();
    fireEvent.click(pauseButton);

    expect(mockSubmit).toHaveBeenCalledWith(
        { intent: "pause" },
        { method: "post" },
    );

    mockFetcher = {
        state: "idle",
        data: { ok: true, action: "paused" },
        submit: mockSubmit,
    };

    rerender(<EditExperiment />);

    await waitFor(() => {
        expect(mockRevalidate).toHaveBeenCalled();
    });
    });

    it("flows from paused popover resume action into fetcher success revalidation", async () => {
    mockLoaderData = makeLoaderData({
        experiment: { status: "paused" },
    });

    const { rerender, container } = render(<EditExperiment />);

    const popover = container.querySelector("#status-popover-1");
    const resumeButton = Array.from(popover?.querySelectorAll("button") || []).find(
        (el) => (el.textContent || "").trim() === "Resume",
    );

    expect(resumeButton).toBeTruthy();
    fireEvent.click(resumeButton);

    expect(mockSubmit).toHaveBeenCalledWith(
        { intent: "resume" },
        { method: "post" },
    );

    mockFetcher = {
        state: "idle",
        data: { ok: true, action: "active" },
        submit: mockSubmit,
    };

    rerender(<EditExperiment />);

    await waitFor(() => {
        expect(mockRevalidate).toHaveBeenCalled();
    });
    });

    it("flows from active popover end action into submit", () => {
    mockLoaderData = makeLoaderData({
        experiment: { status: "active" },
    });

    const { container } = render(<EditExperiment />);
    const popover = container.querySelector("#status-popover-1");
    const endButton = Array.from(popover?.querySelectorAll("button") || []).find(
        (el) => (el.textContent || "").trim() === "End",
    );

    expect(endButton).toBeTruthy();
    fireEvent.click(endButton);

    expect(mockSubmit).toHaveBeenCalledWith(
        { intent: "end" },
        { method: "post" },
    );
    });

    it("flows from paused popover end action into submit", () => {
    mockLoaderData = makeLoaderData({
        experiment: { status: "paused" },
    });

    const { container } = render(<EditExperiment />);
    const popover = container.querySelector("#status-popover-1");
    const endButton = Array.from(popover?.querySelectorAll("button") || []).find(
        (el) => (el.textContent || "").trim() === "End",
    );

    expect(endButton).toBeTruthy();
    fireEvent.click(endButton);

    expect(mockSubmit).toHaveBeenCalledWith(
        { intent: "end" },
        { method: "post" },
    );
    });

    it("flows from active popover archive action into submit", () => {
    mockLoaderData = makeLoaderData({
        experiment: { status: "active" },
    });

    const { container } = render(<EditExperiment />);
    const popover = container.querySelector("#status-popover-1");
    const archiveButton = Array.from(popover?.querySelectorAll("button") || []).find(
        (el) => (el.textContent || "").trim() === "Archive",
    );

    expect(archiveButton).toBeTruthy();
    fireEvent.click(archiveButton);

    expect(mockSubmit).toHaveBeenCalledWith(
        { intent: "archive" },
        { method: "post" },
    );
    });

    it("flows from paused popover archive action into submit", () => {
    mockLoaderData = makeLoaderData({
        experiment: { status: "paused" },
    });

    const { container } = render(<EditExperiment />);
    const popover = container.querySelector("#status-popover-1");
    const archiveButton = Array.from(popover?.querySelectorAll("button") || []).find(
        (el) => (el.textContent || "").trim() === "Archive",
    );

    expect(archiveButton).toBeTruthy();
    fireEvent.click(archiveButton);

    expect(mockSubmit).toHaveBeenCalledWith(
        { intent: "archive" },
        { method: "post" },
    );
    });

    it("submits save draft with end date loaded state", () => {
    mockLoaderData = makeLoaderData({
        experiment: {
        status: "draft",
        endCondition: "endDate",
        endDate: "2099-03-03",
        endTime: "23:59",
        },
    });

    render(<EditExperiment />);

    fireEvent.click(screen.getAllByText("Save Draft")[0]);

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const [formArg, optionsArg] = mockSubmit.mock.calls[0];

    expect(formArg).toBeInstanceOf(FormData);
    expect(optionsArg).toEqual({ method: "POST" });
    expect(formArg.get("endCondition")).toBe("endDate");
    expect(formArg.get("endDate")).toBe("2099-03-03");
    });

    it("submits save draft with custom max users loaded state", () => {
    mockLoaderData = makeLoaderData({
        experiment: {
        status: "draft",
        maxUsers: 2500,
        effectiveMax: 2500,
        },
    });

    render(<EditExperiment />);

    fireEvent.click(screen.getAllByText("Save Draft")[0]);

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const [formArg, optionsArg] = mockSubmit.mock.calls[0];

    expect(formArg).toBeInstanceOf(FormData);
    expect(optionsArg).toEqual({ method: "POST" });
    expect(formArg.get("maxUsers")).toBe("2500");
    });

    it("submits save draft with no control section id loaded state", () => {
    mockLoaderData = makeLoaderData({
        experiment: {
        status: "draft",
        controlSectionId: "",
        },
    });

    render(<EditExperiment />);

    fireEvent.click(screen.getAllByText("Save Draft")[0]);

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const [formArg] = mockSubmit.mock.calls[0];

    expect(formArg.get("controlSectionId")).toBe("");
    });

    it("does not revalidate when fetcher returns a non-refresh action after rerender", async () => {
    mockLoaderData = makeLoaderData({
        experiment: { status: "draft" },
    });

    const { rerender } = render(<EditExperiment />);

    mockFetcher = {
        state: "idle",
        data: { ok: true, action: "deleteExperiment" },
        submit: mockSubmit,
    };

    rerender(<EditExperiment />);

    await waitFor(() => {
        expect(mockRevalidate).not.toHaveBeenCalled();
    });
    });
});