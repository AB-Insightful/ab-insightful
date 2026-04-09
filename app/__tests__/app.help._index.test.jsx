import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useSearchParams } from "react-router";
import Help from "../routes/app.help._index";

vi.mock("react-router", () => ({
  useSearchParams: vi.fn(),
}));

describe("Help Index Page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useSearchParams.mockReturnValue([
      new URLSearchParams(), // no host param by default
    ]);
  });

  it("renders the Help heading", () => {
    render(<Help />);
    const page = document.querySelector('[data-s-page]');
    expect(page).toHaveAttribute("heading", "Help");
  });

  it("renders all four help sections", () => {
    render(<Help />);
    expect(screen.getByText(/Introduction to the app, navigation/)).toBeInTheDocument();
    expect(screen.getByText(/What an experiment is, how to create one/)).toBeInTheDocument();
    expect(screen.getByText(/How to read reports and draw conclusions/)).toBeInTheDocument();
    expect(screen.getByText(/Introduction to all reports available in the app/)).toBeInTheDocument();
  });

  it("renders View buttons with correct hrefs when no host param", () => {
    render(<Help />);
    const viewButtons = screen.getAllByText("View");
    expect(viewButtons.length).toBe(4);

    const gettingStartedBtn = viewButtons[0].closest("a") || viewButtons[0];
    expect(gettingStartedBtn).toHaveAttribute("href", "/app/help/getting-started");
  });

  it("preserves host query param in View button hrefs when present", () => {
    useSearchParams.mockReturnValue([
      new URLSearchParams({ host: "my-store.myshopify.com" }),
    ]);
    render(<Help />);
    const viewButtons = screen.getAllByText("View");
    const firstBtn = viewButtons[0].closest("a") || viewButtons[0];
    expect(firstBtn).toHaveAttribute(
      "href",
      "/app/help/getting-started?host=my-store.myshopify.com"
    );
  });

  it("shows Filter By: All by default", () => {
    render(<Help />);
    expect(screen.getByText(/Filter By:\s*All/)).toBeInTheDocument();
  });

  it("filters sections when Getting Started is selected", () => {
    render(<Help />);
    fireEvent.click(screen.getByText("Getting Started"));
    expect(screen.getByText(/Introduction to the app, navigation/)).toBeInTheDocument();
    expect(screen.queryByText(/Introduction to all reports available in the app/)).not.toBeInTheDocument();
  });

  it("filters sections when Manage Experiments is selected", () => {
    render(<Help />);
    fireEvent.click(screen.getByText("Manage Experiments"));
    expect(screen.getByText(/What an experiment is, how to create one/)).toBeInTheDocument();
    expect(screen.queryByText(/Introduction to all reports available in the app/)).not.toBeInTheDocument();
  });

  it("filters sections when Statistics is selected", () => {
    render(<Help />);
    fireEvent.click(screen.getByText("Statistics"));
    expect(screen.getByText(/How to read reports and draw conclusions/)).toBeInTheDocument();
    expect(screen.queryByText(/Introduction to the app, navigation/)).not.toBeInTheDocument();
  });

  it("filters sections when Reporting is selected", () => {
    render(<Help />);
    fireEvent.click(screen.getByText("Reporting"));
    expect(screen.getByText(/Introduction to all reports available in the app/)).toBeInTheDocument();
    expect(screen.queryByText(/Introduction to the app, navigation/)).not.toBeInTheDocument();
  });

  it("shows all sections when Show All is clicked after filtering", () => {
    render(<Help />);
    fireEvent.click(screen.getByText("Statistics"));
    fireEvent.click(screen.getByText("Show All"));
    expect(screen.getByText(/Introduction to the app, navigation/)).toBeInTheDocument();
    expect(screen.getByText(/Introduction to all reports available in the app/)).toBeInTheDocument();
  });

  it("shows pagination info: Showing 1-4 of 4 items", () => {
    render(<Help />);
    expect(screen.getByText(/Showing 1-4 of 4 items/)).toBeInTheDocument();
  });

  it("Previous button is disabled on first page", () => {
    render(<Help />);
    expect(screen.getByText("Previous")).toBeDisabled();
  });

  it("Next button is disabled when all items fit on one page", () => {
    render(<Help />);
    expect(screen.getByText("Next")).toBeDisabled();
  });
});
