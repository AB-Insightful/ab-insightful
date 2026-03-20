import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useLoaderData } from "react-router";
import Report from "../routes/app.reports.$id";

vi.mock("react-router", () => ({
  useLoaderData: vi.fn(),
  useFetcher: () => ({ state: "idle", data: null, submit: vi.fn() }),
  useRevalidator: () => ({ revalidate: vi.fn() }),
}));

// Standard Shopify/Prisma Mocks
vi.mock("../shopify.server", () => ({
  authenticate: { admin: vi.fn() },
  login: vi.fn(),
  registerWebhooks: vi.fn(),
  addDocumentResponseHeaders: vi.fn(),
  authenticateWebhook: vi.fn(),
}));

// Mock the db.server file
vi.mock("../db.server", () => ({
  __esModule: true,
  default: {
    experiment: { findUnique: vi.fn() },
  },
}));

vi.mock("../contexts/DateRangeContext", () => ({
  useDateRange: () => ({ dateRange: { start: "2026-01-01", end: "2026-12-31" } }),
  formatDateForDisplay: (d) => d,
}));

vi.mock("recharts", () => ({
  LineChart: () => null, Line: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  ResponsiveContainer: ({ children }) => children, ReferenceLine: () => null,
}));
// Helper function to build stable history
// This function builds a history of 3 days of data for a given variant
// requires variantHistory.length >= 3 before a recommendation can be made
function buildStableHistory(variantId, variantName, prob, rate) {
  return [
    { 
      variantId, 
      probabilityOfBeingBest: prob, 
      conversionRate: rate, 
      calculatedWhen: new Date("2026-03-19"),
      variant: { id: variantId, name: variantName },
    },
    { 
      variantId, 
      probabilityOfBeingBest: prob, 
      conversionRate: rate, 
      calculatedWhen: new Date("2026-03-18"),
      variant: { id: variantId, name: variantName },
    },
    { 
      variantId, 
      probabilityOfBeingBest: prob, 
      conversionRate: rate, 
      calculatedWhen: new Date("2026-03-17"),
      variant: { id: variantId, name: variantName },
    },
  ];
}

function buildLoaderData({ status = "active", analysis = [], analyses = [], variants = [] }) {
  return {
    experiment: {
      id: 1,
      name: "Test Experiment",
      status,
      startDate: "2026-01-01T00:00:00Z", // Experiment age > 3 days
      experimentGoals: [{ goal: { name: "Purchase" } }],
      analyses,
      variants,
    },
    analysis,
  };
}

function getBannerHeading(container) {
  const banner = container.querySelector("s-banner[heading]");
  return banner?.getAttribute("heading") ?? null;
}

describe("Report - recommendation logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  // Test 1: shows 'Collecting Data' when baseline (Control) snapshots are missing/insufficient
  it("shows 'Collecting Data' when baseline (Control) snapshots are missing", () => {
    useLoaderData.mockReturnValue(
      buildLoaderData({
        analysis: [{ variantName: "Control", conversionRate: 0.1 }],
        analyses: [], // lacks 3 day history 
        variants: [{ id: 1, name: "Control" }],
      }),
    );
    const { container } = render(<Report />);

    expect(getBannerHeading(container)).toBe("Collecting Data");
    expect(screen.getByText("Waiting for sufficient baseline (Control) data to stabilize.")).toBeTruthy();
  });

  // Test 2: detects a stable winner and displays the 'Deployable!' state
  // if the SMA prob >= 80% and is currently better than the control
  it("detects a stable winner and displays the 'Deployable!' state", () => {
    const history = [
      ...buildStableHistory(1, "Control", 0.1, 0.10),
      ...buildStableHistory(2, "Variant A", 0.9, 0.15),
    ];

    useLoaderData.mockReturnValue(
      buildLoaderData({
        analysis: [
          { variantName: "Variant A", conversionRate: 0.15, probabilityOfBeingBest: 0.9, id: 2 },
          { variantName: "Control", conversionRate: 0.10, probabilityOfBeingBest: 0.1, id: 1 },
        ],
        analyses: history,
        variants: [{ id: 1, name: "Control" }, { id: 2, name: "Variant A" }],
      }),
    );

    const { container } = render(<Report />);
    expect(getBannerHeading(container)).toBe("Deployable!");
    expect(screen.getByText(/Variant A is outperforming the control with sustained stability/)).toBeTruthy();
  });
  // Test 3: detects multiple winners and displays the 'Deployable!' state
  it("detects multiple winners with comma-separated names", () => {
    const history = [
      ...buildStableHistory(1, "Control", 0.1, 0.05),
      ...buildStableHistory(2, "Variant A", 0.85, 0.12),
      ...buildStableHistory(3, "Variant B", 0.82, 0.13),
    ];

    useLoaderData.mockReturnValue(
      buildLoaderData({
        analysis: [
          { variantName: "Control", conversionRate: 0.05, id: 1 },
          { variantName: "Variant A", conversionRate: 0.12, id: 2 },
          { variantName: "Variant B", conversionRate: 0.13, id: 3 },
        ],
        analyses: history,
        variants: [
          { id: 1, name: "Control" },
          { id: 2, name: "Variant A" },
          { id: 3, name: "Variant B" },
        ],
      }),
    );

    const { container } = render(<Report />);
    expect(getBannerHeading(container)).toBe("Deployable!");
    expect(screen.getByText(/Variant A, Variant B are outperforming the control/)).toBeTruthy();
  });

  // Test 4: shows 'Keep Testing' when no variant hits the 80% SMA threshold
  it("shows 'Keep Testing' when no variant hits the 80% SMA threshold", () => {
    const history = [
      ...buildStableHistory(1, "Control", 0.5, 0.10),
      ...buildStableHistory(2, "Variant A", 0.5, 0.11),
    ];

    useLoaderData.mockReturnValue(
      buildLoaderData({
        status: "active",
        analysis: [{ variantName: "Control", conversionRate: 0.10, id: 1 }],
        analyses: history,
        variants: [{ id: 1, name: "Control" }, { id: 2, name: "Variant A" }],
      }),
    );

    const { container } = render(<Report />);
    expect(getBannerHeading(container)).toBe("Keep Testing");
    expect(screen.getByText(/Data is accumulating, but no variant has reached the 80% stability threshold yet/)).toBeTruthy();
  });
  // Test 5: shows 'Inconclusive' when an experiment ends without a winner
  it("shows 'Inconclusive' when an experiment ends without a winner", () => {
    const history = [
      ...buildStableHistory(1, "Control", 0.5, 0.10),
      ...buildStableHistory(2, "Variant A", 0.5, 0.11),
    ];

    useLoaderData.mockReturnValue(
      buildLoaderData({
        status: "completed",
        analysis: [{ variantName: "Control", conversionRate: 0.10, id: 1 }],
        analyses: history,
        variants: [{ id: 1, name: "Control" }, { id: 2, name: "Variant A" }],
      }),
    );

    const { container } = render(<Report />);
    expect(getBannerHeading(container)).toBe("Inconclusive");
    expect(screen.getByText("The experiment ended without a clear, stable winner.")).toBeTruthy();
  });

  // Test 6: shows 'Not Started' for draft experiments
  it("shows 'Not Started' for draft experiments", () => {
    useLoaderData.mockReturnValue(
      buildLoaderData({ status: "draft" }),
    );

    const { container } = render(<Report />);
    expect(getBannerHeading(container)).toBe("Not Started");
    expect(screen.getByText("This experiment is not yet collecting data.")).toBeTruthy();
  });
});