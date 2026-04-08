// @vitest-environment jsdom

//COVERS:
//Component renders without crashing
//<Outlet> is rendered inside DateRangeProvider
//No duplicate providers or outlets
//DateRangeProvider recieves shidren as expected
//No unexpected extra wrapper elements

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// --- Mock react-router ---
vi.mock("react-router", () => ({
  Outlet: () => <div data-testid="outlet" />,
}));

// --- Mock DateRangeContext ---
const mockDateRangeProviderProps = vi.fn();

vi.mock("../contexts/DateRangeContext", () => ({
  DateRangeProvider: ({ children }) => {
    mockDateRangeProviderProps(children);
    return <div data-testid="date-range-provider">{children}</div>;
  },
}));

import ReportsLayout from "../routes/app.reports";

describe("ReportsLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<ReportsLayout />);
    expect(screen.getByTestId("date-range-provider")).toBeDefined();
  });

  it("wraps output in DateRangeProvider", () => {
    render(<ReportsLayout />);
    const provider = screen.getByTestId("date-range-provider");
    expect(provider).toBeDefined();
  });

  it("renders Outlet inside DateRangeProvider", () => {
    render(<ReportsLayout />);
    const provider = screen.getByTestId("date-range-provider");
    const outlet = screen.getByTestId("outlet");
    expect(provider.contains(outlet)).toBe(true);
  });

  it("renders exactly one DateRangeProvider", () => {
    render(<ReportsLayout />);
    const providers = screen.getAllByTestId("date-range-provider");
    expect(providers).toHaveLength(1);
  });

  it("renders exactly one Outlet", () => {
    render(<ReportsLayout />);
    const outlets = screen.getAllByTestId("outlet");
    expect(outlets).toHaveLength(1);
  });

  it("passes children to DateRangeProvider", () => {
    render(<ReportsLayout />);
    expect(mockDateRangeProviderProps).toHaveBeenCalledTimes(1);
    expect(mockDateRangeProviderProps).toHaveBeenCalledWith(
      expect.anything() // Outlet element passed as children
    );
  });

  it("does not render any extra wrapping elements", () => {
    const { container } = render(<ReportsLayout />);
    // The top-level element should be the mocked DateRangeProvider div
    expect(container.firstChild).toBe(screen.getByTestId("date-range-provider"));
  });
});
