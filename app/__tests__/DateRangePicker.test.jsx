import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import DateRangePicker from "../components/DateRangePicker";

const ctx = vi.hoisted(() => ({
  setDateRange: vi.fn(),
  dateRange: { start: "2026-04-03", end: "2026-04-10" },
  getCurrentDate: vi.fn(() => "2026-04-10"),
  getDateDaysAgo: vi.fn((days) => {
    if (days === 7) return "2026-04-03";
    if (days === 30) return "2026-03-11";
    return "2026-01-01";
  }),
  formatDateForDisplay: vi.fn((dateString) =>
    dateString ? `fmt(${dateString})` : ""
  ),
}));

vi.mock("../contexts/DateRangeContext", () => ({
  useDateRange: () => ({
    dateRange: ctx.dateRange,
    setDateRange: ctx.setDateRange,
  }),
  getCurrentDate: ctx.getCurrentDate,
  getDateDaysAgo: ctx.getDateDaysAgo,
  formatDateForDisplay: ctx.formatDateForDisplay,
}));

/** React binds onChange on the custom host; jsdom cannot drive it like a native input. */
function fireSDatePickerChange(container, value) {
  const host = container.querySelector("s-date-picker");
  expect(host).toBeTruthy();
  const fiberKey = Object.keys(host).find((k) => k.startsWith("__reactFiber$"));
  expect(fiberKey, "expected React fiber on s-date-picker").toBeTruthy();
  let fiber = host[fiberKey];
  let onChange;
  while (fiber) {
    if (
      fiber.elementType === "s-date-picker" &&
      typeof fiber.memoizedProps?.onChange === "function"
    ) {
      onChange = fiber.memoizedProps.onChange;
      break;
    }
    fiber = fiber.return;
  }
  expect(onChange, "expected onChange on s-date-picker fiber").toBeTypeOf("function");
  act(() => {
    onChange({ target: { value } });
  });
}

describe("DateRangePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.dateRange = { start: "2026-04-03", end: "2026-04-10" };
    ctx.getCurrentDate.mockReturnValue("2026-04-10");
    ctx.getDateDaysAgo.mockImplementation((days) => {
      if (days === 7) return "2026-04-03";
      if (days === 30) return "2026-03-11";
      return "2026-01-01";
    });
  });

  it("shows the formatted current range on the trigger button", () => {
    render(<DateRangePicker />);

    expect(ctx.formatDateForDisplay).toHaveBeenCalled();
    expect(
      screen.getByText(/fmt\(2026-04-03\).*fmt\(2026-04-10\)/)
    ).toBeInTheDocument();
  });

  it('shows "Select date range" when context has no range', () => {
    ctx.dateRange = null;

    render(<DateRangePicker />);

    expect(
      screen.getByRole("button", { name: "Select date range" })
    ).toBeInTheDocument();
  });

  it("Last 7 days applies the preset and notifies the parent", () => {
    const onDateRangeChange = vi.fn();
    render(<DateRangePicker onDateRangeChange={onDateRangeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(ctx.getCurrentDate).toHaveBeenCalled();
    expect(ctx.getDateDaysAgo).toHaveBeenCalledWith(7);
    expect(ctx.setDateRange).toHaveBeenCalledWith({
      start: "2026-04-03",
      end: "2026-04-10",
    });
    expect(onDateRangeChange).toHaveBeenCalledWith({
      start: "2026-04-03",
      end: "2026-04-10",
    });
  });

  it("Last 30 days applies the preset and notifies the parent", () => {
    const onDateRangeChange = vi.fn();
    render(<DateRangePicker onDateRangeChange={onDateRangeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Last 30 days" }));

    expect(ctx.getDateDaysAgo).toHaveBeenCalledWith(30);
    expect(ctx.setDateRange).toHaveBeenCalledWith({
      start: "2026-03-11",
      end: "2026-04-10",
    });
    expect(onDateRangeChange).toHaveBeenCalledWith({
      start: "2026-03-11",
      end: "2026-04-10",
    });
  });

  it("does not require onDateRangeChange when using presets", () => {
    render(<DateRangePicker />);

    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(ctx.setDateRange).toHaveBeenCalled();
  });

  it("Apply saves a range chosen in the date picker and notifies the parent", () => {
    const onDateRangeChange = vi.fn();
    const { container } = render(
      <DateRangePicker onDateRangeChange={onDateRangeChange} />
    );

    fireSDatePickerChange(container, "2026-02-01--2026-02-28");

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(ctx.setDateRange).toHaveBeenCalledWith({
      start: "2026-02-01",
      end: "2026-02-28",
    });
    expect(onDateRangeChange).toHaveBeenCalledWith({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });

  it("Apply does nothing when no custom range was picked", () => {
    render(<DateRangePicker />);

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(ctx.setDateRange).not.toHaveBeenCalled();
  });

  it("ignores date picker values without a range separator", () => {
    const onDateRangeChange = vi.fn();
    const { container } = render(
      <DateRangePicker onDateRangeChange={onDateRangeChange} />
    );

    fireSDatePickerChange(container, "2026-02-01");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(ctx.setDateRange).not.toHaveBeenCalled();
    expect(onDateRangeChange).not.toHaveBeenCalled();
  });

  it("renders Cancel in the popover", () => {
    ctx.dateRange = null;
    render(<DateRangePicker />);

    const shell = screen.getByText("Select date range").closest("div");
    expect(
      within(shell).getByRole("button", { name: "Cancel" })
    ).toBeInTheDocument();
  });
});
