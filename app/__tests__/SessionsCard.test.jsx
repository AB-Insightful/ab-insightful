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
  XAxis: ({ tickFormatter }) => (
    <div data-testid="x-axis">{tickFormatter?.("2026-01-02T12:00:00Z")}</div>
  ),
  YAxis: ({ tickFormatter }) => (
    <div data-testid="y-axis">
      <span data-testid="y-tick-small">{tickFormatter?.(500)}</span>
      <span data-testid="y-tick-large">{tickFormatter?.(1500)}</span>
    </div>
  ),
  Tooltip: ({ formatter }) => {
    const formatted = formatter?.(12.345);
    return (
      <div data-testid="tooltip">
        {Array.isArray(formatted) ? `${formatted[0]}|${formatted[1]}` : ""}
      </div>
    );
  },
}));

import SessionsCard from "../components/SessionsCard";

describe("SessionsCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading state before client hydration", () => {
    const html = renderToString(
      <SessionsCard sessionData={{ sessions: [{ date: "2026-01-01", count: 1 }], total: 1 }} />,
    );
    expect(html).toContain("Loading chart data...");
  });

  it("shows empty state when there is no session series after hydration", async () => {
    render(<SessionsCard sessionData={{ sessions: [], total: 0 }} />);

    await waitFor(() => {
      expect(screen.getByText("No session data to display yet.")).toBeInTheDocument();
    });
  });

  it("formats total with locale string", async () => {
    render(<SessionsCard sessionData={{ sessions: [], total: 12345 }} />);

    await waitFor(() => {
      expect(screen.getByText("12,345")).toBeInTheDocument();
    });
  });

  it("renders chart with session points and executes formatter callbacks", async () => {
    render(
      <SessionsCard
        sessionData={{
          total: 14,
          sessions: [
            { date: "2026-01-02", count: 10 },
            { date: "2026-01-01", count: 4 },
          ],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("area-chart")).toBeInTheDocument();
    });

    expect(screen.getByText("14")).toBeInTheDocument();

    expect(screen.getByTestId("x-axis")).toHaveTextContent("Jan 2");
    expect(screen.getByTestId("y-tick-small")).toHaveTextContent("500");
    expect(screen.getByTestId("y-tick-large")).toHaveTextContent("2k");
    expect(screen.getByTestId("tooltip")).toHaveTextContent("12|Sessions");

    const parsedChartData = JSON.parse(screen.getByTestId("area-chart").getAttribute("data-chart"));
    expect(parsedChartData).toEqual([
      { date: "2026-01-02", count: 10 },
      { date: "2026-01-01", count: 4 },
    ]);

    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    expect(screen.getByTestId("area")).toBeInTheDocument();
    expect(screen.getByTestId("cartesian-grid")).toBeInTheDocument();
  });

  it("opens Shopify sessions report in the top frame", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<SessionsCard sessionData={{ sessions: [], total: 0 }} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Full Report" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Full Report" }));

    expect(openSpy).toHaveBeenCalledWith("shopify://admin/analytics/reports/sessions_over_time", "_top");
  });

  it("defaults safely when sessionData is missing", async () => {
    render(<SessionsCard />);

    await waitFor(() => {
      expect(screen.getByText("0")).toBeInTheDocument();
    });
    expect(screen.getByText("No session data to display yet.")).toBeInTheDocument();
  });
});
