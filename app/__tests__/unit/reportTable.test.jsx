import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
  LineChart: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: () => null,
  ReferenceLine: () => null,
}));

vi.mock("../components/DateRangePicker", () => ({
  default: () => null,
}));

import Report from "../../routes/app.reports.$id";

function makeAnalysisRow(overrides) {
  return {
    id: 1,
    variantName: "Control",
    conversionRate: 0.1,
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
      makeAnalysisRow({
        id: 2,
        variantName: "Variant A",
        improvement: 25,
        conversionRate: 0.15,
        probabilityOfBeingBest: 0.6,
      }),
      makeAnalysisRow({
        id: 1,
        variantName: "Control",
        improvement: 0,
        conversionRate: 0.1,
        probabilityOfBeingBest: 0.4,
      }),
    ];

    useLoaderData.mockReturnValue(buildLoaderData(analysis));
    render(<Report />);

    expect(screen.getByText("Baseline")).toBeTruthy();
  });

  it("shows formatted improvement for non-Control variants", () => {
    const analysis = [
      makeAnalysisRow({ id: 1, variantName: "Control" }),
      makeAnalysisRow({
        id: 2,
        variantName: "Variant A",
        improvement: 25,
        conversionRate: 0.15,
        probabilityOfBeingBest: 0.7,
      }),
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

  it("displays conversions/users for each row", () => {
    const analysis = [
      makeAnalysisRow({
        id: 1,
        variantName: "Control",
        totalConversions: 42,
        totalUsers: 300,
      }),
      makeAnalysisRow({
        id: 2,
        variantName: "Variant A",
        totalConversions: 67,
        totalUsers: 300,
        improvement: 15,
      }),
    ];

    useLoaderData.mockReturnValue(buildLoaderData(analysis));
    render(<Report />);

    expect(screen.getByText("42 / 300")).toBeTruthy();
    expect(screen.getByText("67 / 300")).toBeTruthy();
  });
});
