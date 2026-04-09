import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as reactRouter from "react-router";

import EditExperiment from "../routes/app.experiments.$id";
import CreateExperiment from "../routes/app.experiments.new";
import Report from "../routes/app.reports.$id";

// --------------------
// shared mocks
// --------------------
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useLoaderData: vi.fn(),
    useFetcher: vi.fn(() => ({
      state: "idle",
      data: null,
      submit: vi.fn(),
    })),
    useRevalidator: vi.fn(() => ({
      revalidate: vi.fn(),
    })),
    useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
  };
});

vi.mock("../contexts/DateRangeContext", () => ({
  useDateRange: () => ({
    dateRange: {
      start: "2026-03-01",
      end: "2026-03-31",
    },
  }),
  formatDateForDisplay: vi.fn(),
}));

vi.mock("../components/DateRangePicker", () => ({
  default: () => <div>DateRangePicker</div>,
}));

vi.mock("recharts", () => ({
  LineChart: ({ children }) => <div>{children}</div>,
  Line: () => <div>Line</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
  CartesianGrid: () => <div>CartesianGrid</div>,
  Tooltip: () => <div>Tooltip</div>,
  Legend: () => <div>Legend</div>,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  ReferenceLine: () => <div>ReferenceLine</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// helper: find breadcrumb s-link by visible text (ignore duplicate labels elsewhere on the page)
function expectBreadcrumb(label, href) {
  const matches = screen.getAllByText(label);
  const crumb = matches.find(
    (node) =>
      node.closest("s-link")?.getAttribute("slot") === "breadcrumb-actions",
  );
  expect(crumb, `Expected breadcrumb link "${label}"`).toBeTruthy();
  expect(crumb.closest("s-link")).toHaveAttribute("href", href);
}

describe("breadcrumb links", () => {
  test("create experiment breadcrumb goes back to experiments list", () => {
    vi.spyOn(reactRouter, "useLoaderData").mockReturnValue({
      defaultGoal: "completedCheckout",
      tutorialData: { createExperiment: true },
      shopDomain: "test-shop.myshopify.com",
    });

    render(<CreateExperiment />);

    expectBreadcrumb("Experiments", "/app/experiments");
  });

  test("edit experiment breadcrumb goes back to that experiment's report page", () => {
    vi.spyOn(reactRouter, "useLoaderData").mockReturnValue({
      shop: "test-shop.myshopify.com",
      appHandle: "ab-insightful",
      experiment: {
        id: 123,
        status: "draft",
        name: "Homepage Test",
        description: "desc",
        controlSectionId: "",
        variants: [{ sectionId: "section-a", trafficAllocation: 50 }],
        startDate: "",
        startTime: "",
        endDate: "",
        endTime: "",
        endCondition: "manual",
        goal: "completedCheckout",
        probabilityToBeBest: null,
        duration: null,
        timeUnit: null,
      },
    });

    render(<EditExperiment />);

    expectBreadcrumb("Report View", "/app/reports/123");
  });

  test("report page breadcrumb goes back to experiments list", () => {
    vi.spyOn(reactRouter, "useLoaderData").mockReturnValue({
      deviceSegment: "all",
      analysis: [],
      experiment: {
        id: 456,
        name: "Checkout Test",
        status: "draft",
        sectionId: "sec-1",
        startDate: null,
        experimentGoals: [],
        analyses: [],
        variants: [],
      },
    });

    render(<Report />);

    expectBreadcrumb("Experiments", "/app/experiments");
  });
});