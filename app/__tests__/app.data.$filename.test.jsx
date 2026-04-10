/**
 * Loader tests for app.data.$filename: fs.readFile is mocked (no real PDF I/O).
 * Follows team Remix/Vitest conventions.
 */

import path from "path";
import { promises as fs } from "fs";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { loader } from "../routes/app.data.$filename";

describe("app.data.$filename loader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes the resolved filename into the data directory path for readFile", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4", "utf8");
    vi.spyOn(fs, "readFile").mockResolvedValue(pdfBytes);

    await loader({ params: { filename: "some-doc" } });

    expect(fs.readFile).toHaveBeenCalledWith(
      path.join(process.cwd(), "app", "routes", "data", "some-doc.pdf"),
    );
  });

  it("returns a PDF Response with correct headers and body when the file exists", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 test", "utf8");
    vi.spyOn(fs, "readFile").mockResolvedValue(pdfBytes);

    const result = await loader({
      params: { filename: "quarterly-report" },
    });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(200);
    expect(result.headers.get("Content-Type")).toBe("application/pdf");
    expect(result.headers.get("Content-Disposition")).toBe(
      "inline; filename=quarterly-report.pdf",
    );
    const body = Buffer.from(await result.arrayBuffer());
    expect(body.equals(pdfBytes)).toBe(true);
  });

  it("throws a 404 Response when the file does not exist", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const err = await loader({ params: { filename: "missing" } }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(Response);
    expect(err.status).toBe(404);
    expect(await err.text()).toBe("404 Error: PDF not found");
    expect(consoleSpy).toHaveBeenCalledWith(
      "PDF not found: missing.pdf",
      expect.any(Error),
    );
  });
});
