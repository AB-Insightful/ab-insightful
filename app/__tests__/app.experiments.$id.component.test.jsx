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

describe("app.experiments.$id component", () => {
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

  it("copies experiment and report links from the success banner", async () => {
    mockSearch = "isNewlyCreated=true";

    render(<EditExperiment />);

    fireEvent.click(screen.getByText("Copy Experiment Link"));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://admin.shopify.com/store/test-shop/apps/ab-insightful-1/app/experiments/1",
      );
    });

    fireEvent.click(screen.getByText("Copy Reports Link"));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://admin.shopify.com/store/test-shop/apps/ab-insightful-1/app/reports/1",
      );
    });

    expect(window.shopify.toast.show).toHaveBeenCalledWith(
      "Experiment link copied!",
    );
    expect(window.shopify.toast.show).toHaveBeenCalledWith(
      "Report link copied!",
    );
  });

  it("submits start from the success banner when experiment is draft", () => {
    mockSearch = "isNewlyCreated=true";
    mockLoaderData = makeLoaderData({
      experiment: { status: "draft" },
    });

    render(<EditExperiment />);

    fireEvent.click(screen.getByText("Start Experiment"));

    expect(mockSubmit).toHaveBeenCalledWith(
      { intent: "start" },
      { method: "post" },
    );
  });

  it("does not revalidate when fetcher action is not one of the refresh statuses", async () => {
    mockFetcher = {
      state: "idle",
      data: { ok: true, action: "deleteExperiment" },
      submit: mockSubmit,
    };

    render(<EditExperiment />);

    await waitFor(() => {
      expect(mockRevalidate).not.toHaveBeenCalled();
    });
  });

  it("submits save draft with form data in draft mode", async () => {
    mockLoaderData = makeLoaderData({
      experiment: {
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
      },
    });

    render(<EditExperiment />);

    fireEvent.click(screen.getAllByText("Save Draft")[0]);

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const [formArg, optionsArg] = mockSubmit.mock.calls[0];

    expect(formArg).toBeInstanceOf(FormData);
    expect(optionsArg).toEqual({ method: "POST" });
    expect(formArg.get("name")).toBe("My Experiment");
    expect(formArg.get("description")).toBe("Experiment description");
    expect(formArg.get("controlSectionId")).toBe("control-section");
    expect(formArg.get("goal")).toBe("completedCheckout");
    expect(formArg.get("endCondition")).toBe("manual");
  });

  it("submits rename only when experiment is locked", async () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        status: "archived",
        name: "Locked Experiment",
      },
    });

    render(<EditExperiment />);

    fireEvent.click(screen.getAllByText("Save Draft")[0]);

    expect(mockSubmit).toHaveBeenCalledWith(
      { name: "Locked Experiment" },
      { method: "POST" },
    );
  });

  it("switches from manual to end date and then to stable success probability", async () => {
    const { container } = render(<EditExperiment />);

    fireEvent.click(screen.getByText("End date"));

    await waitFor(() => {
      expect(
        container.querySelector('s-date-field[label="End Date"]'),
      ).toBeTruthy();
      expect(screen.getByTestId("endTimeSelect")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Stable success probability"));

    await waitFor(() => {
      expect(
        container.querySelector(
          's-number-field[label="Probability to be the best greater than"]',
        ),
      ).toBeTruthy();
      expect(
        container.querySelector('s-number-field[label="For at least"]'),
      ).toBeTruthy();
      expect(
        container.querySelector('s-select[label="Time Unit"]'),
      ).toBeTruthy();
    });
  });

  it("clears end date controls when switching back to manual", async () => {
    const { container } = render(<EditExperiment />);

    fireEvent.click(screen.getByText("End date"));

    await waitFor(() => {
      expect(
        container.querySelector('s-date-field[label="End Date"]'),
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Manual"));

    await waitFor(() => {
      expect(
        container.querySelector('s-date-field[label="End Date"]'),
      ).toBeNull();
    });
  });

  it("renders archived status without start action in status popover", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        status: "archived",
      },
    });

    const { container } = render(<EditExperiment />);

    const popover = container.querySelector("#status-popover-1");
    expect(popover).toBeTruthy();
    expect(popover.textContent).not.toContain("Start");
  });

  it("renders draft status with start and delete actions in status popover", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        status: "draft",
      },
    });

    const { container } = render(<EditExperiment />);

    const popover = container.querySelector("#status-popover-1");
    expect(popover).toBeTruthy();
    expect(popover.textContent).toContain("Start");
    expect(popover.textContent).toContain("Delete");
  });

  it("disables rename field when canRenameExperiment returns false", async () => {
    const policy = await import("../routes/policies/experimentPolicy");
    vi.mocked(policy.canRenameExperiment).mockReturnValue(false);

    const { container } = render(<EditExperiment />);

    const nameField = container.querySelector(
      's-text-field[label="Experiment Name"]',
    );
    expect(nameField).toBeTruthy();
    expect(nameField?.getAttribute("disabled")).toBe("true");
  });

  it("prepopulates multiple variants from loader data", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        variants: [
          { sectionId: "variant-a-section", trafficAllocation: 30 },
          { sectionId: "variant-b-section", trafficAllocation: 20 },
        ],
      },
    });

    const { container } = render(<EditExperiment />);

    const headings = Array.from(container.querySelectorAll("s-heading")).map(
      (el) => el.textContent,
    );

    expect(headings.some((t) => t?.includes("Variant A"))).toBe(true);
    expect(headings.some((t) => t?.includes("Variant B"))).toBe(true);
  });

  it("disables save draft while fetcher is submitting", () => {
    mockFetcher = {
      state: "submitting",
      data: null,
      submit: mockSubmit,
    };

    render(<EditExperiment />);

    const saveButtons = screen.getAllByText("Save Draft");
    expect(saveButtons.length).toBeGreaterThan(0);

    expect(saveButtons[0].getAttribute("disabled")).toBe("true");
  });

  it("shows the correct banner action label for active experiments", () => {
    mockSearch = "isNewlyCreated=true";
    mockLoaderData = makeLoaderData({
      experiment: { status: "active" },
    });

    const { container } = render(<EditExperiment />);
    const banner = container.querySelector('s-banner[tone="success"]');

    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("Pause");
    expect(banner?.textContent).not.toContain("Start Experiment");
  });

  it("shows the correct banner action label for paused experiments", () => {
    mockSearch = "isNewlyCreated=true";
    mockLoaderData = makeLoaderData({
      experiment: { status: "paused" },
    });

    const { container } = render(<EditExperiment />);
    const banner = container.querySelector('s-banner[tone="success"]');

    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("Resume");
    expect(banner?.textContent).not.toContain("Start Experiment");
  });

  it("disables structure and schedule fields when experiment is archived", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        status: "archived",
      },
    });

    const { container } = render(<EditExperiment />);

    expect(
      container.querySelector('s-text-area[label="Experiment Description"]')?.getAttribute("disabled"),
    ).toBe("true");
    expect(
      container.querySelector('s-text-field[label="Section ID to be tested"]')?.getAttribute("disabled"),
    ).toBe("true");
    expect(
      container.querySelector('s-date-field[label="Start Date"]')?.getAttribute("disabled"),
    ).toBe("true");
  });

  it("locks structure but leaves schedule editable when experiment is active", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        status: "active",
      },
    });

    const { container } = render(<EditExperiment />);

    expect(
      container.querySelector('s-text-area[label="Experiment Description"]')?.getAttribute("disabled"),
    ).toBe("false");
    expect(
      container.querySelector('s-text-field[label="Section ID to be tested"]')?.getAttribute("disabled"),
    ).toBe("true");
    expect(
      container.querySelector('button[accessibilitylabel="Add variant"]')?.getAttribute("disabled"),
    ).toBe("true");
    expect(
      container.querySelector('button[accessibilitylabel="Remove variant"]')?.getAttribute("disabled"),
    ).toBe("true");
  });

  it("adds and removes variants through the variant action buttons", async () => {
    const { container } = render(<EditExperiment />);

    const getVariantHeadings = () =>
      Array.from(container.querySelectorAll("s-heading")).filter((el) =>
        (el.textContent || "").includes("Variant"),
      );

    expect(getVariantHeadings().length).toBe(1);

    fireEvent.click(screen.getByText("Add Another Variant"));

    await waitFor(() => {
      expect(getVariantHeadings().length).toBe(2);
    });

    fireEvent.click(screen.getByText("Remove Variant"));

    await waitFor(() => {
      expect(getVariantHeadings().length).toBe(1);
    });
  });

  it("runs start time change handling through the mocked time select", async () => {
    render(<EditExperiment />);

    const startTimeSelect = screen.getByTestId("startTimeSelect");
    fireEvent.change(startTimeSelect, { target: { value: "12:00" } });

    await waitFor(() => {
      expect(startTimeSelect).toHaveValue("12:00");
    });
  });

  it("runs end time change handling through the mocked time select", async () => {
    render(<EditExperiment />);

    fireEvent.click(screen.getByText("End date"));

    const endTimeSelect = await waitFor(() => screen.getByTestId("endTimeSelect"));

    fireEvent.change(endTimeSelect, { target: { value: "23:59" } });

    await waitFor(() => {
      expect(endTimeSelect).toHaveValue("23:59");
    });
  });

  it("applies mocked start date validation errors when start time changes", async () => {
    const startValidation = await import("../utils/validateStartIsInFuture");
    vi.mocked(startValidation.validateStartIsInFuture).mockReturnValue({
      dateError: "Bad start date",
      timeError: "Bad start time",
    });

    const { container } = render(<EditExperiment />);
    const startTimeSelect = screen.getByTestId("startTimeSelect");
    const startDateField = container.querySelector(
      's-date-field[label="Start Date"]',
    );

    fireEvent.change(startTimeSelect, { target: { value: "12:00" } });

    await waitFor(() => {
      expect(startDateField?.getAttribute("error")).toBe("Bad start date");
    });
  });

  it("shows the correct banner action label for draft experiments", () => {
    mockSearch = "isNewlyCreated=true";
    mockLoaderData = makeLoaderData({
      experiment: { status: "draft" },
    });

    const { container } = render(<EditExperiment />);
    const banner = container.querySelector('s-banner[tone="success"]');

    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("Start Experiment");
  });

  it("renders completed status without draft-only actions in the status popover", () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "completed" },
    });

    const { container } = render(<EditExperiment />);

    const popover = container.querySelector("#status-popover-1");
    expect(popover).toBeTruthy();
    expect(popover?.textContent).not.toContain("Start");
    expect(popover?.textContent).not.toContain("Pause");
    expect(popover?.textContent).not.toContain("Resume");
    expect(popover?.textContent).not.toContain("Delete");
    expect(popover?.textContent).toContain("Archive");
  });

  it("keeps schedule controls enabled for paused experiments", () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "paused" },
    });

    const { container } = render(<EditExperiment />);

    expect(
      container.querySelector('s-text-area[label="Experiment Description"]')?.getAttribute("disabled"),
    ).toBe("false");
    expect(
      container.querySelector('button[accessibilitylabel="Add variant"]')?.getAttribute("disabled"),
    ).toBe("true");
    expect(
      container.querySelector('button[accessibilitylabel="Remove variant"]')?.getAttribute("disabled"),
    ).toBe("true");
  });

  it("submits delete from the status popover when experiment is draft", () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "draft" },
    });

    render(<EditExperiment />);

    fireEvent.click(screen.getByText("Delete"));

    expect(mockSubmit).toHaveBeenCalledWith(
      { intent: "delete" },
      { method: "post" },
    );
  });

  it("submits pause from the status popover when experiment is active", () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "active" },
    });

    const { container } = render(<EditExperiment />);
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
  });

  it("submits resume from the status popover when experiment is paused", () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "paused" },
    });

    const { container } = render(<EditExperiment />);
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
  });

  it("submits archive from the status popover when experiment is completed", () => {
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

  it("revalidates when fetcher returns a refresh-worthy action", async () => {
    mockFetcher = {
      state: "idle",
      data: { ok: true, action: "active" },
      submit: mockSubmit,
    };

    render(<EditExperiment />);

    await waitFor(() => {
      expect(mockRevalidate).toHaveBeenCalled();
    });
  });

  it("renders the reports breadcrumb link for the current experiment", () => {
    const { container } = render(<EditExperiment />);

    const reportLink = container.querySelector('s-link[slot="breadcrumb-actions"]');
    expect(reportLink).toBeTruthy();
    expect(reportLink?.getAttribute("href")).toBe("/app/reports/1");
  });

  it("renders a navigate to reports action in the success banner", () => {
    mockSearch = "isNewlyCreated=true";

    const { container } = render(<EditExperiment />);
    const banner = container.querySelector('s-banner[tone="success"]');

    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("Navigate to Reports");

    const reportButton = Array.from(banner?.querySelectorAll("button") || []).find(
      (el) => (el.textContent || "").includes("Navigate to Reports"),
    );

    expect(reportButton).toBeTruthy();
    expect(reportButton?.getAttribute("href")).toBe(
      "https://admin.shopify.com/store/test-shop/apps/ab-insightful-1/app/reports/1",
    );
  });

  it("renders the active status badge text", () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "active" },
    });

    const { container } = render(<EditExperiment />);
    const aside = container.querySelector('[slot="aside"]');

    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain("Active");
  });

  it("renders the paused status badge text", () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "paused" },
    });

    const { container } = render(<EditExperiment />);
    const aside = container.querySelector('[slot="aside"]');

    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain("Paused");
  });

  it("renders the completed status badge text", () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "completed" },
    });

    const { container } = render(<EditExperiment />);
    const aside = container.querySelector('[slot="aside"]');

    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain("Completed");
  });

  it("marks manual as the active end condition by default", () => {
    const { container } = render(<EditExperiment />);

    const manualButton = Array.from(container.querySelectorAll("button")).find(
      (el) => (el.textContent || "").trim() === "Manual",
    );
    const endDateButton = Array.from(container.querySelectorAll("button")).find(
      (el) => (el.textContent || "").trim() === "End date",
    );
    const stableButton = Array.from(container.querySelectorAll("button")).find(
      (el) => (el.textContent || "").trim() === "Stable success probability",
    );

    expect(manualButton?.getAttribute("variant")).toBe("primary");
    expect(endDateButton?.getAttribute("variant")).toBe("secondary");
    expect(stableButton?.getAttribute("variant")).toBe("secondary");
  });

  it("switches the active end condition button to end date", async () => {
    const { container } = render(<EditExperiment />);

    const endDateButton = Array.from(container.querySelectorAll("button")).find(
      (el) => (el.textContent || "").trim() === "End date",
    );
    expect(endDateButton).toBeTruthy();

    fireEvent.click(endDateButton);

    await waitFor(() => {
      expect(endDateButton?.getAttribute("variant")).toBe("primary");
    });
  });

  it("switches the active end condition button to stable success probability", async () => {
    const { container } = render(<EditExperiment />);

    const stableButton = Array.from(container.querySelectorAll("button")).find(
      (el) => (el.textContent || "").trim() === "Stable success probability",
    );
    expect(stableButton).toBeTruthy();

    fireEvent.click(stableButton);

    await waitFor(() => {
      expect(stableButton?.getAttribute("variant")).toBe("primary");
    });
  });

  it("keeps draft structure and schedule fields editable", () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "draft" },
    });

    const { container } = render(<EditExperiment />);

    expect(
      container
        .querySelector('s-text-area[label="Experiment Description"]')
        ?.getAttribute("disabled"),
    ).toBe("false");
    expect(
      container
        .querySelector('s-text-field[label="Section ID to be tested"]')
        ?.getAttribute("disabled"),
    ).toBe("false");
    expect(
      container
        .querySelector('s-date-field[label="Start Date"]')
        ?.getAttribute("disabled"),
    ).toBe("false");
    expect(
      container
        .querySelector('button[accessibilitylabel="Add variant"]')
        ?.getAttribute("disabled"),
    ).toBe("false");
  });

  it("updates the aside summary when multiple variants are loaded", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        variants: [
          { sectionId: "variant-a-section", trafficAllocation: 30 },
          { sectionId: "variant-b-section", trafficAllocation: 20 },
        ],
      },
    });

    const { container } = render(<EditExperiment />);
    const aside = container.querySelector('[slot="aside"]');

    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain("2 Variations");
    expect(aside?.textContent).toContain("30");
    expect(aside?.textContent).toContain("20");
  });

  it("renders the archived status badge text", () => {
    mockLoaderData = makeLoaderData({
      experiment: { status: "archived" },
    });

    const { container } = render(<EditExperiment />);
    const aside = container.querySelector('[slot="aside"]');

    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain("Archived");
  });

  it("renders the correct goal badge text for viewed page", () => {
    mockLoaderData = makeLoaderData({
      experiment: { goal: "viewPage" },
    });

    const { container } = render(<EditExperiment />);
    const aside = container.querySelector('[slot="aside"]');

    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain("View Page");
  });

  it("renders the correct goal badge text for started checkout", () => {
    mockLoaderData = makeLoaderData({
      experiment: { goal: "startCheckout" },
    });

    const { container } = render(<EditExperiment />);
    const aside = container.querySelector('[slot="aside"]');

    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain("Start Checkout");
  });

  it("renders custom max users in the aside summary when maxUsers is set", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        maxUsers: 2500,
        effectiveMax: 2500,
      },
    });

    const { container } = render(<EditExperiment />);
    const aside = container.querySelector('[slot="aside"]');

    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain("123");
    expect(aside?.textContent).toContain("2,500");
  });

  it("renders account default max users in the aside summary when no custom maxUsers is set", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        maxUsers: null,
        effectiveMax: 10000,
      },
    });

    const { container } = render(<EditExperiment />);
    const aside = container.querySelector('[slot="aside"]');

    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain("10,000");
  });

  it("renders single variation summary text for one variant", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        variants: [{ sectionId: "variant-a-section", trafficAllocation: 50 }],
      },
    });

    const { container } = render(<EditExperiment />);
    const aside = container.querySelector('[slot="aside"]');

    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain("Single Variation");
  });

  it("renders control allocation summary based on remaining traffic", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        variants: [
          { sectionId: "variant-a-section", trafficAllocation: 30 },
          { sectionId: "variant-b-section", trafficAllocation: 20 },
        ],
      },
    });

    const { container } = render(<EditExperiment />);
    const page = container.querySelector('[data-s-page="true"]');

    expect(page).toBeTruthy();
    expect(page?.textContent).toContain("50");
    expect(page?.textContent).toContain("Control allocation");
  });

  it("renders the discard footer button with the experiments href", () => {
    const { container } = render(<EditExperiment />);

    const discardButtons = Array.from(container.querySelectorAll("button")).filter(
      (el) => (el.textContent || "").trim() === "Discard",
    );

    expect(discardButtons.length).toBeGreaterThan(0);
    expect(discardButtons[0].getAttribute("href")).toBe("/app/experiments");
  });

  it("renders the primary save action button in the page header", () => {
    const { container } = render(<EditExperiment />);

    const headerSaveButton = container.querySelector(
      'button[slot="primary-action"]',
    );

    expect(headerSaveButton).toBeTruthy();
    expect(headerSaveButton?.textContent).toContain("Save Draft");
  });

  it("renders the secondary discard action button in the page header", () => {
    const { container } = render(<EditExperiment />);

    const headerDiscardButton = container.querySelector(
      'button[slot="secondary-actions"]',
    );

    expect(headerDiscardButton).toBeTruthy();
    expect(headerDiscardButton?.textContent).toContain("Discard");
  });

  it("renders the success banner report button href correctly", () => {
    mockSearch = "isNewlyCreated=true";

    const { container } = render(<EditExperiment />);
    const buttons = Array.from(container.querySelectorAll("button"));
    const navigateButton = buttons.find((el) =>
      (el.textContent || "").includes("Navigate to Reports"),
    );

    expect(navigateButton).toBeTruthy();
    expect(navigateButton?.getAttribute("href")).toBe(
      "https://admin.shopify.com/store/test-shop/apps/ab-insightful-1/app/reports/1",
    );
  });

  it("renders the success banner only when isNewlyCreated is present", () => {
    mockSearch = "";

    const { container } = render(<EditExperiment />);
    const banner = container.querySelector('s-banner[tone="success"]');

    expect(banner).toBeNull();
  });

  it("renders the experiment goal select with the loaded goal value", () => {
    mockLoaderData = makeLoaderData({
      experiment: { goal: "startCheckout" },
    });

    const { container } = render(<EditExperiment />);
    const goalSelect = container.querySelector('s-select[label="Experiment Goal"]');

    expect(goalSelect).toBeTruthy();
    expect(goalSelect?.getAttribute("value")).toBe("startCheckout");
  });

  it("renders the customer segment select with the default all segments value", () => {
    const { container } = render(<EditExperiment />);
    const segmentSelect = container.querySelector(
      's-select[label="Customer segment to test"]',
    );

    expect(segmentSelect).toBeTruthy();
    expect(segmentSelect?.getAttribute("value")).toBe("allSegments");
  });

  it("renders the control section id field when a control section id exists", () => {
    mockLoaderData = makeLoaderData({
      experiment: { controlSectionId: "control-section" },
    });

    const { container } = render(<EditExperiment />);
    const controlField = container.querySelector(
      's-text-field[label="Control Section ID"]',
    );

    expect(controlField).toBeTruthy();
    expect(controlField?.getAttribute("value")).toBe("control-section");
  });

  it("does not render the control section id field when no control section id exists", () => {
    mockLoaderData = makeLoaderData({
      experiment: { controlSectionId: "" },
    });

    const { container } = render(<EditExperiment />);
    const controlField = container.querySelector(
      's-text-field[label="Control Section ID"]',
    );

    expect(controlField).toBeNull();
  });

  it("renders the use account default max users checkbox as checked when maxUsers is null", () => {
    mockLoaderData = makeLoaderData({
      experiment: { maxUsers: null },
    });

    const { container } = render(<EditExperiment />);
    const checkbox = container.querySelector(
      's-checkbox[label="Use account default max users"]',
    );

    expect(checkbox).toBeTruthy();
    expect(checkbox?.getAttribute("checked")).toBe("true");
  });

  it("renders the use account default max users checkbox as unchecked when maxUsers is set", () => {
    mockLoaderData = makeLoaderData({
      experiment: { maxUsers: 2500, effectiveMax: 2500 },
    });

    const { container } = render(<EditExperiment />);
    const checkbox = container.querySelector(
      's-checkbox[label="Use account default max users"]',
    );

    expect(checkbox).toBeTruthy();
    expect(checkbox?.getAttribute("checked")).toBe("false");
  });

  it("renders the start date field with the loaded value", () => {
    mockLoaderData = makeLoaderData({
      experiment: { startDate: "2099-02-02" },
    });

    const { container } = render(<EditExperiment />);
    const startDateField = container.querySelector(
      's-date-field[label="Start Date"]',
    );

    expect(startDateField).toBeTruthy();
    expect(startDateField?.getAttribute("value")).toBe("2099-02-02");
  });

  it("renders the start time select with the loaded value", () => {
    mockLoaderData = makeLoaderData({
      experiment: { startTime: "12:00" },
    });

    render(<EditExperiment />);

    const startTimeSelect = screen.getByTestId("startTimeSelect");
    expect(startTimeSelect).toHaveValue("12:00");
  });

  it("renders end date mode from loaded data", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        endCondition: "endDate",
        endDate: "2099-03-03",
        endTime: "23:59",
      },
    });

    const { container } = render(<EditExperiment />);

    const endDateField = container.querySelector('s-date-field[label="End Date"]');
    const manualButton = Array.from(container.querySelectorAll("button")).find(
      (el) => (el.textContent || "").trim() === "Manual",
    );
    const endDateButton = Array.from(container.querySelectorAll("button")).find(
      (el) => (el.textContent || "").trim() === "End date",
    );

    expect(endDateField).toBeTruthy();
    expect(endDateField?.getAttribute("value")).toBe("2099-03-03");
    expect(screen.getByTestId("endTimeSelect")).toHaveValue("23:59");
    expect(manualButton?.getAttribute("variant")).toBe("secondary");
    expect(endDateButton?.getAttribute("variant")).toBe("primary");
  });

  it("renders stable success probability mode from loaded data", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        endCondition: "stableSuccessProbability",
        probabilityToBeBest: 80,
        duration: 7,
        timeUnit: "days",
      },
    });

    const { container } = render(<EditExperiment />);

    const probabilityField = container.querySelector(
      's-number-field[label="Probability to be the best greater than"]',
    );
    const durationField = container.querySelector(
      's-number-field[label="For at least"]',
    );
    const timeUnitSelect = container.querySelector('s-select[label="Time Unit"]');

    expect(probabilityField).toBeTruthy();
    expect(probabilityField?.getAttribute("value")).toBe("80");
    expect(durationField).toBeTruthy();
    expect(durationField?.getAttribute("value")).toBe("7");
    expect(timeUnitSelect).toBeTruthy();
    expect(timeUnitSelect?.getAttribute("value")).toBe("days");
  });

  it("renders the variant traffic allocation values from loaded data", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        variants: [
          { sectionId: "variant-a-section", trafficAllocation: 30 },
          { sectionId: "variant-b-section", trafficAllocation: 20 },
        ],
      },
    });

    const { container } = render(<EditExperiment />);
    const allocationFields = Array.from(
      container.querySelectorAll('s-number-field[label^="Traffic allocation for Variant"]'),
    );

    expect(allocationFields.length).toBe(2);
    expect(allocationFields[0]?.getAttribute("value")).toBe("30");
    expect(allocationFields[1]?.getAttribute("value")).toBe("20");
  });

  it("submits save draft with end date mode values in the form payload", () => {
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
    expect(formArg.get("endTime")).toBeNull();
  });

  it("submits save draft with stable success probability values in the form payload", () => {
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

  it("submits save draft with custom max users in the form payload", () => {
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
    const [formArg] = mockSubmit.mock.calls[0];

    expect(formArg.get("maxUsers")).toBe("2500");
  });

  it("submits save draft without a control section id when one is not loaded", () => {
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

  it("submits end from the status popover when experiment is active", () => {
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

  it("submits archive from the status popover when experiment is active", () => {
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

  it("submits end from the status popover when experiment is paused", () => {
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

  it("submits archive from the status popover when experiment is paused", () => {
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

  it("renders the success banner with reports action for active newly created experiments", () => {
    mockSearch = "isNewlyCreated=true";
    mockLoaderData = makeLoaderData({
      experiment: { status: "active" },
    });

    const { container } = render(<EditExperiment />);
    const banner = container.querySelector('s-banner[tone="success"]');

    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("Pause");
    expect(banner?.textContent).toContain("Navigate to Reports");
  });

  it("renders the success banner with reports action for paused newly created experiments", () => {
    mockSearch = "isNewlyCreated=true";
    mockLoaderData = makeLoaderData({
      experiment: { status: "paused" },
    });

    const { container } = render(<EditExperiment />);
    const banner = container.querySelector('s-banner[tone="success"]');

    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("Resume");
    expect(banner?.textContent).toContain("Navigate to Reports");
  });

  it("does not render the success banner when isNewlyCreated is not present", () => {
    mockSearch = "";

    const { container } = render(<EditExperiment />);
    const banner = container.querySelector('s-banner[tone="success"]');

    expect(banner).toBeNull();
  });

  it("renders the goal select with the loaded startCheckout value", () => {
    mockLoaderData = makeLoaderData({
      experiment: { goal: "startCheckout" },
    });

    const { container } = render(<EditExperiment />);
    const goalSelect = container.querySelector('s-select[label="Experiment Goal"]');

    expect(goalSelect).toBeTruthy();
    expect(goalSelect?.getAttribute("value")).toBe("startCheckout");
  });

  it("renders the control section field when a control section id exists", () => {
    mockLoaderData = makeLoaderData({
      experiment: { controlSectionId: "control-section" },
    });

    const { container } = render(<EditExperiment />);
    const controlField = container.querySelector(
      's-text-field[label="Control Section ID"]',
    );

    expect(controlField).toBeTruthy();
    expect(controlField?.getAttribute("value")).toBe("control-section");
  });

  it("does not render the control section field when no control section id exists", () => {
    mockLoaderData = makeLoaderData({
      experiment: { controlSectionId: "" },
    });

    const { container } = render(<EditExperiment />);
    const controlField = container.querySelector(
      's-text-field[label="Control Section ID"]',
    );

    expect(controlField).toBeNull();
  });

  it("renders the account default max users checkbox as checked when maxUsers is null", () => {
    mockLoaderData = makeLoaderData({
      experiment: { maxUsers: null },
    });

    const { container } = render(<EditExperiment />);
    const checkbox = container.querySelector(
      's-checkbox[label="Use account default max users"]',
    );

    expect(checkbox).toBeTruthy();
    expect(checkbox?.getAttribute("checked")).toBe("true");
  });

  it("renders the account default max users checkbox as unchecked when maxUsers is set", () => {
    mockLoaderData = makeLoaderData({
      experiment: { maxUsers: 2500, effectiveMax: 2500 },
    });

    const { container } = render(<EditExperiment />);
    const checkbox = container.querySelector(
      's-checkbox[label="Use account default max users"]',
    );

    expect(checkbox).toBeTruthy();
    expect(checkbox?.getAttribute("checked")).toBe("false");
  });

  it("renders the loaded start date value", () => {
    mockLoaderData = makeLoaderData({
      experiment: { startDate: "2099-02-02" },
    });

    const { container } = render(<EditExperiment />);
    const startDateField = container.querySelector(
      's-date-field[label="Start Date"]',
    );

    expect(startDateField).toBeTruthy();
    expect(startDateField?.getAttribute("value")).toBe("2099-02-02");
  });

  it("renders the loaded start time value", () => {
    mockLoaderData = makeLoaderData({
      experiment: { startTime: "12:00" },
    });

    render(<EditExperiment />);

    const startTimeSelect = screen.getByTestId("startTimeSelect");
    expect(startTimeSelect).toHaveValue("12:00");
  });

  it("renders end date mode from loaded data", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        endCondition: "endDate",
        endDate: "2099-03-03",
        endTime: "23:59",
      },
    });

    const { container } = render(<EditExperiment />);

    const endDateField = container.querySelector('s-date-field[label="End Date"]');
    const manualButton = Array.from(container.querySelectorAll("button")).find(
      (el) => (el.textContent || "").trim() === "Manual",
    );
    const endDateButton = Array.from(container.querySelectorAll("button")).find(
      (el) => (el.textContent || "").trim() === "End date",
    );

    expect(endDateField).toBeTruthy();
    expect(endDateField?.getAttribute("value")).toBe("2099-03-03");
    expect(screen.getByTestId("endTimeSelect")).toHaveValue("23:59");
    expect(manualButton?.getAttribute("variant")).toBe("secondary");
    expect(endDateButton?.getAttribute("variant")).toBe("primary");
  });

  it("renders stable success probability mode from loaded data", () => {
    mockLoaderData = makeLoaderData({
      experiment: {
        endCondition: "stableSuccessProbability",
        probabilityToBeBest: 80,
        duration: 7,
        timeUnit: "days",
      },
    });

    const { container } = render(<EditExperiment />);

    const probabilityField = container.querySelector(
      's-number-field[label="Probability to be the best greater than"]',
    );
    const durationField = container.querySelector(
      's-number-field[label="For at least"]',
    );
    const timeUnitSelect = container.querySelector('s-select[label="Time Unit"]');

    expect(probabilityField).toBeTruthy();
    expect(probabilityField?.getAttribute("value")).toBe("80");
    expect(durationField).toBeTruthy();
    expect(durationField?.getAttribute("value")).toBe("7");
    expect(timeUnitSelect).toBeTruthy();
    expect(timeUnitSelect?.getAttribute("value")).toBe("days");
  });
});