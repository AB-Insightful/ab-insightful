import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(async () => ({ session: { shop: "test.myshopify.com" } })),
  },
}));

vi.mock("../db.server", () => ({
  default: {
    experiment: {
      findUnique: vi.fn(),
    },
    allocation: {
      count: vi.fn(),
    },
    analysis: {
      count: vi.fn(),
    },
  },
}));

vi.mock("../services/variant.server", () => ({
  getVariants: vi.fn(),
}));

vi.mock("../services/experiment.server", () => ({
  getExperimentReportData: vi.fn(),
  getAnalysis: vi.fn(),
  getExperimentById: vi.fn(),
  getImprovement: vi.fn(),
  startExperiment: vi.fn(),
  pauseExperiment: vi.fn(),
  resumeExperiment: vi.fn(),
  endExperiment: vi.fn(),
  deleteExperiment: vi.fn(),
  archiveExperiment: vi.fn(),
}));

vi.mock("../routes/policies/experimentPolicy", () => ({
  isLockedStatus: vi.fn(),
  allowedStatusIntents: vi.fn((status) => {
    if (status === "draft") return new Set(["start"]);
    if (status === "active") return new Set(["pause", "end", "archive"]);
    if (status === "paused") return new Set(["resume", "end", "archive"]);
    if (status === "completed") return new Set(["archive"]);
    if (status === "archived") return new Set();
    return new Set();
  }),
}));

import db from "../db.server";
import {
  getExperimentReportData,
  getAnalysis,
  getExperimentById,
  getImprovement,
  startExperiment,
  pauseExperiment,
  resumeExperiment,
  endExperiment,
  deleteExperiment,
  archiveExperiment,
} from "../services/experiment.server";
import { getVariants } from "../services/variant.server";

import { loader, action } from "../routes/app.reports.$id.jsx";

function makePostRequest(formObj) {
  return new Request("http://localhost/app/reports/1", {
    method: "POST",
    body: new URLSearchParams(formObj),
  });
}

