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
  YAxis: ({ tickFormatter }) => <div data-testid="y-axis">{tickFormatter?.(1234)}</div>,
  Tooltip: ({ formatter }) => {
    const formatted = formatter?.(1234.56);
    return <div data-testid="tooltip">{Array.isArray(formatted) ? formatted[0] : ""}</div>;
  },
}));

import SessionsCard from "../components/SessionsCard";

describe("SessionsCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading state before client hydration", () => {
    const html = renderToString(<SessionsCard sessionData={{ sessions: [], total: 0 }} />);
    expect(html).toContain("Loading chart data...");
  });

  it("shows no-data state when chart data is empty", async () => {
    render(<SessionsCard sessionData={{ sessions: [], total: 0 }} />);

    await waitFor(() => {
      expect(screen.getByText("No session data to display yet.")).toBeInTheDocument();
    });

    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows no-data state when all session points are zero", async () => {
    render(
      <SessionsCard
        sessionData={{
          total: 0,
          sessions: [
            { date: "2026-01-01", count: 0 },
            { date: "2026-01-02", count: 0 },
          ],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No session data to display yet.")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("area-chart")).not.toBeInTheDocument();
  });

  it("renders chart when at least one session point is non-zero", async () => {
    render(
      <SessionsCard
        sessionData={{
          total: 1450,
          sessions: [
            { date: "2026-01-01", count: 0 },
            { date: "2026-01-02", count: 1450 },
          ],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("area-chart")).toBeInTheDocument();
    });

    expect(screen.getByText("1,450")).toBeInTheDocument();
    expect(screen.getByTestId("x-axis")).toHaveTextContent("Jan");
    expect(screen.getByTestId("y-axis")).toHaveTextContent("1k");
    expect(screen.getByTestId("tooltip")).toHaveTextContent("1235");
  });

  it("opens Shopify full report URL in top frame", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<SessionsCard sessionData={{ sessions: [], total: 0 }} />);

    fireEvent.click(screen.getByRole("button", { name: "Full Report" }));

    expect(openSpy).toHaveBeenCalledWith(
      "shopify://admin/analytics/reports/sessions_over_time",
      "_top",
    );
  });
});