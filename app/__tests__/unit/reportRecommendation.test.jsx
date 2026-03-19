import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useLoaderData, useFetcher, useRevalidator } from "react-router";

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

function buildLoaderData({
  status = "active",
  analysis = [],
  analyses = [],
  variants = [],
}) {
  return {
    experiment: {
      id: 1,
      name: "Test Experiment",
      status,
      startDate: "2026-01-01T00:00:00Z",
      sectionId: "sec-1",
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

  it("shows 'Collecting Data' when no Control variant exists in analysis", () => {
    useLoaderData.mockReturnValue(
      buildLoaderData({ analysis: [], analyses: [] }),
    );
    const { container } = render(<Report />);

    expect(getBannerHeading(container)).toBe("Collecting Data");
    expect(
      screen.getByText("We need more visitors to generate a report."),
    ).toBeTruthy();
  });

  it("finds Control by name (not index) and detects a winner", () => {
    useLoaderData.mockReturnValue(
      buildLoaderData({
        status: "active",
        analysis: [
          {
            id: 2,
            variantName: "Variant A",
            conversionRate: 0.15,
            probabilityOfBeingBest: 0.9,
            expectedLoss: 0.001,
            totalConversions: 80,
            totalUsers: 500,
            improvement: 50,
          },
          {
            id: 1,
            variantName: "Control",
            conversionRate: 0.1,
            probabilityOfBeingBest: 0.1,
            expectedLoss: 0.01,
            totalConversions: 50,
            totalUsers: 500,
            improvement: 0,
          },
        ],
        analyses: [],
        variants: [
          { id: 1, name: "Control" },
          { id: 2, name: "Variant A" },
        ],
      }),
    );

    const { container } = render(<Report />);
    expect(getBannerHeading(container)).toBe("Deployable!");
    expect(screen.getByText(/Variant A.*is winning/)).toBeTruthy();
  });

  it("detects multiple winners", () => {
    useLoaderData.mockReturnValue(
      buildLoaderData({
        status: "active",
        analysis: [
          {
            id: 1,
            variantName: "Control",
            conversionRate: 0.05,
            probabilityOfBeingBest: 0.05,
            expectedLoss: 0.05,
            totalConversions: 25,
            totalUsers: 500,
            improvement: 0,
          },
          {
            id: 2,
            variantName: "Variant A",
            conversionRate: 0.12,
            probabilityOfBeingBest: 0.85,
            expectedLoss: 0.001,
            totalConversions: 60,
            totalUsers: 500,
            improvement: 40,
          },
          {
            id: 3,
            variantName: "Variant B",
            conversionRate: 0.13,
            probabilityOfBeingBest: 0.82,
            expectedLoss: 0.001,
            totalConversions: 65,
            totalUsers: 500,
            improvement: 45,
          },
        ],
        analyses: [],
        variants: [
          { id: 1, name: "Control" },
          { id: 2, name: "Variant A" },
          { id: 3, name: "Variant B" },
        ],
      }),
    );

    const { container } = render(<Report />);
    expect(getBannerHeading(container)).toBe(
      "Multiple Variants are Deployable!",
    );
    expect(
      screen.getByText(/Variant A and Variant B are winning/),
    ).toBeTruthy();
  });

  it("shows 'Continue Testing' when no clear winner yet (active)", () => {
    useLoaderData.mockReturnValue(
      buildLoaderData({
        status: "active",
        analysis: [
          {
            id: 1,
            variantName: "Control",
            conversionRate: 0.1,
            probabilityOfBeingBest: 0.55,
            expectedLoss: 0.01,
            totalConversions: 50,
            totalUsers: 500,
            improvement: 0,
          },
          {
            id: 2,
            variantName: "Variant A",
            conversionRate: 0.11,
            probabilityOfBeingBest: 0.45,
            expectedLoss: 0.02,
            totalConversions: 55,
            totalUsers: 500,
            improvement: 10,
          },
        ],
        analyses: [],
        variants: [
          { id: 1, name: "Control" },
          { id: 2, name: "Variant A" },
        ],
      }),
    );

    const { container } = render(<Report />);
    expect(getBannerHeading(container)).toBe("Continue Testing");
    expect(screen.getByText("No clear winner yet.")).toBeTruthy();
  });

  it("shows 'Continue Testing' when a variant peaked historically but no current winner", () => {
    useLoaderData.mockReturnValue(
      buildLoaderData({
        status: "active",
        analysis: [
          {
            id: 1,
            variantName: "Control",
            conversionRate: 0.1,
            probabilityOfBeingBest: 0.55,
            expectedLoss: 0.01,
            totalConversions: 50,
            totalUsers: 500,
            improvement: 0,
          },
          {
            id: 2,
            variantName: "Variant A",
            conversionRate: 0.11,
            probabilityOfBeingBest: 0.45,
            expectedLoss: 0.02,
            totalConversions: 55,
            totalUsers: 500,
            improvement: 10,
          },
        ],
        analyses: [
          {
            probabilityOfBeingBest: 0.85,
            variant: { name: "Variant A" },
            calculatedWhen: new Date("2026-01-05"),
          },
        ],
        variants: [
          { id: 1, name: "Control" },
          { id: 2, name: "Variant A" },
        ],
      }),
    );

    const { container } = render(<Report />);
    expect(getBannerHeading(container)).toBe("Continue Testing");
    expect(screen.getByText(/Variant A hit 80% previously/)).toBeTruthy();
  });

  it("shows 'Inconclusive' when completed with no winner", () => {
    useLoaderData.mockReturnValue(
      buildLoaderData({
        status: "completed",
        analysis: [
          {
            id: 1,
            variantName: "Control",
            conversionRate: 0.1,
            probabilityOfBeingBest: 0.55,
            expectedLoss: 0.01,
            totalConversions: 50,
            totalUsers: 500,
            improvement: 0,
          },
          {
            id: 2,
            variantName: "Variant A",
            conversionRate: 0.11,
            probabilityOfBeingBest: 0.45,
            expectedLoss: 0.02,
            totalConversions: 55,
            totalUsers: 500,
            improvement: 10,
          },
        ],
        analyses: [],
        variants: [
          { id: 1, name: "Control" },
          { id: 2, name: "Variant A" },
        ],
      }),
    );

    const { container } = render(<Report />);
    expect(getBannerHeading(container)).toBe("Inconclusive");
    expect(screen.getByText("No clear winner was found.")).toBeTruthy();
  });

  it("shows 'Draft' for non-active experiments", () => {
    useLoaderData.mockReturnValue(
      buildLoaderData({
        status: "draft",
        analysis: [
          {
            id: 1,
            variantName: "Control",
            conversionRate: 0.1,
            probabilityOfBeingBest: 0.5,
            expectedLoss: 0.01,
            totalConversions: 0,
            totalUsers: 0,
            improvement: 0,
          },
        ],
        analyses: [],
        variants: [{ id: 1, name: "Control" }],
      }),
    );

    const { container } = render(<Report />);
    expect(getBannerHeading(container)).toBe("Draft");
    expect(screen.getByText("Experiment is not active.")).toBeTruthy();
  });
});
