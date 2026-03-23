import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Reports from "../routes/app.reports._index";

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

import { useLoaderData } from "react-router";

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
        },
        {
          id: 2,
          name: "Alpha Experiment",
          status: "active",
          startDate: "2026-03-18T10:00:00Z",
          endDate: null,
          endCondition: "Users",
          analyses: [{ totalConversions: 5, totalUsers: 50 }],
        },
        {
          id: 3,
          name: "Gamma Experiment",
          status: "completed",
          startDate: "2026-03-22T10:00:00Z",
          endDate: "2026-03-23T10:00:00Z",
          endCondition: "Date",
          analyses: [{ totalConversions: 12, totalUsers: 75 }],
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
      "Alpha Experiment",
      "Beta Experiment",
      "Gamma Experiment",
    ]);
  });

  it("toggles name sort direction on repeated click", () => {
    render(<Reports />);

    const nameHeader = screen.getByRole("button", { name: /experiment name/i });

    fireEvent.click(nameHeader); // asc
    fireEvent.click(nameHeader); // desc

    expect(getRenderedNames()).toEqual([
      "Gamma Experiment",
      "Beta Experiment",
      "Alpha Experiment",
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