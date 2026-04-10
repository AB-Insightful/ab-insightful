/**
 * Reports index: component tests use mocked loader data; loader/action tests mock
 * shopify auth and service modules (no real network or DB).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// mock react-router hooks
vi.mock("react-router", () => ({
  useLoaderData: vi.fn(),
  useFetcher: vi.fn(() => ({
    submit: vi.fn(),
    state: "idle",
    data: null,
  })),
}));

// mock date range context
vi.mock("../contexts/DateRangeContext", () => ({
  useDateRange: vi.fn(() => ({
    dateRange: {},
  })),
}));

// mock child components
vi.mock("../components/DateRangePicker", () => ({
  default: () => <div>DateRangePicker</div>,
}));

vi.mock("../components/SessionsCard.jsx", () => ({
  default: () => <div>SessionsCard</div>,
}));

vi.mock("../components/ConversionsCard.jsx", () => ({
  default: () => <div>ConversionsCard</div>,
}));

vi.mock("../shopify.server", () => ({
  default: {
    authenticate: {
      admin: vi.fn(),
    },
  },
}));

vi.mock("../services/experiment.server", () => ({
  experimentListReport: vi.fn(),
}));

vi.mock("../services/analytics.server", () => ({
  getSessionReportData: vi.fn(),
}));

vi.mock("../services/conversions.server", () => ({
  getConversionsReportData: vi.fn(),
}));

vi.mock("../services/tutorialData.server", () => ({
  getTutorialData: vi.fn(),
  setViewedReportsPage: vi.fn(),
}));

import Reports, { loader, action } from "../routes/app.reports._index";
import { useLoaderData } from "react-router";
import shopify from "../shopify.server";
import { experimentListReport } from "../services/experiment.server";
import { getSessionReportData } from "../services/analytics.server";
import { getConversionsReportData } from "../services/conversions.server";
import {
  getTutorialData,
  setViewedReportsPage,
} from "../services/tutorialData.server";

// helper to grab ordered experiment names from table
function getRenderedNames() {
  return screen
    .getAllByText(/Experiment/)
    .filter((el) => el.closest("s-table-row"))
    .map((el) => el.textContent.trim());
}

describe("Reports page sorting", () => {
  beforeEach(() => {
    useLoaderData.mockReturnValue({
      experiments: [
        {
          id: 1,
          name: "Beta Experiment",
          status: "paused",
          startDate: "2026-03-20T10:00:00Z",
          endDate: null,
          endCondition: "Manual",
          analyses: [{ totalConversions: 20, totalUsers: 100 }],
          createdAt: "2026-03-20T10:00:00Z",
        },
        {
          id: 2,
          name: "Alpha Experiment",
          status: "active",
          startDate: "2026-03-18T10:00:00Z",
          endDate: null,
          endCondition: "Users",
          analyses: [{ totalConversions: 5, totalUsers: 50 }],
          createdAt: "2026-03-18T10:00:00Z",
        },
        {
          id: 3,
          name: "Gamma Experiment",
          status: "completed",
          startDate: "2026-03-22T10:00:00Z",
          endDate: "2026-03-23T10:00:00Z",
          endCondition: "Date",
          analyses: [{ totalConversions: 12, totalUsers: 75 }],
          createdAt: "2026-03-22T10:00:00Z",
        },
      ],
      sessionData: { sessions: [], total: 0 },
      conversionsData: { sessions: [], total: 0 },
      tutorialData: { viewedReportsPage: true },
    });
  });

  it("renders experiment rows", () => {
    render(<Reports />);

    expect(screen.getByText("Alpha Experiment")).toBeInTheDocument();
    expect(screen.getByText("Beta Experiment")).toBeInTheDocument();
    expect(screen.getByText("Gamma Experiment")).toBeInTheDocument();
  });

  it("sorts by name when the header is clicked", () => {
    render(<Reports />);

    const nameHeader = screen.getByRole("button", { name: /experiment name/i });
    fireEvent.click(nameHeader);

    expect(getRenderedNames()).toEqual([
      "Gamma Experiment",
      "Beta Experiment",
      "Alpha Experiment",
    ]);
  });

  it("toggles name sort direction on repeated click", () => {
    render(<Reports />);

    const nameHeader = screen.getByRole("button", { name: /experiment name/i });

    fireEvent.click(nameHeader); // desc
    fireEvent.click(nameHeader); // asc

    expect(getRenderedNames()).toEqual([
      "Alpha Experiment",
      "Beta Experiment",
      "Gamma Experiment",
    ]);
  });

  it("sorts by conversions", () => {
    render(<Reports />);

    const conversionsHeader = screen.getByRole("button", { name: /conversions/i });
    fireEvent.click(conversionsHeader);

    expect(getRenderedNames()).toEqual([
      "Beta Experiment",
      "Gamma Experiment",
      "Alpha Experiment",
    ]);
  });

  it("sorts by status", () => {
    render(<Reports />);

    const statusHeader = screen.getByRole("button", { name: /status/i });
    fireEvent.click(statusHeader);

    expect(getRenderedNames().length).toBe(3);
  });

  it("does not render archived or draft experiments", () => {
    useLoaderData.mockReturnValue({
      experiments: [
        { id: 1, name: "Draft Experiment", status: "draft", analyses: [] },
        { id: 2, name: "Archived Experiment", status: "archived", analyses: [] },
        { id: 3, name: "Active Experiment", status: "active", analyses: [] },
      ],
      sessionData: { sessions: [], total: 0 },
      conversionsData: { sessions: [], total: 0 },
      tutorialData: { viewedReportsPage: true },
    });

    render(<Reports />);

    expect(screen.queryByText("Draft Experiment")).not.toBeInTheDocument();
    expect(screen.queryByText("Archived Experiment")).not.toBeInTheDocument();
    expect(screen.getByText("Active Experiment")).toBeInTheDocument();
  });
});

describe("app.reports._index loader", () => {
  const admin = { graphql: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    shopify.authenticate.admin.mockResolvedValue({ admin });
    experimentListReport.mockResolvedValue([]);
    getSessionReportData.mockResolvedValue({ sessions: [], total: 0 });
    getConversionsReportData.mockResolvedValue({ sessions: [], total: 0 });
    getTutorialData.mockResolvedValue({ viewedReportsPage: true });
  });

  it("authenticates admin and returns experiments, session, conversions, and tutorial data", async () => {
    const experiments = [{ id: 1, name: "A" }];
    const sessionPayload = { sessions: [{ date: "2026-01-01", count: 3 }], total: 3 };
    const conversionsPayload = { sessions: [], total: 0 };
    const tutorialPayload = { viewedReportsPage: false };

    experimentListReport.mockResolvedValue(experiments);
    getSessionReportData.mockResolvedValue(sessionPayload);
    getConversionsReportData.mockResolvedValue(conversionsPayload);
    getTutorialData.mockResolvedValue(tutorialPayload);

    const request = new Request("https://test.example/app/reports");
    const result = await loader({ request });

    expect(shopify.authenticate.admin).toHaveBeenCalledWith(request);
    expect(getSessionReportData).toHaveBeenCalledWith(admin);
    expect(getConversionsReportData).toHaveBeenCalledWith(admin);
    expect(result).toEqual({
      experiments,
      sessionData: sessionPayload,
      conversionsData: conversionsPayload,
      tutorialData: tutorialPayload,
    });
  });

  it("defaults falsy experiments to an empty array", async () => {
    experimentListReport.mockResolvedValue(null);

    const result = await loader({
      request: new Request("https://test.example/app/reports"),
    });

    expect(result.experiments).toEqual([]);
  });

  it("defaults falsy session and conversions payloads to empty shells", async () => {
    getSessionReportData.mockResolvedValue(null);
    getConversionsReportData.mockResolvedValue(null);

    const result = await loader({
      request: new Request("https://test.example/app/reports"),
    });

    expect(result.sessionData).toEqual({ sessions: [], total: 0 });
    expect(result.conversionsData).toEqual({ sessions: [], total: 0 });
  });
});

describe("app.reports._index action", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks tutorial as viewed for intent tutorial_viewed", async () => {
    setViewedReportsPage.mockResolvedValue(undefined);

    const body = new FormData();
    body.set("intent", "tutorial_viewed");
    const request = new Request("https://test.example/app/reports", {
      method: "POST",
      body,
    });

    const result = await action({ request });

    expect(setViewedReportsPage).toHaveBeenCalledWith(1, true);
    expect(result).toEqual({ ok: true, action: "tutorial_viewed" });
  });

  it("returns error payload when setViewedReportsPage throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setViewedReportsPage.mockRejectedValue(new Error("update failed"));

    const body = new FormData();
    body.set("intent", "tutorial_viewed");
    const request = new Request("https://test.example/app/reports", {
      method: "POST",
      body,
    });

    const result = await action({ request });

    expect(console.error).toHaveBeenCalled();
    // Route uses comma operator; runtime return value is the second operand only.
    expect(result).toEqual({ status: 500 });
  });

  it("returns unknown intent for unrecognized intent", async () => {
    const body = new FormData();
    body.set("intent", "something_else");
    const request = new Request("https://test.example/app/reports", {
      method: "POST",
      body,
    });

    const result = await action({ request });

    expect(setViewedReportsPage).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "unknown intent" });
  });
});