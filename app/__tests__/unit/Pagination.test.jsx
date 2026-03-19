import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useLoaderData } from "react-router";
import Reports from "../../routes/app.reports._index";
import Experimentsindex from "../../routes/app.experiments._index";

// ─── Shared mocks ────────────────────────────────────────────────────────────

vi.mock("react-router", () => ({
  useLoaderData: vi.fn(),
  useFetcher: () => ({ state: "idle", data: null, submit: vi.fn() }),
  useRevalidator: () => ({ revalidate: vi.fn() }),
}));

vi.mock("@prisma/client", () => ({
  ExperimentStatus: {
    active: "active",
    completed: "completed",
    archived: "archived",
    paused: "paused",
    draft: "draft",
  },
}));

vi.mock("../shopify.server", () => ({
  default: { authenticate: { admin: vi.fn() } },
}));

vi.mock("../db.server", () => ({
  default: { experiment: { findMany: vi.fn() } },
}));

vi.mock("../utils/formatRuntime.js", () => ({
  formatRuntime: () => "5 days",
}));

vi.mock("../utils/formatImprovement.js", () => ({
  formatImprovement: () => "N/A",
}));

vi.mock("../components/DateRangePicker", () => ({
  default: () => null,
}));

vi.mock("../components/SessionsCard", () => ({
  default: () => null,
}));

vi.mock("../components/ConversionsCard", () => ({
  default: () => null,
}));

vi.mock("../contexts/DateRangeContext", () => ({
  useDateRange: vi.fn(() => ({ dateRange: null })),
  formatDateForDisplay: vi.fn((d) => d),
}));

vi.mock("../routes/policies/experimentPolicy", () => ({
  allowedStatusIntents: vi.fn(() => new Set()),
}));

// ─── Shared fixture helpers ───────────────────────────────────────────────────

//reports filters out archived + draft, so all fixtures use 'active'
const makeReportsExperiments = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Experiment ${i + 1}`,
    status: "active",
    startDate: "2025-06-01",
    endDate: null,
    endCondition: "Manual",
    analyses: [],
  }));

//experiments page shows all statuses; mix them up to test filtering
const makeExperimentsPageData = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Experiment ${i + 1}`,
    status: i % 2 === 0 ? "active" : "completed",
    startDate: "2025-06-01",
    endDate: null,
    endCondition: "Manual",
    analyses: [],
    improvement: null,
  }));

// ─── Reports page pagination ──────────────────────────────────────────────────

describe("Reports — Pagination", () => {
  beforeEach(() => {
    useLoaderData.mockReturnValue({
      experiments: makeReportsExperiments(8),
      sessionData: { sessions: [], total: 0 },
      conversionsData: { sessions: [], total: 0 },
      tutorialData: { viewedReportsPage: true },
    });
  });

  it("shows only 6 experiments on the first page", () => {
    render(<Reports />);
    expect(screen.getByText("Experiment 1")).toBeInTheDocument();
    expect(screen.getByText("Experiment 6")).toBeInTheDocument();
    expect(screen.queryByText("Experiment 7")).not.toBeInTheDocument();
  });

  it("shows correct page info text on page 1", () => {
    render(<Reports />);
    expect(screen.getByText(/Showing 1–6 of 8/)).toBeInTheDocument();
  });

  it("Previous button is disabled on page 1", () => {
    render(<Reports />);
    expect(screen.getByText("Previous")).toBeDisabled();
  });

  it("navigates to page 2 when Next is clicked", () => {
    render(<Reports />);
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Experiment 7")).toBeInTheDocument();
    expect(screen.getByText("Experiment 8")).toBeInTheDocument();
    expect(screen.queryByText("Experiment 1")).not.toBeInTheDocument();
  });

  it("shows correct page info text on page 2", () => {
    render(<Reports />);
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText(/Showing 7–8 of 8/)).toBeInTheDocument();
  });

  it("Next button is disabled on the last page", () => {
    render(<Reports />);
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Next")).toBeDisabled();
  });

  it("can navigate back to page 1 from page 2", () => {
    render(<Reports />);
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Previous"));
    expect(screen.getByText("Experiment 1")).toBeInTheDocument();
    expect(screen.queryByText("Experiment 7")).not.toBeInTheDocument();
  });

  it("renders each shown experiment name as a clickable report link", () => {
    render(<Reports />);
    const link = screen.getByText("Experiment 1").closest("s-link");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("href", "/app/reports/1");
  });

  it("shows N/A for conversions when analysis is missing", () => {
    render(<Reports />);
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });

  it("excludes archived and draft experiments from the list", () => {
    useLoaderData.mockReturnValue({
      experiments: [
        ...makeReportsExperiments(2),
        {
          id: 99,
          name: "Archived Exp",
          status: "archived",
          startDate: "2025-06-01",
          endDate: null,
          endCondition: "Manual",
          analyses: [],
        },
        {
          id: 100,
          name: "Draft Exp",
          status: "draft",
          startDate: "2025-06-01",
          endDate: null,
          endCondition: "Manual",
          analyses: [],
        },
      ],
      sessionData: { sessions: [], total: 0 },
      conversionsData: { sessions: [], total: 0 },
      tutorialData: { viewedReportsPage: true },
    });
    render(<Reports />);
    expect(screen.queryByText("Archived Exp")).not.toBeInTheDocument();
    expect(screen.queryByText("Draft Exp")).not.toBeInTheDocument();
    expect(screen.getByText("Experiment 1")).toBeInTheDocument();
  });

  it("shows all experiments on one page when count is within limit", () => {
    useLoaderData.mockReturnValue({
      experiments: makeReportsExperiments(3),
      sessionData: { sessions: [], total: 0 },
      conversionsData: { sessions: [], total: 0 },
      tutorialData: { viewedReportsPage: true },
    });
    render(<Reports />);
    expect(screen.getByText(/Showing 1–3 of 3/)).toBeInTheDocument();
    expect(screen.getByText("Previous")).toBeDisabled();
    expect(screen.getByText("Next")).toBeDisabled();
  });
});

