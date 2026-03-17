import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useLoaderData } from "react-router";
import path from "path";
import { promises as fs } from "fs";
import ArticlePage, { loader } from "../routes/app.help.$article";

vi.mock("react-router", () => ({
  useLoaderData: vi.fn(),
}));

vi.mock("marked-react", () => ({
  default: ({ children }) => <div data-testid="markdown-content">{children}</div>,
}));

describe("Help Article Page", () => {
  describe("Component", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it("renders All Help Articles button", () => {
      useLoaderData.mockReturnValue({ article: "# Test Article\n\nContent here." });
      render(<ArticlePage />);
      const buttons = screen.getAllByText("All Help Articles");
      expect(buttons).toHaveLength(2);
    });

    it("renders article content via Markdown", () => {
      const articleContent = "# Getting Started\n\nWelcome to the app.";
      useLoaderData.mockReturnValue({ article: articleContent });
      render(<ArticlePage />);
      const markdown = screen.getByTestId("markdown-content");
      expect(markdown).toHaveTextContent(/Getting Started/);
      expect(markdown).toHaveTextContent(/Welcome to the app/);
    });

    it("renders page with Article heading", () => {
      useLoaderData.mockReturnValue({ article: "Content" });
      render(<ArticlePage />);
      const page = document.querySelector('[data-s-page]');
      expect(page).toHaveAttribute("heading", "Article");
    });

    it("All Help Articles buttons link to /app/help", () => {
      useLoaderData.mockReturnValue({ article: "Content" });
      render(<ArticlePage />);
      const buttons = screen.getAllByText("All Help Articles");
      buttons.forEach((btn) => {
        const el = btn.closest("a") || btn.closest("button");
        if (el?.hasAttribute?.("href")) {
          expect(el).toHaveAttribute("href", "/app/help");
        }
      });
    });
  });

  describe("Loader", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      vi.clearAllMocks();
    });

    it("returns article content when file exists", async () => {
      const mockContent = "# Getting Started\n\nStep 1: Install the app.";
      vi.spyOn(fs, "readFile").mockResolvedValue(mockContent);

      const result = await loader({
        params: { article: "getting-started" },
      });

      expect(result).toEqual({ article: mockContent });
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(process.cwd(), "app", "routes", "data", "getting-started.md"),
        "utf-8"
      );
    });

    it("returns fallback when file is not found", async () => {
      vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"));

      const result = await loader({
        params: { article: "nonexistent" },
      });

      expect(result).toEqual({
        article: "# The requested article was not found",
      });
    });

    it("uses params.filename when params.article is not present", async () => {
      const mockContent = "# Manage Experiments";
      vi.spyOn(fs, "readFile").mockResolvedValue(mockContent);

      await loader({
        params: { filename: "manage-experiments" },
      });

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(process.cwd(), "app", "routes", "data", "manage-experiments.md"),
        "utf-8"
      );
    });
  });
});
