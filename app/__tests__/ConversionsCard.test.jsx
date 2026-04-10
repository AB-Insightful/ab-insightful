import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  AreaChart: ({ data, children }) => (
    <div data-testid="area-chart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Area: () => <div data-testid="area" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  XAxis: ({ tickFormatter }) => <div data-testid="x-axis">{tickFormatter?.("2026-01-02T12:00:00Z")}</div>,
  YAxis: ({ tickFormatter }) => <div data-testid="y-axis">{tickFormatter?.(12.34)}</div>,
  Tooltip: ({ formatter }) => {
    const formatted = formatter?.(12.345);
    return <div data-testid="tooltip">{Array.isArray(formatted) ? formatted[0] : ""}</div>;
  },
}));

import ConversionsCard from "../components/ConversionsCard";

describe("ConversionsCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading state before client hydration", () => {
    const html = renderToString(
      <ConversionsCard conversionsData={{ sessions: [] }} sessionData={{ sessions: [] }} hasExperiments />,
    );
    expect(html).toContain("Loading chart data...");
  });

  it("shows no-data state when experiments exist but chart data is empty", async () => {
    render(<ConversionsCard conversionsData={{ sessions: [] }} sessionData={{ sessions: [] }} hasExperiments />);
    await waitFor(() => {
      expect(screen.getByText("No conversion data to display yet.")).toBeInTheDocument();
    });
    expect(screen.getByText("0.00%")).toBeInTheDocument();
  });

  it("shows 0.00% and no-data state when experiments are disabled", async () => {
    render(
      <ConversionsCard
        conversionsData={{
          sessions: [{ date: "2026-01-02", count: 5 }],
        }}
        sessionData={{
          sessions: [{ date: "2026-01-02", count: 10 }],
        }}
        hasExperiments={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No conversion data to display yet.")).toBeInTheDocument();
    });
    expect(screen.getByText("0.00%")).toBeInTheDocument();
  });

  it("renders chart and computes conversion rates with sorted merged dates", async () => {
    render(
      <ConversionsCard
        conversionsData={{
          sessions: [
            { date: "2026-01-02", count: 3 },
            { date: "2026-01-01", count: 1 },
          ],
        }}
        sessionData={{
          sessions: [
            { date: "2026-01-02", count: 10 },
            { date: "2026-01-03", count: 0 },
            { date: "2026-01-01", count: 4 },
          ],
        }}
        hasExperiments
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("area-chart")).toBeInTheDocument();
    });

    // Total conversion rate uses aggregate totals: (4 / 14) * 100 = 28.57
    expect(screen.getByText("28.57%")).toBeInTheDocument();

    // Formatter callbacks are executed by mocks.
    expect(screen.getByTestId("x-axis")).toHaveTextContent("Jan");
    expect(screen.getByTestId("y-axis")).toHaveTextContent("12.34%");
    expect(screen.getByTestId("tooltip")).toHaveTextContent("12.35%");

    const parsedChartData = JSON.parse(screen.getByTestId("area-chart").getAttribute("data-chart"));
    expect(parsedChartData).toEqual([
      { date: "2026-01-01", conversionRate: 25 },
      { date: "2026-01-02", conversionRate: 30 },
      { date: "2026-01-03", conversionRate: 0 },
    ]);
  });

  it("opens Shopify full report URL in top frame", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<ConversionsCard conversionsData={{ sessions: [] }} sessionData={{ sessions: [] }} hasExperiments />);

    fireEvent.click(screen.getByRole("button", { name: "Full Report" }));

    expect(openSpy).toHaveBeenCalledWith(
      "shopify://admin/analytics/reports/conversion_rate_over_time",
      "_top",
    );
  });

  it("falls back safely for missing datasets and invalid count values", async () => {
    const { rerender } = render(
      <ConversionsCard
        conversionsData={{ sessions: [{ date: "2026-01-04", count: "bad-number" }] }}
        sessionData={{ sessions: [{ date: "2026-01-04", count: "NaN" }] }}
        hasExperiments
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("0.00%")).toBeInTheDocument();
    });

    rerender(<ConversionsCard hasExperiments={false} />);
    await waitFor(() => {
      expect(screen.getByText("No conversion data to display yet.")).toBeInTheDocument();
    });
  });
});
