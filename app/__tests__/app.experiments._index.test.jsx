
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

//mocks the UI behavior and test rendering interactions

const {
  mockUseLoaderData,
  mockUseFetcher,
  mockUseRevalidator,
  mockUsePagination,
  mockSortRows,
  mockGetNextSort,
  mockFormatRuntime,
  mockFormatImprovement,
  mockAllowedStatusIntents,
} = vi.hoisted(() => ({
  mockUseLoaderData: vi.fn(),
  mockUseFetcher: vi.fn(),
  mockUseRevalidator: vi.fn(),
  mockUsePagination: vi.fn(),
  mockSortRows: vi.fn(),
  mockGetNextSort: vi.fn(),
  mockFormatRuntime: vi.fn(),
  mockFormatImprovement: vi.fn(),
  mockAllowedStatusIntents: vi.fn(),
}));

vi.mock("react-router", () => ({
  useLoaderData: mockUseLoaderData,
  useFetcher: mockUseFetcher,
  useRevalidator: mockUseRevalidator,
}));

vi.mock("../hooks/usePagination", () => ({
  usePagination: mockUsePagination,
}));

vi.mock("../hooks/Pagination", () => ({
  default: (props) => (
    <div data-testid="pagination">
      Pagination current:{props.currentPage} total:{props.totalPages}
    </div>
  ),
}));

vi.mock("../utils/formatRuntime.js", () => ({
  formatRuntime: mockFormatRuntime,
}));

vi.mock("../utils/formatImprovement.js", () => ({
  formatImprovement: mockFormatImprovement,
}));

vi.mock("../utils/sortExperimentsList", () => ({
  sortRows: mockSortRows,
  getNextSort: mockGetNextSort,
}));

vi.mock("../routes/policies/experimentPolicy", () => ({
  allowedStatusIntents: mockAllowedStatusIntents,
}));

vi.mock("../utils/experimentConstants.js", () => ({
  ExperimentStatus: {
    draft: "draft",
    active: "active",
    paused: "paused",
    completed: "completed",
    archived: "archived",
  },
}));

import ExperimentsIndex from "../routes/app.experiments._index";

function makeFetcher(overrides = {}) {
  return {
    state: "idle",
    data: undefined,
    submit: vi.fn(),
    ...overrides,
  };
}

function mockFetcherHooks(fetcher, tutorialFetcher) {
  let callCount = 0;
  mockUseFetcher.mockImplementation(() => {
    callCount += 1;
    return callCount % 2 === 1 ? fetcher : tutorialFetcher;
  });
}

function makeExperiment(overrides = {}) {
  return {
    id: 1,
    name: "Experiment One",
    status: "draft",
    createdAt: "2026-04-01T00:00:00.000Z",
    startDate: "2026-04-02T00:00:00.000Z",
    endDate: "2026-04-04T00:00:00.000Z",
    history: [],
    analyses: [],
    improvement: 0.15,
    userCount: 120,
    effectiveMax: 1000,
    ...overrides,
  };
}