describe("app.reports.$id unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    db.experiment.findUnique.mockResolvedValue({
      id: 1,
      status: "active",
      maxUsers: null,
      project: { maxUsersPerExperiment: 5000 },
    });

    db.allocation.count.mockResolvedValue(123);
    db.analysis.count.mockResolvedValue(3);

    getExperimentReportData.mockResolvedValue({
      id: 1,
      name: "Exp 1",
      analyses: [],
    });

    getVariants.mockResolvedValue([
      { id: 1, name: "Control" },
      { id: 2, name: "Variant A" },
    ]);

    getExperimentById.mockResolvedValue({
      id: 1,
      name: "Exp 1",
      status: "active",
      startDate: "2026-01-01T00:00:00Z",
    });

    getImprovement.mockResolvedValue(12.5);

    getAnalysis
      .mockResolvedValueOnce({
        id: 11,
        conversionRate: 0.1,
        probabilityOfBeingBest: 0.4,
        expectedLoss: 0.01,
        totalConversions: 10,
        totalUsers: 100,
      })
      .mockResolvedValueOnce(null);
  });

  describe("loader", () => {
    it("returns experiment null when id is invalid", async () => {
      const result = await loader({
        params: { id: "abc" },
        request: new Request("http://localhost/app/reports/abc"),
      });

      expect(result).toEqual({ experiment: null });
      expect(getExperimentReportData).not.toHaveBeenCalled();
    });

    it("throws 404 when experiment info is missing", async () => {
      getVariants.mockResolvedValue([]);
      getExperimentById.mockResolvedValue(null);

      await expect(
        loader({
          params: { id: "1" },
          request: new Request("http://localhost/app/reports/1"),
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("returns loader data for a valid experiment and filters null analyses", async () => {
      const result = await loader({
        params: { id: "1" },
        request: new Request("http://localhost/app/reports/1?segment=mobile"),
      });

      expect(getExperimentReportData).toHaveBeenCalledWith(1, "mobile");
      expect(getVariants).toHaveBeenCalledWith(1);
      expect(getExperimentById).toHaveBeenCalledWith(1);
      expect(getImprovement).toHaveBeenCalledWith(1, "mobile");

      expect(getAnalysis).toHaveBeenNthCalledWith(1, 1, 1, "mobile");
      expect(getAnalysis).toHaveBeenNthCalledWith(2, 1, 2, "mobile");

      expect(db.experiment.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { project: { select: { maxUsersPerExperiment: true } } },
      });

      expect(db.allocation.count).toHaveBeenCalledWith({
        where: { experimentId: 1 },
      });

      expect(result).toEqual({
        experiment: {
          id: 1,
          name: "Exp 1",
          analyses: [],
          status: "active",
          startDate: "2026-01-01T00:00:00Z",
          userCount: 123,
          effectiveMax: 5000,
        },
        analysis: [
          {
            id: 11,
            conversionRate: 0.1,
            probabilityOfBeingBest: 0.4,
            expectedLoss: 0.01,
            totalConversions: 10,
            totalUsers: 100,
            improvement: 12.5,
            variantName: "Control",
            experimentName: "Exp 1",
          },
        ],
        deviceSegment: "mobile",
      });
    });
  });

  describe("action", () => {
    it("returns an error for invalid experiment id", async () => {
      const res = await action({
        request: makePostRequest({ intent: "start" }),
        params: { id: "abc" },
      });

      expect(res).toEqual({ ok: false, error: "Invalid experiment id." });
    });

    it("returns an error if experiment is not found", async () => {
      db.experiment.findUnique.mockResolvedValue(null);

      const res = await action({
        request: makePostRequest({ intent: "start" }),
        params: { id: "999" },
      });

      expect(res).toEqual({ ok: false, error: "Experiment not found." });
    });

    it("blocks intents not allowed by policy", async () => {
      db.experiment.findUnique.mockResolvedValue({ id: 1, status: "draft" });

      const res = await action({
        request: makePostRequest({ intent: "archive" }),
        params: { id: "1" },
      });

      expect(res).toEqual({
        ok: false,
        error: "Status change not allowed for this experiment.",
      });
      expect(archiveExperiment).not.toHaveBeenCalled();
    });

    it("handles start intent", async () => {
      db.experiment.findUnique.mockResolvedValue({ id: 1, status: "draft" });

      const res = await action({
        request: makePostRequest({ intent: "start" }),
        params: { id: "1" },
      });

      expect(startExperiment).toHaveBeenCalledWith(1);
      expect(res).toEqual({ ok: true, action: "active" });
    });

    it("handles pause intent", async () => {
      db.experiment.findUnique.mockResolvedValue({ id: 1, status: "active" });

      const res = await action({
        request: makePostRequest({ intent: "pause" }),
        params: { id: "1" },
      });

      expect(pauseExperiment).toHaveBeenCalledWith(1);
      expect(res).toEqual({ ok: true, action: "paused" });
    });

    it("handles resume intent", async () => {
      db.experiment.findUnique.mockResolvedValue({ id: 1, status: "paused" });

      const res = await action({
        request: makePostRequest({ intent: "resume" }),
        params: { id: "1" },
      });

      expect(resumeExperiment).toHaveBeenCalledWith(1);
      expect(res).toEqual({ ok: true, action: "active" });
    });

    it("handles end intent", async () => {
      db.experiment.findUnique.mockResolvedValue({ id: 1, status: "active" });

      const res = await action({
        request: makePostRequest({ intent: "end" }),
        params: { id: "1" },
      });

      expect(endExperiment).toHaveBeenCalledWith(1);
      expect(res).toEqual({ ok: true, action: "completed" });
    });

    it("handles archive intent", async () => {
      db.experiment.findUnique.mockResolvedValue({ id: 1, status: "completed" });

      const res = await action({
        request: makePostRequest({ intent: "archive" }),
        params: { id: "1" },
      });

      expect(archiveExperiment).toHaveBeenCalledWith(1);
      expect(res).toEqual({ ok: true, action: "archived" });
    });

    it("handles delete intent", async () => {
    const { allowedStatusIntents } = await import("../routes/policies/experimentPolicy");

    db.experiment.findUnique.mockResolvedValue({ id: 1, status: "active" });
    vi.mocked(allowedStatusIntents).mockReturnValue(
        new Set(["pause", "end", "archive", "delete"]),
    );

    const res = await action({
        request: makePostRequest({ intent: "delete" }),
        params: { id: "1" },
    });

    expect(deleteExperiment).toHaveBeenCalledWith(1);
    expect(res).toEqual({ ok: true, action: "deleteExperiment" });
    });

    it("returns error for unknown intent", async () => {
    const { allowedStatusIntents } = await import("../routes/policies/experimentPolicy");

    db.experiment.findUnique.mockResolvedValue({ id: 1, status: "active" });
    vi.mocked(allowedStatusIntents).mockReturnValue(new Set(["weird"]));

    const res = await action({
        request: makePostRequest({ intent: "weird" }),
        params: { id: "1" },
    });

    expect(res).toEqual({ ok: false, error: "Unknown intent." });
    });

    it("returns failure when a status change throws", async () => {
    const { allowedStatusIntents } = await import("../routes/policies/experimentPolicy");

    db.experiment.findUnique.mockResolvedValue({ id: 1, status: "draft" });
    vi.mocked(allowedStatusIntents).mockReturnValue(new Set(["start"]));
    startExperiment.mockRejectedValue(new Error("boom"));

    const res = await action({
        request: makePostRequest({ intent: "start" }),
        params: { id: "1" },
    });

    expect(startExperiment).toHaveBeenCalledWith(1);
    expect(res).toEqual({ ok: false, error: "Failed to update status." });
    });
  });
});