// ─── Experiments page pagination ─────────────────────────────────────────────

describe("Experimentsindex — Pagination", () => {
  beforeEach(() => {
    useLoaderData.mockReturnValue({
      experiments: makeExperimentsPageData(20),
      tutorialData: { viewedListExperiment: true },
    });
  });

  it("shows only 16 experiments on the first page", () => {
    render(<Experimentsindex />);
    expect(screen.getByText("Experiment 1")).toBeInTheDocument();
    expect(screen.getByText("Experiment 16")).toBeInTheDocument();
    expect(screen.queryByText("Experiment 17")).not.toBeInTheDocument();
  });

  it("shows correct page info text on page 1", () => {
    render(<Experimentsindex />);
    expect(screen.getByText(/Showing 1–16 of 20/)).toBeInTheDocument();
  });

  it("Previous button is disabled on page 1", () => {
    render(<Experimentsindex />);
    expect(screen.getByText("Previous")).toBeDisabled();
  });

  it("navigates to page 2 when Next is clicked", () => {
    render(<Experimentsindex />);
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Experiment 17")).toBeInTheDocument();
    expect(screen.getByText("Experiment 20")).toBeInTheDocument();
    expect(screen.queryByText("Experiment 1")).not.toBeInTheDocument();
  });

  it("Next button is disabled on the last page", () => {
    render(<Experimentsindex />);
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Next")).toBeDisabled();
  });

  it("can navigate back to page 1 from page 2", () => {
    render(<Experimentsindex />);
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Previous"));
    expect(screen.getByText("Experiment 1")).toBeInTheDocument();
    expect(screen.queryByText("Experiment 17")).not.toBeInTheDocument();
  });

  it("renders experiment names as links to the reports page", () => {
    render(<Experimentsindex />);
    const link = screen.getByText("Experiment 1").closest("s-link");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("href", "/app/reports/1");
  });

  it("shows empty state when there are no experiments", () => {
    useLoaderData.mockReturnValue({
      experiments: [],
      tutorialData: { viewedListExperiment: true },
    });
    render(<Experimentsindex />);
    expect(
      screen.getByText("Your experiments will show here"),
    ).toBeInTheDocument();
  });
});

// ─── Experiments page — filter + pagination interaction ───────────────────────

describe("Experimentsindex — Filter + Pagination", () => {
  //10 active, 10 completed — all 20 fit on one page unfiltered (itemsPerPage=16 shows first 16)
  beforeEach(() => {
    useLoaderData.mockReturnValue({
      experiments: makeExperimentsPageData(20), //even indices = active, odd = completed
      tutorialData: { viewedListExperiment: true },
    });
  });

  it("filtering by active reduces the shown count", () => {
    render(<Experimentsindex />);
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    //10 active experiments total, all fit on one page
    expect(screen.getByText(/of 10/)).toBeInTheDocument();
  });

  it("filtering by active shows only active experiments", () => {
    render(<Experimentsindex />);
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    //experiment 1 is active (index 0), experiment 2 is completed (index 1)
    expect(screen.getByText("Experiment 1")).toBeInTheDocument();
    expect(screen.queryByText("Experiment 2")).not.toBeInTheDocument();
  });

  it("switching back to All restores full count", () => {
    render(<Experimentsindex />);
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText(/of 20/)).toBeInTheDocument();
  });

  it("pagination resets correctly after filter change", () => {
    render(<Experimentsindex />);
    //go to page 2
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Experiment 17")).toBeInTheDocument();
    //filter down - should now show page 1 of filtered results
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(screen.getByText("Experiment 1")).toBeInTheDocument();
  });
});
