import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(async () => ({ session: { shop: "test-shop.myshopify.com" } })),
  },
}));

vi.mock("../db.server", () => ({
  default: {
    experiment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    allocation: {
      count: vi.fn(),
    },
    goal: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../services/experiment.server", () => ({
  pauseExperiment: vi.fn(),
  resumeExperiment: vi.fn(),
  endExperiment: vi.fn(),
  startExperiment: vi.fn(),
  deleteExperiment: vi.fn(),
  archiveExperiment: vi.fn(),
}));

vi.mock("../routes/policies/experimentPolicy", () => ({
  canRenameExperiment: vi.fn(),
  isLockedStatus: vi.fn(),
  canEditStructure: vi.fn(),
  canEditSchedule: vi.fn(),
  allowedStatusIntents: vi.fn(),
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

vi.mock("../utils/validateMaxUsers", () => ({
  validateMaxUsers: vi.fn(),
}));

import db from "../db.server";
import {
  pauseExperiment,
  resumeExperiment,
  endExperiment,
  startExperiment,
  deleteExperiment,
  archiveExperiment,
} from "../services/experiment.server";
import {
  canRenameExperiment,
  isLockedStatus,
  canEditStructure,
  canEditSchedule,
  allowedStatusIntents,
} from "../routes/policies/experimentPolicy";
import { validateMaxUsers } from "../utils/validateMaxUsers";

import { loader, action } from "../routes/app.experiments.$id.jsx";

function makePostRequest(fields = {}) {
  return new Request("http://localhost/app/experiments/1", {
    method: "POST",
    body: new URLSearchParams(fields),
  });
}

function makeDraftExperiment(overrides = {}) {
  return {
    id: 1,
    status: "draft",
    name: "Spring Test",
    description: "Desc",
    sectionId: "fallback-section",
    controlSectionId: "control-sec",
    trafficSplit: 0.5,
    startDate: new Date("2026-05-01T10:00:00Z"),
    endDate: new Date("2026-05-10T10:00:00Z"),
    endCondition: "manual",
    probabilityToBeBest: null,
    duration: null,
    timeUnit: null,
    maxUsers: 1500,
    project: { maxUsersPerExperiment: 8000 },
    experimentGoals: [
      {
        goalRole: "primary",
        goal: { name: "Completed Checkout" },
      },
    ],
    variants: [
      {
        id: 11,
        name: "Control",
        trafficAllocation: 0.5,
        configData: { sectionId: "control-section" },
      },
      {
        id: 12,
        name: "Variant A",
        trafficAllocation: 0.5,
        configData: { sectionId: "variant-a-section" },
      },
    ],
    ...overrides,
  };
}

describe("app.experiments.$id unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(canRenameExperiment).mockImplementation(() => true);
    vi.mocked(isLockedStatus).mockImplementation(
      (status) => status === "completed" || status === "archived",
    );
    vi.mocked(canEditStructure).mockImplementation((status) => status === "draft");
    vi.mocked(canEditSchedule).mockImplementation(
      (status) => status === "draft" || status === "active" || status === "paused",
    );
    vi.mocked(allowedStatusIntents).mockImplementation((status) => {
      if (status === "draft") return new Set(["start", "delete"]);
      if (status === "active") return new Set(["pause", "end", "archive", "delete"]);
      if (status === "paused") return new Set(["resume", "end", "archive", "delete"]);
      if (status === "completed") return new Set(["archive"]);
      if (status === "archived") return new Set();
      return new Set();
    });
    vi.mocked(validateMaxUsers).mockReturnValue("");

    db.allocation.count.mockResolvedValue(321);
    db.goal.findUnique.mockResolvedValue({ id: 99, name: "Completed Checkout" });
    db.experiment.update.mockResolvedValue({ id: 1 });
  });

  describe("loader", () => {
    it("throws 400 for invalid experiment id", async () => {
      await expect(
        loader({
          params: { id: "abc" },
          request: new Request("http://localhost/app/experiments/abc"),
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("throws 404 when experiment is not found", async () => {
      db.experiment.findUnique.mockResolvedValue(null);

      await expect(
        loader({
          params: { id: "1" },
          request: new Request("http://localhost/app/experiments/1"),
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("returns shaped loader data for a normal experiment", async () => {
      db.experiment.findUnique.mockResolvedValue(makeDraftExperiment());

      const result = await loader({
        params: { id: "1" },
        request: new Request("http://localhost/app/experiments/1"),
      });

      expect(db.experiment.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          experimentGoals: { include: { goal: true } },
          variants: true,
          project: { select: { maxUsersPerExperiment: true } },
        },
      });

      expect(db.allocation.count).toHaveBeenCalledWith({
        where: { experimentId: 1 },
      });

      expect(result.shop).toBe("test-shop.myshopify.com");
      expect(result.appHandle).toBeDefined();
      expect(result.experiment).toMatchObject({
        id: 1,
        status: "draft",
        name: "Spring Test",
        description: "Desc",
        controlSectionId: "control-section",
        startDate: "2026-05-01",
        endDate: "2026-05-10",
        endCondition: "manual",
        goal: "completedCheckout",
        maxUsers: 1500,
        maxUsersPerExperiment: 8000,
        userCount: 321,
        effectiveMax: 1500,
      });
      expect(result.experiment.startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(result.experiment.endTime).toMatch(/^\d{2}:\d{2}$/);

      expect(result.experiment.variants).toEqual([
        {
          sectionId: "variant-a-section",
          trafficAllocation: 50,
        },
      ]);
    });

    it("falls back to sectionId/trafficSplit when no treatment variants exist", async () => {
      db.experiment.findUnique.mockResolvedValue(
        makeDraftExperiment({
          sectionId: "fallback-treatment",
          trafficSplit: 0.33,
          maxUsers: null,
          experimentGoals: [],
          variants: [
            {
              id: 11,
              name: "Control",
              trafficAllocation: 1,
              configData: { sectionId: "control-only" },
            },
          ],
        }),
      );

      const result = await loader({
        params: { id: "1" },
        request: new Request("http://localhost/app/experiments/1"),
      });

      expect(result.experiment.goal).toBe("completedCheckout");
      expect(result.experiment.effectiveMax).toBe(8000);
      expect(result.experiment.variants).toEqual([
        {
          sectionId: "fallback-treatment",
          trafficAllocation: 33,
        },
      ]);
    });

    it("maps other goal names correctly", async () => {
      db.experiment.findUnique.mockResolvedValue(
        makeDraftExperiment({
          experimentGoals: [
            {
              goalRole: "primary",
              goal: { name: "Added Product to Cart" },
            },
          ],
        }),
      );

      const result = await loader({
        params: { id: "1" },
        request: new Request("http://localhost/app/experiments/1"),
      });

      expect(result.experiment.goal).toBe("addToCart");
    });
  });

  describe("action status changes", () => {
    it("returns form error when experiment is missing", async () => {
      db.experiment.findUnique.mockResolvedValue(null);

      const res = await action({
        request: makePostRequest({ intent: "start" }),
        params: { id: "1" },
      });

      expect(res).toEqual({ errors: { form: "Experiment not found" } });
    });

    it("blocks status changes not allowed by policy", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
      });

      const res = await action({
        request: makePostRequest({ intent: "archive" }),
        params: { id: "1" },
      });

      expect(res).toEqual({
        ok: false,
        error: "Status change not allowed for this experiment.",
      });
    });

    it("handles pause intent", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "active",
        experimentGoals: [],
      });

      const res = await action({
        request: makePostRequest({ intent: "pause" }),
        params: { id: "1" },
      });

      expect(pauseExperiment).toHaveBeenCalledWith(1);
      expect(res).toEqual({ ok: true, action: "paused" });
    });

    it("handles resume intent", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "paused",
        experimentGoals: [],
      });

      const res = await action({
        request: makePostRequest({ intent: "resume" }),
        params: { id: "1" },
      });

      expect(resumeExperiment).toHaveBeenCalledWith(1);
      expect(res).toEqual({ ok: true, action: "active" });
    });

    it("handles archive intent", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "completed",
        experimentGoals: [],
      });
      vi.mocked(allowedStatusIntents).mockReturnValue(new Set(["archive"]));

      const res = await action({
        request: makePostRequest({ intent: "archive" }),
        params: { id: "1" },
      });

      expect(archiveExperiment).toHaveBeenCalledWith(1);
      expect(res).toEqual({ ok: true, action: "archived" });
    });

    it("handles delete intent", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "active",
        experimentGoals: [],
      });
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

    it("handles start intent", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
      });
      vi.mocked(allowedStatusIntents).mockReturnValue(new Set(["start", "delete"]));

      const res = await action({
        request: makePostRequest({ intent: "start" }),
        params: { id: "1" },
      });

      expect(startExperiment).toHaveBeenCalledWith(1);
      expect(res).toEqual({ ok: true, action: "active" });
    });

    it("handles end intent", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "active",
        experimentGoals: [],
      });

      const res = await action({
        request: makePostRequest({ intent: "end" }),
        params: { id: "1" },
      });

      expect(endExperiment).toHaveBeenCalledWith(1);
      expect(res).toEqual({ ok: true, action: "completed" });
    });

    it("returns status-change failure when a service throws", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
      });
      vi.mocked(allowedStatusIntents).mockReturnValue(new Set(["start", "delete"]));
      startExperiment.mockRejectedValue(new Error("boom"));

      const res = await action({
        request: makePostRequest({ intent: "start" }),
        params: { id: "1" },
      });

      expect(res).toEqual({ ok: false, error: "Failed to start experiment", status: 500, });
    });
  });

  describe("action edit flow", () => {
    it("allows rename-only mode for locked experiments", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "completed",
        experimentGoals: [],
      });

      db.experiment.update.mockResolvedValue({ id: 1 });

      const res = await action({
        request: makePostRequest({ name: "Renamed Experiment" }),
        params: { id: "1" },
      });

      expect(db.experiment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: "Renamed Experiment" },
      });
      expect(res).toEqual({ ok: true, experimentId: 1 });
    });

    it("blocks locked experiments when rename is blank", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "archived",
        experimentGoals: [],
      });

      const res = await action({
        request: makePostRequest({ name: "   " }),
        params: { id: "1" },
      });

      expect(res).toEqual({
        errors: { form: "This experiment can no longer be edited." },
      });
    });

    it("returns validation errors for missing required fields", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
      });

      vi.mocked(validateMaxUsers).mockReturnValue("");

      const res = await action({
        request: makePostRequest({
          name: "",
          description: "",
          variantsJSON: JSON.stringify([{ sectionId: "", trafficAllocation: 50 }]),
          endCondition: "stableSuccessProbability",
          probabilityToBeBest: "",
          duration: "",
          timeUnit: "",
          useAccountDefaultMaxUsers: "true",
          startDate: "",
          startTime: "",
        }),
        params: { id: "1" },
      });

      expect(res).toEqual({
        errors: expect.objectContaining({
          name: "Name is required",
          description: "Description is required",
          variant_0_sectionId: "Variant A Section ID is required",
          startDate: expect.any(String),
          probabilityToBeBest: "Probability is required",
          duration: "Duration is required",
          timeUnit: "Time unit is required",
        }),
      });
    });

    it("returns maxUsers validation errors", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
      });

      vi.mocked(validateMaxUsers).mockReturnValue("Bad max users");

      const res = await action({
        request: makePostRequest({
          name: "My Experiment",
          description: "Desc",
          variantsJSON: JSON.stringify([{ sectionId: "sec-a", trafficAllocation: 50 }]),
          endCondition: "manual",
          useAccountDefaultMaxUsers: "false",
          maxUsers: "0",
          startDateUTC: "2099-01-01T10:00:00.000Z",
        }),
        params: { id: "1" },
      });

      expect(res).toEqual({
        errors: expect.objectContaining({
          maxUsers: "Bad max users",
        }),
      });
    });

    it("returns goal error when matching goal record is missing", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
      });
      vi.mocked(validateMaxUsers).mockReturnValue("");
      db.goal.findUnique.mockResolvedValue(null);

      const res = await action({
        request: makePostRequest({
          name: "My Experiment",
          description: "Desc",
          controlSectionId: "control-sec",
          variantsJSON: JSON.stringify([{ sectionId: "sec-a", trafficAllocation: 50 }]),
          goal: "completedCheckout",
          endCondition: "manual",
          useAccountDefaultMaxUsers: "true",
          startDateUTC: "2099-01-01T10:00:00.000Z",
        }),
        params: { id: "1" },
      });

      expect(db.goal.findUnique).toHaveBeenCalledWith({
        where: { name: "Completed Checkout" },
      });
      expect(res).toEqual({
        errors: { goal: "Could not find matching goal in database" },
      });
    });

    it("updates a draft experiment with structure + goal ops", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
      });
      vi.mocked(validateMaxUsers).mockReturnValue("");
      db.goal.findUnique.mockResolvedValue({ id: 99, name: "Completed Checkout" });
      db.experiment.update.mockResolvedValue({ id: 1 });

      const res = await action({
        request: makePostRequest({
          name: "My Experiment",
          description: "Updated description",
          controlSectionId: "control-sec",
          variantsJSON: JSON.stringify([
            { sectionId: "sec-a", trafficAllocation: 30 },
            { sectionId: "sec-b", trafficAllocation: 20 },
          ]),
          goal: "completedCheckout",
          endCondition: "stableSuccessProbability",
          probabilityToBeBest: "80",
          duration: "7",
          timeUnit: "days",
          useAccountDefaultMaxUsers: "false",
          maxUsers: "2500",
          startDateUTC: "2099-01-01T10:00:00.000Z",
        }),
        params: { id: "1" },
      });

      expect(db.experiment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          name: "My Experiment",
          description: "Updated description",
          startDate: new Date("2099-01-01T10:00:00.000Z"),
          endDate: null,
          endCondition: "stableSuccessProbability",
          probabilityToBeBest: 80,
          duration: 7,
          timeUnit: "days",
          maxUsers: 2500,
          sectionId: "sec-a",
          controlSectionId: "control-sec",
          trafficSplit: 0.5,
          experimentGoals: {
            deleteMany: { goalRole: "primary" },
            create: [{ goalId: 99, goalRole: "primary" }],
          },
          variants: {
            deleteMany: {},
            create: [
              {
                name: "Control",
                configData: { sectionId: "control-sec" },
                trafficAllocation: 0.5,
              },
              {
                name: "Variant A",
                configData: { sectionId: "sec-a" },
                trafficAllocation: 0.3,
              },
              {
                name: "Variant B",
                configData: { sectionId: "sec-b" },
                trafficAllocation: 0.2,
              },
            ],
          },
        }),
      });

      expect(res).toEqual({ ok: true, experimentId: 1 });
    });

    it("updates a non-draft schedule without structure edits", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "active",
        experimentGoals: [],
      });
      vi.mocked(validateMaxUsers).mockReturnValue("");

      const res = await action({
        request: makePostRequest({
          name: "Active Experiment",
          description: "Desc",
          variantsJSON: JSON.stringify([{ sectionId: "sec-a", trafficAllocation: 50 }]),
          goal: "completedCheckout",
          endCondition: "manual",
          useAccountDefaultMaxUsers: "true",
          startDateUTC: "2099-01-01T10:00:00.000Z",
        }),
        params: { id: "1" },
      });

      expect(db.goal.findUnique).not.toHaveBeenCalled();
      expect(db.experiment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          name: "Active Experiment",
          description: "Desc",
          endCondition: "manual",
          endDate: null,
          probabilityToBeBest: null,
          duration: null,
          timeUnit: null,
          maxUsers: null,
        },
      });

      expect(res).toEqual({ ok: true, experimentId: 1 });
    });

    it("returns DB failure for rename-only update errors", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "completed",
        experimentGoals: [],
      });

      db.experiment.update.mockRejectedValue(new Error("db failed"));

      const res = await action({
        request: makePostRequest({ name: "Rename Me" }),
        params: { id: "1" },
      });

      expect(res).toEqual({
        errors: { form: "Database failed to rename experiment." },
      });
    });

    it("returns DB failure for edit update errors", async () => {
      db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
      });
      vi.mocked(validateMaxUsers).mockReturnValue("");
      db.goal.findUnique.mockResolvedValue({ id: 99, name: "Completed Checkout" });
      db.experiment.update.mockRejectedValue(new Error("db failed"));

      const res = await action({
        request: makePostRequest({
          name: "My Experiment",
          description: "Desc",
          controlSectionId: "control-sec",
          variantsJSON: JSON.stringify([{ sectionId: "sec-a", trafficAllocation: 50 }]),
          goal: "completedCheckout",
          endCondition: "manual",
          useAccountDefaultMaxUsers: "true",
          startDateUTC: "2099-01-01T10:00:00.000Z",
        }),
        params: { id: "1" },
      });

      expect(res).toEqual({
        errors: { form: "Database failed to update experiment." },
      });
    });
  });

  describe("extra unit coverage", () => {
    it("loader falls back to experiment.controlSectionId when control variant config section is missing", async () => {
        db.experiment.findUnique.mockResolvedValue(
        makeDraftExperiment({
            controlSectionId: "fallback-control-id",
            variants: [
            {
                id: 11,
                name: "Control",
                trafficAllocation: 0.5,
                configData: null,
            },
            {
                id: 12,
                name: "Variant A",
                trafficAllocation: 0.5,
                configData: { sectionId: "variant-a-section" },
            },
            ],
        }),
        );

        const result = await loader({
        params: { id: "1" },
        request: new Request("http://localhost/app/experiments/1"),
        });

        expect(result.experiment.controlSectionId).toBe("fallback-control-id");
    });

    it("loader falls back to 10000 effectiveMax when no experiment or project max is set", async () => {
        db.experiment.findUnique.mockResolvedValue(
        makeDraftExperiment({
            maxUsers: null,
            project: null,
        }),
        );

        const result = await loader({
        params: { id: "1" },
        request: new Request("http://localhost/app/experiments/1"),
        });

        expect(result.experiment.maxUsersPerExperiment).toBe(10000);
        expect(result.experiment.effectiveMax).toBe(10000);
    });

    it("loader maps Viewed Page goal correctly", async () => {
        db.experiment.findUnique.mockResolvedValue(
        makeDraftExperiment({
            experimentGoals: [
            {
                goalRole: "primary",
                goal: { name: "Viewed Page" },
            },
            ],
        }),
        );

        const result = await loader({
        params: { id: "1" },
        request: new Request("http://localhost/app/experiments/1"),
        });

        expect(result.experiment.goal).toBe("viewPage");
    });

    it("returns pause failure when pause service throws", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "active",
        experimentGoals: [],
        });
        pauseExperiment.mockRejectedValue(new Error("boom"));

        const res = await action({
        request: makePostRequest({ intent: "pause" }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        ok: false,
        error: "Failed to pause experiment",
        status: 500,
        });
    });

    it("returns resume failure when resume service throws", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "paused",
        experimentGoals: [],
        });
        resumeExperiment.mockRejectedValue(new Error("boom"));

        const res = await action({
        request: makePostRequest({ intent: "resume" }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        ok: false,
        error: "Failed to resume experiment",
        status: 500,
        });
    });

    it("returns archive failure when archive service throws", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "completed",
        experimentGoals: [],
        });
        vi.mocked(allowedStatusIntents).mockReturnValue(new Set(["archive"]));
        archiveExperiment.mockRejectedValue(new Error("boom"));

        const res = await action({
        request: makePostRequest({ intent: "archive" }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        ok: false,
        error: "Failed to archive experiment",
        status: 500,
        });
    });

    it("returns delete failure when delete service throws", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "active",
        experimentGoals: [],
        });
        vi.mocked(allowedStatusIntents).mockReturnValue(
        new Set(["pause", "end", "archive", "delete"]),
        );
        deleteExperiment.mockRejectedValue(new Error("boom"));

        const res = await action({
        request: makePostRequest({ intent: "delete" }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        ok: false,
        error: "Failed to delete experiment",
        status: 500,
        });
    });

    it("returns end failure when end service throws", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "active",
        experimentGoals: [],
        });
        endExperiment.mockRejectedValue(new Error("boom"));

        const res = await action({
        request: makePostRequest({ intent: "end" }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        ok: false,
        error: "Failed to end experiment",
        status: 500,
        });
    });

    it("returns validation error when endDate end condition is missing end date", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
        });

        const res = await action({
        request: makePostRequest({
            name: "My Experiment",
            description: "Desc",
            variantsJSON: JSON.stringify([{ sectionId: "sec-a", trafficAllocation: 50 }]),
            goal: "completedCheckout",
            endCondition: "endDate",
            startDateUTC: "2099-01-01T10:00:00.000Z",
            endDate: "",
            endTime: "",
            useAccountDefaultMaxUsers: "true",
        }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        errors: expect.objectContaining({
            endDate: "End date is required",
        }),
        });
    });

    it("returns validation error when endDate is before startDate", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
        });

        const res = await action({
        request: makePostRequest({
            name: "My Experiment",
            description: "Desc",
            variantsJSON: JSON.stringify([{ sectionId: "sec-a", trafficAllocation: 50 }]),
            goal: "completedCheckout",
            endCondition: "endDate",
            startDateUTC: "2099-01-02T10:00:00.000Z",
            endDateUTC: "2099-01-01T10:00:00.000Z",
            endDate: "2099-01-01",
            useAccountDefaultMaxUsers: "true",
        }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        errors: expect.objectContaining({
            endDate: "End must be after start date/time",
        }),
        });
    });

    it("returns validation error for non-integer stable success probability", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
        });

        const res = await action({
        request: makePostRequest({
            name: "My Experiment",
            description: "Desc",
            variantsJSON: JSON.stringify([{ sectionId: "sec-a", trafficAllocation: 50 }]),
            goal: "completedCheckout",
            endCondition: "stableSuccessProbability",
            probabilityToBeBest: "75.5",
            duration: "7",
            timeUnit: "days",
            startDateUTC: "2099-01-01T10:00:00.000Z",
            useAccountDefaultMaxUsers: "true",
        }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        errors: expect.objectContaining({
            probabilityToBeBest: "Probability must be a whole numer",
        }),
        });
    });

    it("returns validation error for probability outside allowed range", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
        });

        const res = await action({
        request: makePostRequest({
            name: "My Experiment",
            description: "Desc",
            variantsJSON: JSON.stringify([{ sectionId: "sec-a", trafficAllocation: 50 }]),
            goal: "completedCheckout",
            endCondition: "stableSuccessProbability",
            probabilityToBeBest: "50",
            duration: "7",
            timeUnit: "days",
            startDateUTC: "2099-01-01T10:00:00.000Z",
            useAccountDefaultMaxUsers: "true",
        }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        errors: expect.objectContaining({
            probabilityToBeBest: "Probability must be between 51-100",
        }),
        });
    });

    it("returns validation error for non-integer duration", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
        });

        const res = await action({
        request: makePostRequest({
            name: "My Experiment",
            description: "Desc",
            variantsJSON: JSON.stringify([{ sectionId: "sec-a", trafficAllocation: 50 }]),
            goal: "completedCheckout",
            endCondition: "stableSuccessProbability",
            probabilityToBeBest: "80",
            duration: "7.5",
            timeUnit: "days",
            startDateUTC: "2099-01-01T10:00:00.000Z",
            useAccountDefaultMaxUsers: "true",
        }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        errors: expect.objectContaining({
            duration: "Duration must be a whole number",
        }),
        });
    });

    it("returns validation error for duration less than 1", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
        });

        const res = await action({
        request: makePostRequest({
            name: "My Experiment",
            description: "Desc",
            variantsJSON: JSON.stringify([{ sectionId: "sec-a", trafficAllocation: 50 }]),
            goal: "completedCheckout",
            endCondition: "stableSuccessProbability",
            probabilityToBeBest: "80",
            duration: "0",
            timeUnit: "days",
            startDateUTC: "2099-01-01T10:00:00.000Z",
            useAccountDefaultMaxUsers: "true",
        }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        errors: expect.objectContaining({
            duration: "Duration must be at least 1",
        }),
        });
    });

    it("handles invalid variantsJSON by falling back to an empty array", async () => {
        db.experiment.findUnique.mockResolvedValue({
        id: 1,
        status: "draft",
        experimentGoals: [],
        });

        const res = await action({
        request: makePostRequest({
            name: "My Experiment",
            description: "Desc",
            variantsJSON: "{bad json",
            goal: "completedCheckout",
            endCondition: "manual",
            startDateUTC: "2099-01-01T10:00:00.000Z",
            useAccountDefaultMaxUsers: "true",
        }),
        params: { id: "1" },
        });

        expect(res).toEqual({
        ok: true,
        experimentId: 1,
        });

        expect(db.experiment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
            name: "My Experiment",
            description: "Desc",
            sectionId: "",
            controlSectionId: "",
            trafficSplit: 0,
            variants: {
            deleteMany: {},
            create: [
                {
                name: "Control",
                configData: null,
                trafficAllocation: 1,
                },
            ],
            },
        }),
        });
    });
    });

});