import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import { useLoaderData } from "react-router";

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
  PrismaClient: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {},
}));

vi.mock("../shopify.server", () => ({
  authenticate: { admin: vi.fn() },
}));

vi.mock("../contexts/DateRangeContext", () => ({
  useDateRange: () => ({
    dateRange: { start: "2026-01-01", end: "2026-12-31" },
  }),
  formatDateForDisplay: (d) => d,
}));

vi.mock("recharts", () => ({
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  ReferenceLine: () => null,
}));

vi.mock("../components/DateRangePicker", () => ({
  default: () => null,
}));

import Report from "../routes/app.reports.$id";

function makeAnalysisRow(overrides) {
  return {
    id: 1,
    variantName: "Control",
    conversionRate: 0.10,
    probabilityOfBeingBest: 0.5,
    expectedLoss: 0.01,
    totalConversions: 50,
    totalUsers: 500,
    improvement: 0,
    ...overrides,
  };
}

function buildLoaderData(analysis) {
  return {
    experiment: {
      id: 1,
      name: "Table Test",
      status: "active",
      startDate: "2026-01-01T00:00:00Z",
      sectionId: "sec-1",
      experimentGoals: [{ goal: { name: "Purchase" } }],
      analyses: [],
      variants: analysis.map((a) => ({ id: a.id, name: a.variantName })),
    },
    analysis,
  };
}

describe("Report - renderTableData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Baseline' for the Control row improvement regardless of its position", () => {
    const analysis = [
      makeAnalysisRow({ id: 2, variantName: "Variant A", improvement: 25, conversionRate: 0.15, probabilityOfBeingBest: 0.6 }),
      makeAnalysisRow({ id: 1, variantName: "Control", improvement: 0, conversionRate: 0.10, probabilityOfBeingBest: 0.4 }),
    ];

    useLoaderData.mockReturnValue(buildLoaderData(analysis));
    render(<Report />);

    expect(screen.getByText("Baseline")).toBeTruthy();
  });

  it("shows formatted improvement for non-Control variants", () => {
    const analysis = [
      makeAnalysisRow({ id: 1, variantName: "Control" }),
      makeAnalysisRow({ id: 2, variantName: "Variant A", improvement: 25, conversionRate: 0.15, probabilityOfBeingBest: 0.7 }),
    ];

    useLoaderData.mockReturnValue(buildLoaderData(analysis));
    render(<Report />);

    expect(screen.queryByText("Baseline")).toBeTruthy();
    expect(screen.getByText("25.00%")).toBeTruthy();
  });

  it("renders all variant rows including A, B, C", () => {
    const analysis = [
      makeAnalysisRow({ id: 1, variantName: "Control" }),
      makeAnalysisRow({ id: 2, variantName: "Variant A", improvement: 10 }),
      makeAnalysisRow({ id: 3, variantName: "Variant B", improvement: 20 }),
      makeAnalysisRow({ id: 4, variantName: "Variant C", improvement: 30 }),
    ];

    useLoaderData.mockReturnValue(buildLoaderData(analysis));
    render(<Report />);

    expect(screen.getByText("Control")).toBeTruthy();
    expect(screen.getByText("Variant A")).toBeTruthy();
    expect(screen.getByText("Variant B")).toBeTruthy();
    expect(screen.getByText("Variant C")).toBeTruthy();
  });

  it("renders nothing when analysis is empty", () => {
    useLoaderData.mockReturnValue(buildLoaderData([]));
    const { container } = render(<Report />);
    const tableBody = container.querySelector("s-table-body");
    expect(tableBody?.children.length ?? 0).toBe(0);
  });

  it("shows a no-data indicator instead of charts when no chartable report data exists", async () => {
    useLoaderData.mockReturnValue(buildLoaderData([]));

    render(<Report />);

    await waitFor(() => {
      expect(
        screen.getAllByText("No graph data available for the selected date range.").length,
      ).toBe(2);
    });

    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
  });

  it("shows the placeholder when report rows have zero conversions or sessions", async () => {
    const analysis = [
      makeAnalysisRow({
        id: 1,
        variantName: "Control",
        totalConversions: 0,
        totalUsers: 300,
      }),
      makeAnalysisRow({
        id: 2,
        variantName: "Variant A",
        totalConversions: 12,
        totalUsers: 0,
        improvement: 5,
      }),
    ];

    useLoaderData.mockReturnValue({
      ...buildLoaderData(analysis),
      experiment: {
        ...buildLoaderData(analysis).experiment,
        analyses: [
          {
            calculatedWhen: "2026-01-02T00:00:00Z",
            probabilityOfBeingBest: 0,
            expectedLoss: 0,
            totalConversions: 0,
            totalUsers: 300,
            variant: { name: "Control" },
          },
          {
            calculatedWhen: "2026-01-02T00:00:00Z",
            probabilityOfBeingBest: 0,
            expectedLoss: 0,
            totalConversions: 12,
            totalUsers: 0,
            variant: { name: "Variant A" },
          },
        ],
      },
    });

    render(<Report />);

    await waitFor(() => {
      expect(
        screen.getAllByText("No graph data available for the selected date range.").length,
      ).toBe(2);
    });

    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
  });

  it("displays conversions/users for each row", () => {
    const analysis = [
      makeAnalysisRow({ id: 1, variantName: "Control", totalConversions: 42, totalUsers: 300 }),
      makeAnalysisRow({ id: 2, variantName: "Variant A", totalConversions: 67, totalUsers: 300, improvement: 15 }),
    ];

    useLoaderData.mockReturnValue(buildLoaderData(analysis));
    render(<Report />);

    expect(screen.getByText("42 / 300")).toBeTruthy();
    expect(screen.getByText("67 / 300")).toBeTruthy();
  });
});