describe("ExperimentsIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFormatRuntime.mockReturnValue("2 days");
    mockFormatImprovement.mockReturnValue("+15%");
    mockSortRows.mockImplementation((rows) => rows);
    mockGetNextSort.mockReturnValue({
      sortKey: "name",
      sortDirection: "asc",
    });

    mockAllowedStatusIntents.mockImplementation((status) => {
      const map = {
        draft: new Set(["start", "delete", "archive"]),
        active: new Set(["pause", "end", "archive"]),
        paused: new Set(["resume", "end", "archive"]),
        completed: new Set(["archive"]),
        archived: new Set([]),
      };
      return map[status] ?? new Set([]);
    });

    mockUsePagination.mockImplementation((items) => ({
      currentPage: 1,
      setCurrentPage: vi.fn(),
      totalPages: 1,
      startIndex: 0,
      paginatedItems: items,
    }));
  });

  it("renders populated state", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment()],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    const { container } = render(<ExperimentsIndex />);

    expect(container.querySelector('[data-s-page="true"]')).toBeTruthy();
    expect(screen.getByText("Experiment List")).toBeDefined();
    expect(screen.getAllByTestId("pagination")).toHaveLength(1);
  });

  it("renders empty state", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(screen.getByText("Your experiments will show here")).toBeDefined();
  });

  it("renders experiment row content", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment()],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(screen.getByText("Experiment One")).toBeDefined();
    expect(screen.getByText("2 days")).toBeDefined();
    expect(screen.getByText("+15%")).toBeDefined();
    expect(screen.getByText("120 / 1,000")).toBeDefined();
  });

  it("renders inconclusive probability when analyses are empty", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ analyses: [] })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(screen.getByText("inconclusive")).toBeDefined();
  });

  it("renders inconclusive when analyses have no valid probability values", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [
        makeExperiment({
          analyses: [
            { probabilityOfBeingBest: null, variant: { name: "A" } },
            { probabilityOfBeingBest: 2, variant: { name: "B" } },
          ],
        }),
      ],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(screen.getByText("inconclusive")).toBeDefined();
  });

  it("renders best probability text when valid analyses exist", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [
        makeExperiment({
          analyses: [
            { probabilityOfBeingBest: 0.4211, variant: { name: "Variant A" } },
            { probabilityOfBeingBest: 0.81234, variant: { name: "Variant B" } },
          ],
        }),
      ],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(screen.getByText("Variant B (81.23%)")).toBeDefined();
  });

  it("falls back to Unknown when best analysis has no variant name", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [
        makeExperiment({
          analyses: [{ probabilityOfBeingBest: 0.8, variant: null }],
        }),
      ],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(screen.getByText("Unknown (80.00%)")).toBeDefined();
  });

  it("renders valid statuses", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [
        makeExperiment({ id: 1, status: "draft", name: "Draft Exp" }),
        makeExperiment({ id: 2, status: "active", name: "Active Exp" }),
        makeExperiment({ id: 3, status: "paused", name: "Paused Exp" }),
        makeExperiment({ id: 4, status: "completed", name: "Completed Exp" }),
        makeExperiment({ id: 5, status: "archived", name: "Archived Exp" }),
      ],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(screen.getByText("Draft Exp")).toBeDefined();
    expect(screen.getByText("Active Exp")).toBeDefined();
    expect(screen.getByText("Paused Exp")).toBeDefined();
    expect(screen.getByText("Completed Exp")).toBeDefined();
    expect(screen.getByText("Archived Exp")).toBeDefined();

    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Paused").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Archived").length).toBeGreaterThan(0);
  });

  it("renders fallback dash for invalid status", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ status: "not-real" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(screen.getByText("—")).toBeDefined();
  });

  it("passes filtered experiments into sortRows", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();
    const experiments = [makeExperiment(), makeExperiment({ id: 2, name: "Second" })];

    mockUseLoaderData.mockReturnValue({
      experiments,
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(mockSortRows).toHaveBeenCalled();
    expect(mockSortRows.mock.calls[0][0]).toEqual(experiments);
  });

  it("renders allowed action buttons for active experiment", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ status: "active" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(screen.getByText("Pause")).toBeDefined();
    expect(screen.getByText("End")).toBeDefined();
    expect(screen.getByText("Archive")).toBeDefined();
  });

  it("renders allowed action buttons for draft experiment", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ status: "draft" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(screen.getByText("Start")).toBeDefined();
    expect(screen.getByText("Delete")).toBeDefined();
    expect(screen.getByText("Archive")).toBeDefined();
  });

  it("renders allowed action buttons for paused experiment", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ status: "paused" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(screen.getByText("Resume")).toBeDefined();
    expect(screen.getByText("End")).toBeDefined();
  });

  it("submits stats calculation once when fetcher is idle", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment()],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    expect(fetcher.submit).toHaveBeenCalledTimes(1);
    expect(fetcher.submit).toHaveBeenCalledWith(null, { method: "post" });
  });

  it("revalidates after successful refresh action", () => {
    const fetcher = makeFetcher({
      data: { ok: true, action: "paused" },
    });
    const tutorialFetcher = makeFetcher();
    const revalidator = { revalidate: vi.fn() };

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ status: "active" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue(revalidator);

    render(<ExperimentsIndex />);

    expect(revalidator.revalidate).toHaveBeenCalled();
  });

  it("does not revalidate for non-refresh action", () => {
    const fetcher = makeFetcher({
      data: { ok: true, action: "renamed" },
    });
    const tutorialFetcher = makeFetcher();
    const revalidator = { revalidate: vi.fn() };

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment()],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue(revalidator);

    render(<ExperimentsIndex />);

    expect(revalidator.revalidate).not.toHaveBeenCalled();
  });

  it("submits tutorial_viewed when tutorial button is clicked", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment()],
      tutorialData: { viewedListExperiment: false },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText("Understood. Do not show this again."));

    expect(tutorialFetcher.submit).toHaveBeenCalledWith(
      { intent: "tutorial_viewed" },
      { method: "post" },
    );
  });

  it("submits pause from active experiment action button", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ id: 55, status: "active" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText("Pause"));

    expect(fetcher.submit).toHaveBeenCalledWith(
      { intent: "pause", experimentId: 55 },
      { method: "post" },
    );
  });

  it("submits end from active experiment action button", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ id: 56, status: "active" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText("End"));

    expect(fetcher.submit).toHaveBeenCalledWith(
      { intent: "end", experimentId: 56 },
      { method: "post" },
    );
  });

  it("submits archive from active experiment action button", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ id: 57, status: "active" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText("Archive"));

    expect(fetcher.submit).toHaveBeenCalledWith(
      { intent: "archive", experimentId: 57 },
      { method: "post" },
    );
  });

  it("submits start from draft experiment action button", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ id: 58, status: "draft" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText("Start"));

    expect(fetcher.submit).toHaveBeenCalledWith(
      { intent: "start", experimentId: 58 },
      { method: "post" },
    );
  });

  it("submits delete from draft experiment action button", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ id: 59, status: "draft" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText("Delete"));

    expect(fetcher.submit).toHaveBeenCalledWith(
      { intent: "delete", experimentId: 59 },
      { method: "post" },
    );
  });

  it("submits resume from paused experiment action button", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ id: 60, status: "paused" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText("Resume"));

    expect(fetcher.submit).toHaveBeenCalledWith(
      { intent: "resume", experimentId: 60 },
      { method: "post" },
    );
  });

  it("clicking sort headers calls getNextSort", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment()],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText(/Name/));
    expect(mockGetNextSort).toHaveBeenCalled();
  });

    it("clicking filter buttons does not crash and keeps component rendered", () => {
        const fetcher = makeFetcher();
        const tutorialFetcher = makeFetcher();

        mockUseLoaderData.mockReturnValue({
            experiments: [
            makeExperiment({ id: 1, status: "draft" }),
            makeExperiment({ id: 2, status: "active" }),
            ],
            tutorialData: { viewedListExperiment: true },
        });
        mockFetcherHooks(fetcher, tutorialFetcher);
        mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

        const { container } = render(<ExperimentsIndex />);

        const filterButtons = Array.from(container.querySelectorAll("button"));
        const activeFilterButton = filterButtons.find(
            (button) => button.getAttribute("accessibilitylabel") === "Active experiments"
        );

        expect(activeFilterButton).toBeTruthy();

        fireEvent.click(activeFilterButton);
        expect(screen.getByText("Experiment List")).toBeDefined();
    });


  it("shows tutorial modal when tutorial has not been viewed", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment()],
      tutorialData: { viewedListExperiment: false },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    const { container } = render(<ExperimentsIndex />);

    const modal = container.querySelector('s-modal');
    expect(modal).toBeTruthy();
    expect(modal?.getAttribute('id')).toBe('tutorial-modal-settings');
    expect(modal?.getAttribute('heading')).toBe('Quick tour');
    expect(screen.getByText(/Understood\. Do not show this again\./)).toBeDefined();
  });

  it("enters rename mode and submits rename on confirm click", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ id: 77, name: "Original Name", status: "active" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    const { container } = render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText("Rename"));

    const input = container.querySelector('s-text-field');
    expect(input).toBeTruthy();
    fireEvent.input(input, { target: { value: "  Renamed From UI  " } });

    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('icon') === 'check-circle'
    );

    expect(confirmButton).toBeTruthy();
    fireEvent.click(confirmButton);

    expect(fetcher.submit).toHaveBeenCalledWith(
      { intent: "rename", experimentId: 77, newName: "Renamed From UI" },
      { method: "post" },
    );
  });

  it("shows client-side rename validation and clears it on input", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ id: 78, status: "active" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    const { container } = render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText("Rename"));

    const input = container.querySelector('s-text-field');
    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('icon') === 'check-circle'
    );

    expect(confirmButton).toBeTruthy();
    fireEvent.input(input, { target: { value: "   " } });
    fireEvent.click(confirmButton);

    const renamedInput = container.querySelector('s-text-field');
    expect(renamedInput.getAttribute('error')).toBe('Experiment name cannot be null');
    expect(fetcher.submit).toHaveBeenCalledTimes(1);

    fireEvent.input(renamedInput, { target: { value: "Valid Name" } });
    expect(container.querySelector('s-text-field').getAttribute('error')).toBeNull();
  });

  it("submits rename on Enter and cancels rename on Escape", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ id: 79, name: "Needs Rename", status: "active" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    const { container } = render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText("Rename"));
    let input = container.querySelector('s-text-field');
    fireEvent.input(input, { target: { value: "Enter Rename" } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(fetcher.submit).toHaveBeenCalledWith(
      { intent: "rename", experimentId: 79, newName: "Enter Rename" },
      { method: "post" },
    );

    fireEvent.keyDown(container.querySelector('s-text-field'), { key: 'Escape' });
    expect(container.querySelector('s-text-field')).toBeNull();
  });

  it("closes rename mode after a successful rename response", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ id: 80, name: "Success Name", status: "active" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    const { container, rerender } = render(<ExperimentsIndex />);
    fireEvent.click(screen.getByText("Rename"));
    expect(container.querySelector('s-text-field')).toBeTruthy();

    fetcher.data = { ok: true, action: 'renamed' };
    rerender(<ExperimentsIndex />);

    expect(container.querySelector('s-text-field')).toBeNull();
    expect(screen.getByText('Success Name')).toBeDefined();
  });

  it("shows server rename error response while staying in rename mode", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [makeExperiment({ id: 81, name: "Duplicate Target", status: "active" })],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    const { container, rerender } = render(<ExperimentsIndex />);
    fireEvent.click(screen.getByText("Rename"));

    fetcher.data = { ok: false, action: 'rename_error', error: 'Duplicate name' };
    rerender(<ExperimentsIndex />);

    const input = container.querySelector('s-text-field');
    expect(input).toBeTruthy();
    expect(input.getAttribute('error')).toBe('Duplicate name');
  });

  it("filters to active experiments when active filter is clicked", async () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();

    mockUseLoaderData.mockReturnValue({
      experiments: [
        makeExperiment({ id: 90, name: "Draft Only", status: "draft" }),
        makeExperiment({ id: 91, name: "Active Only", status: "active" }),
      ],
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });
    mockUsePagination.mockImplementation((items) => ({
      currentPage: 1,
      setCurrentPage: vi.fn(),
      totalPages: 1,
      startIndex: 0,
      paginatedItems: items,
    }));

    const { container } = render(<ExperimentsIndex />);
    const activeFilterButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('accessibilitylabel') === 'Active experiments'
    );

    expect(activeFilterButton).toBeTruthy();
    fireEvent.click(activeFilterButton);

    await waitFor(() => {
      expect(screen.queryByText('Draft Only')).toBeNull();
    });
    expect(screen.getByText('Active Only')).toBeDefined();
  });

  it("passes selector values for multiple sort branches into sortRows", () => {
    const fetcher = makeFetcher();
    const tutorialFetcher = makeFetcher();
    const experiments = [
      makeExperiment({
        id: 101,
        name: null,
        status: 'active',
        startDate: null,
        createdAt: null,
        improvement: null,
        userCount: null,
        analyses: [],
      }),
      makeExperiment({
        id: 102,
        name: 'Sortable',
        status: 'draft',
        startDate: '2026-04-02T00:00:00.000Z',
        endDate: '2026-04-03T00:00:00.000Z',
        createdAt: '2026-04-01T00:00:00.000Z',
        improvement: 0.25,
        userCount: 5,
        analyses: [{ probabilityOfBeingBest: 0.3333, variant: { name: 'A' } }],
      }),
    ];

    const captured = [];
    mockSortRows.mockImplementation((rows, selector, direction) => {
      captured.push({
        direction,
        first: selector(rows[0]),
        second: selector(rows[1]),
      });
      return rows;
    });

    mockUseLoaderData.mockReturnValue({
      experiments,
      tutorialData: { viewedListExperiment: true },
    });
    mockFetcherHooks(fetcher, tutorialFetcher);
    mockUseRevalidator.mockReturnValue({ revalidate: vi.fn() });

    mockGetNextSort.mockImplementation((clickedKey) => ({
      sortKey: clickedKey,
      sortDirection: 'asc',
    }));

    const { rerender } = render(<ExperimentsIndex />);

    fireEvent.click(screen.getByText(/Name/));
    rerender(<ExperimentsIndex />);
    fireEvent.click(screen.getByText(/Status/));
    rerender(<ExperimentsIndex />);
    fireEvent.click(screen.getByText(/Runtime/));
    rerender(<ExperimentsIndex />);
    fireEvent.click(screen.getByText(/Users/));
    rerender(<ExperimentsIndex />);
    fireEvent.click(screen.getByText(/Improvement/));
    rerender(<ExperimentsIndex />);
    fireEvent.click(screen.getByText(/Probability of best/));
    rerender(<ExperimentsIndex />);
    fireEvent.click(screen.getByText(/Goal Completion Rate/));
    rerender(<ExperimentsIndex />);

    expect(captured.some((entry) => entry.second === 'Sortable')).toBe(true);
    expect(captured.some((entry) => entry.second === 'draft')).toBe(true);
    expect(captured.some((entry) => entry.second === 86400000)).toBe(true);
    expect(captured.some((entry) => entry.second === 5)).toBe(true);
    expect(captured.some((entry) => entry.second === 0.25)).toBe(true);
    expect(captured.some((entry) => entry.second === 0.3333)).toBe(true);
    expect(captured.some((entry) => entry.first === null && typeof entry.second === 'number' && entry.second > 1000000000000)).toBe(true);
  });

});