import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { TimeSelect } from "../utils/timeSelect";

vi.mock("../utils/parseUserTime", () => ({
  parseUserTime: vi.fn(),
}));

import { parseUserTime } from "../utils/parseUserTime";

describe("TimeSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a friendly label for an initial HH:MM value", async () => {
    const onChange = vi.fn();

    render(<TimeSelect id="t" value="13:30" onChange={onChange} />);

    const input = screen.getByTestId("time-input");

    await waitFor(() => {
      expect(input.value).toBe("1:30 PM");
    });
  });

  it("clicking a time option button calls onChange(HH:MM) and updates display", async () => {
    const onChange = vi.fn();

    render(<TimeSelect id="t" value="" onChange={onChange} />);

    fireEvent.click(screen.getByText("1:30 PM"));

    expect(onChange).toHaveBeenCalledWith("13:30");

    const input = screen.getByTestId("time-input");
    await waitFor(() => {
      expect(input.value).toBe("1:30 PM");
    });
  });

  it("parses typed input on blur and calls onChange(parsed)", () => {
    parseUserTime.mockReturnValue("13:30");

    const onChange = vi.fn();
    render(<TimeSelect id="t" value="" onChange={onChange} />);

    const input = screen.getByTestId("time-input");

    fireEvent.input(input, { target: { value: "1:30 PM" } });
    fireEvent.blur(input);

    expect(parseUserTime).toHaveBeenCalledWith("1:30 PM");
    expect(onChange).toHaveBeenCalledWith("13:30");
    expect(input.value).toBe("1:30 PM");
  });

  it('when parsing fails, it calls onChange("")', () => {
    parseUserTime.mockReturnValue(null);

    const onChange = vi.fn();
    render(<TimeSelect id="t" value="" onChange={onChange} />);

    const input = screen.getByTestId("time-input");

    fireEvent.input(input, { target: { value: "not a time" } });
    fireEvent.blur(input);

    expect(parseUserTime).toHaveBeenCalledWith("not a time");
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("commits typed input on Enter (keydown)", () => {
    parseUserTime.mockReturnValue("09:00");

    const onChange = vi.fn();
    render(<TimeSelect id="t" value="" onChange={onChange} />);

    const input = screen.getByTestId("time-input");

    fireEvent.input(input, { target: { value: "9:00 AM" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(parseUserTime).toHaveBeenCalledWith("9:00 AM");
    expect(onChange).toHaveBeenCalledWith("09:00");
  });

  it("disabled: typing/blurring/clicking options does nothing", () => {
    parseUserTime.mockReturnValue("13:30");

    const onChange = vi.fn();
    render(<TimeSelect id="t" value="" onChange={onChange} disabled />);

    const input = screen.getByTestId("time-input");

    fireEvent.input(input, { target: { value: "1:30 PM" } });
    fireEvent.blur(input);

    fireEvent.click(screen.getByText("1:30 PM"));

    expect(onChange).not.toHaveBeenCalled();
    expect(parseUserTime).not.toHaveBeenCalled();
  });

  it("labelFor() fallback: renders a label for a non-30-min value (e.g. 13:15)", async () => {
    const onChange = vi.fn();

    render(<TimeSelect id="t" value="13:15" onChange={onChange} />);

    const input = screen.getByTestId("time-input");
    await waitFor(() => {
      expect(input.value).toBe("1:15 PM");
    });
  });

  it("syncs display when parent value changes (useEffect [value])", async () => {
    const onChange = vi.fn();

    const { rerender } = render(<TimeSelect id="t" value="13:30" onChange={onChange} />);

    const input = screen.getByTestId("time-input");

    await waitFor(() => expect(input.value).toBe("1:30 PM"));

    rerender(<TimeSelect id="t" value="09:00" onChange={onChange} />);

    await waitFor(() => expect(input.value).toBe("9:00 AM"));
  });

  it("openPopover: focusing/clicking the field clicks the popover trigger", () => {
    const onChange = vi.fn();

    const { container } = render(<TimeSelect id="t" value="" onChange={onChange} />);

    // TimeSelect calls: el?.querySelector(`#${popoverId}Trigger`)?.click()
    // popoverId = "t-popover" -> trigger id = "t-popoverTrigger"
    const wrapperDiv = container.firstElementChild; // <div> root from TimeSelect
    const trigger = document.createElement("button");
    trigger.id = "t-popoverTrigger";

    const clickSpy = vi.spyOn(trigger, "click");
    wrapperDiv.appendChild(trigger);

    // fire events on the actual custom element (<s-text-field>)
    const fieldHost = container.querySelector("s-text-field");
    expect(fieldHost).toBeTruthy();

    fireEvent.focus(fieldHost);
    fireEvent.click(fieldHost);

    expect(clickSpy).toHaveBeenCalled();
  });

  it("accessory button: when disabled prop is true, it prevents default + stops propagation", () => {
    const onChange = vi.fn();

    const { container } = render(<TimeSelect id="t" value="" onChange={onChange} disabled />);

    // our setupTests turns <s-button> into a real <button data-s-button="true">
    const accessoryBtn = container.querySelector('button[data-s-button="true"]');
    expect(accessoryBtn).toBeTruthy();

    // React will set disabled=true on the real button which blocks click events.
    // Flip the DOM property so the event can dispatch, but keep component prop disabled=true
    accessoryBtn.disabled = false;

    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    accessoryBtn.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
  });
});

