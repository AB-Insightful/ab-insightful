import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import EditExperiment from "../../routes/app.experiments.$id";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";

// Cast hooks for control
const mockedUseLoaderData = vi.mocked(useLoaderData);
const mockedUseSearchParams = vi.mocked(useSearchParams);
const mockedUseFetcher = vi.mocked(useFetcher);

vi.mock("react-router", () => ({
  useLoaderData: vi.fn(),
  useSearchParams: vi.fn(),
  useFetcher: vi.fn(),
  useRevalidator: () => ({ revalidate: vi.fn() }),
}));

describe("ET-504: Success Banner & Lifecycle Actions", () => {
  const mockLoaderData = {
    shop: "emmanuel-store-67.myshopify.com",
    appHandle: "ab-insightful-1",
    experiment: { id: 9002, status: "draft" },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-initialize Globals so they aren't undefined
    global.window.shopify = {
      navigation: { navigate: vi.fn() },
      toast: { show: vi.fn() },
    };

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });

    mockedUseLoaderData.mockReturnValue(mockLoaderData);
    mockedUseFetcher.mockReturnValue({ state: "idle", submit: vi.fn() });
  });

  it("renders the banner when isNewlyCreated query param is present", () => {
    mockedUseSearchParams.mockReturnValue([
      new URLSearchParams("isNewlyCreated=true"),
      vi.fn(),
    ]);
    render(<EditExperiment />);
    expect(screen.getByText(/successfully created/i)).toBeInTheDocument();
  });

  it("cleans up the URL immediately using shopify.navigation.navigate", () => {
    mockedUseSearchParams.mockReturnValue([
      new URLSearchParams("isNewlyCreated=true"),
      vi.fn(),
    ]);
    render(<EditExperiment />);
    expect(window.shopify.navigation.navigate).toHaveBeenCalledWith(
      window.location.pathname,
      { replace: true },
    );
  });

  it("copies absolute Admin URLs to clipboard", async () => {
    mockedUseSearchParams.mockReturnValue([
      new URLSearchParams("isNewlyCreated=true"),
      vi.fn(),
    ]);
    render(<EditExperiment />);

    const copyBtn = screen.getByText(/Copy Experiment Link/i);
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://admin.shopify.com/store/emmanuel-store-67/apps/ab-insightful-1",
      ),
    );

    await waitFor(() => {
      expect(window.shopify.toast.show).toHaveBeenCalledWith(
        "Experiment link copied!",
      );
    });
  });

  it("correctly cycles intents based on experiment status", () => {
    mockedUseSearchParams.mockReturnValue([
      new URLSearchParams("isNewlyCreated=true"),
      vi.fn(),
    ]);
    const submitMock = vi.fn();
    mockedUseFetcher.mockReturnValue({ state: "idle", submit: submitMock });

    // Set to Active status
    mockedUseLoaderData.mockReturnValue({
      ...mockLoaderData,
      experiment: { id: 9002, status: "active" },
    });
    render(<EditExperiment />);

    // Scoping to the banner to avoid sidebar conflicts
    const banner = screen.getByTitle("Experiment created").closest("s-banner");
    const bannerPauseBtn = within(banner).getByRole("button", {
      name: /^Pause$/,
    });

    fireEvent.click(bannerPauseBtn);
    expect(submitMock).toHaveBeenCalledWith(
      { intent: "pause" },
      { method: "post" },
    );
  });
});
