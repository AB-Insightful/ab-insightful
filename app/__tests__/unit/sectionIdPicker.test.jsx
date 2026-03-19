import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import CreateExperimentUI from "../../routes/app.experiments.new";

// =====================================================================
// MOCKS
// =====================================================================

vi.mock("react-router", () => ({
  useFetcher: () => ({ submit: vi.fn(), data: {}, state: "idle" }),
  useLoaderData: () => ({
    defaultGoal: "completedCheckout",
    tutorialData: { createExperiment: true },
    shopDomain: "test-store.myshopify.com",
  }),
}));

// =====================================================================
// VISUAL PICKER UI TESTS
// =====================================================================
describe("CreateExperiment UI (Visual Picker Handshake)", () => {
  let originalOpen;

  beforeEach(() => {
    // Mock window.open to track if the app tries to launch the storefront
    originalOpen = window.open;
    window.open = vi.fn();
    // Mock Shopify App Bridge globals (for toast notification)
    global.shopify = { toast: { show: vi.fn() } };
  });

  afterEach(() => {
    // Cleanup mocks to prevent state leaking between tests
    window.open = originalOpen;
    delete global.shopify;
    vi.clearAllMocks();
  });

  /**
   * Test 1: Outbound handshake (Variant)
   * Verifies that clicking 'Select Visually' opens the store
   * with the correct query parameter to trigger the picker script
   */

  it("opens the storefront with the correct URL parameters for a Variant", () => {
    render(<CreateExperimentUI />);

    const buttons = screen.getAllByText("Select Visually");
    fireEvent.click(buttons[0]); // Variant A button

    expect(window.open).toHaveBeenCalledWith(
      "https://test-store.myshopify.com?ab_insightful_picker=true",
      "_blank",
    );
  });

  /**
   * Test 2: Outbound Handshake (Control)
   * The Control UI is hidden in a checkbox. This test reveals the UI
   * and ensures the Control picker button also works.
   */

  it("opens the storefront with the correct URL parameters for the Control Section", () => {
    const { container } = render(<CreateExperimentUI />);

    const checkbox = container.querySelector("s-checkbox");
    /**
     * JDSOM doesnt suport custom elemetn internal logic. By reaching
     * into internal react props, we can manually trigger the onChange handler
     * to revel the Control UI.
     */
    act(() => {
      const reactPropsKey = Object.keys(checkbox).find((key) =>
        key.startsWith("__reactProps"),
      );
      checkbox[reactPropsKey].onChange();
    });

    // Once revealed, the second "Select Visually" button should exist
    const buttons = screen.getAllByText("Select Visually");
    fireEvent.click(buttons[1]);

    expect(window.open).toHaveBeenCalledWith(
      "https://test-store.myshopify.com?ab_insightful_picker=true",
      "_blank",
    );
  });

  /**
   * Test 3: Inbound Handshake
   * Simulates the storefront sending a message back to the app window
   * after a user selects a section.
   */
  it("updates the Variant input and triggers a toast when a postMessage is received", () => {
    const { container } = render(<CreateExperimentUI />);

    const buttons = screen.getAllByText("Select Visually");
    fireEvent.click(buttons[0]);

    // Simulate the incoming cross-origin postMessage from the storefront embed
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "AB_INSIGHTFUL_SECTION_PICKED",
            sectionId: "shopify-section-variant-123",
          },
        }),
      );
    });

    // Verify the form field captured the payload by querying the custom element attribute
    const variantInput = container.querySelector(
      's-text-field[label="Section ID to be tested"]',
    );

    const inputValue = variantInput.getAttribute("value") || variantInput.value;
    expect(inputValue).toBe("shopify-section-variant-123");

    // Verify the App Bridge success toast fired
    expect(global.shopify.toast.show).toHaveBeenCalledWith(
      "Section ID copied!",
    );
  });

  /**
   * TEST 4: Inbound Handshake (Control)
   * Verifies that the app correctly identifies and updates the Control Section ID
   * field when receiving a picker payload.
   */
  it("updates the Control input when a postMessage is received for the control type", () => {
    const { container } = render(<CreateExperimentUI />);

    const checkbox = container.querySelector("s-checkbox");

    // Force the React onChange prop to execute
    act(() => {
      const reactPropsKey = Object.keys(checkbox).find((key) =>
        key.startsWith("__reactProps"),
      );
      checkbox[reactPropsKey].onChange();
    });

    // Click the Control "Select Visually" button
    const buttons = screen.getAllByText("Select Visually");
    fireEvent.click(buttons[1]);

    // Simulate the incoming cross-origin postMessage
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "AB_INSIGHTFUL_SECTION_PICKED",
            sectionId: "shopify-section-control-999",
          },
        }),
      );
    });

    // Verify the Control form field captured the payload
    const controlInput = container.querySelector(
      's-text-field[label="Control Section ID"]',
    );

    const inputValue = controlInput.getAttribute("value") || controlInput.value;
    expect(inputValue).toBe("shopify-section-control-999");
  });
});
