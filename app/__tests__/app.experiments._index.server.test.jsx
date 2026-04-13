import { describe, it, expect, vi, beforeEach } from "vitest";
//models the loader and action functionality of app.experiments._index.server.jsx

const {
  mockDb,
  experimentServiceMocks,
  tutorialServiceMocks,
  allowedStatusIntentsMock,
} = vi.hoisted(() => ({
  mockDb: {
    allocation: {
      count: vi.fn(),
    },
    experiment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  experimentServiceMocks: {
    getExperimentsList: vi.fn(),
    getImprovement: vi.fn(),
    pauseExperiment: vi.fn(),
    resumeExperiment: vi.fn(),
    endExperiment: vi.fn(),
    startExperiment: vi.fn(),
    deleteExperiment: vi.fn(),
    archiveExperiment: vi.fn(),
    getExperimentsWithAnalyses: vi.fn(),
    updateProbabilityOfBest: vi.fn(),
  },
  tutorialServiceMocks: {
    getTutorialData: vi.fn(),
    setViewedListExp: vi.fn(),
  },
  allowedStatusIntentsMock: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: mockDb,
}));

vi.mock("../services/experiment.server", () => experimentServiceMocks);

vi.mock("../services/tutorialData.server", () => tutorialServiceMocks);

vi.mock("../routes/policies/experimentPolicy", () => ({
  allowedStatusIntents: allowedStatusIntentsMock,
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

import { loader, action } from "../routes/app.experiments._index";

function makeRequest(entries) {
  const form = new FormData();
  Object.entries(entries).forEach(([key, value]) => {
    form.append(key, value);
  });

  return {
    formData: vi.fn().mockResolvedValue(form),
  };
}

describe("app.experiments._index loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns enriched experiments with improvement, userCount, and project fallback effectiveMax", async () => {
    experimentServiceMocks.getExperimentsList.mockResolvedValue([
      {
        id: 1,
        name: "Exp A",
        maxUsers: null,
        project: { maxUsersPerExperiment: 5000 },
      },
    ]);
    tutorialServiceMocks.getTutorialData.mockResolvedValue({
      viewedListExperiment: false,
    });
    experimentServiceMocks.getImprovement.mockResolvedValue(12.5);
    mockDb.allocation.count.mockResolvedValue(120);

    const result = await loader();

    expect(result).toEqual({
      experiments: [
        expect.objectContaining({
          id: 1,
          improvement: 12.5,
          userCount: 120,
          effectiveMax: 5000,
        }),
      ],
      tutorialData: { viewedListExperiment: false },
    });
  });

  it("uses experiment maxUsers when present", async () => {
    experimentServiceMocks.getExperimentsList.mockResolvedValue([
      {
        id: 2,
        name: "Exp B",
        maxUsers: 2500,
        project: { maxUsersPerExperiment: 9000 },
      },
    ]);
    tutorialServiceMocks.getTutorialData.mockResolvedValue({
      viewedListExperiment: true,
    });
    experimentServiceMocks.getImprovement.mockResolvedValue(0);
    mockDb.allocation.count.mockResolvedValue(10);

    const result = await loader();

    expect(result.experiments[0]).toEqual(
      expect.objectContaining({
        effectiveMax: 2500,
      }),
    );
  });

  it("falls back to 10000 when no max values exist", async () => {
    experimentServiceMocks.getExperimentsList.mockResolvedValue([
      {
        id: 3,
        name: "Exp C",
        maxUsers: null,
        project: null,
      },
    ]);
    tutorialServiceMocks.getTutorialData.mockResolvedValue({
      viewedListExperiment: true,
    });
    experimentServiceMocks.getImprovement.mockResolvedValue(-2);
    mockDb.allocation.count.mockResolvedValue(0);

    const result = await loader();

    expect(result.experiments[0]).toEqual(
      expect.objectContaining({
        effectiveMax: 10000,
      }),
    );
  });
});

describe("app.experiments._index action", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    allowedStatusIntentsMock.mockImplementation((status) => {
      const map = {
        draft: new Set(["start", "delete", "archive"]),
        active: new Set(["pause", "end", "archive"]),
        paused: new Set(["resume", "end", "archive"]),
        completed: new Set(["archive"]),
        archived: new Set([]),
      };
      return map[status] ?? new Set([]);
    });
  });

  it("rejects invalid experiment id for status intents", async () => {
    const result = await action({
      request: makeRequest({ intent: "pause", experimentId: "abc" }),
    });

    expect(result).toEqual({
      ok: false,
      error: "Invalid experiment id.",
    });
  });

  it("rejects missing experiment for status intents", async () => {
    mockDb.experiment.findUnique.mockResolvedValue(null);

    const result = await action({
      request: makeRequest({ intent: "pause", experimentId: "10" }),
    });

    expect(result).toEqual({
      ok: false,
      error: "Experiment not found.",
    });
  });

  it("rejects disallowed status change", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "archived" });

    const result = await action({
      request: makeRequest({ intent: "pause", experimentId: "10" }),
    });

    expect(result).toEqual({
      ok: false,
      error: "Status change not allowed for this experiment.",
    });
  });

  it("pauses experiment", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "active" });

    const result = await action({
      request: makeRequest({ intent: "pause", experimentId: "11" }),
    });

    expect(experimentServiceMocks.pauseExperiment).toHaveBeenCalledWith(11);
    expect(result).toEqual({ ok: true, action: "paused" });
  });

  it("returns pause failure when pauseExperiment throws", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "active" });
    experimentServiceMocks.pauseExperiment.mockRejectedValue(new Error("pause failed"));

    const result = await action({
      request: makeRequest({ intent: "pause", experimentId: "21" }),
    });

    expect(result).toEqual({ ok: false, error: "Failed to pause experiment", status: 500 });
  });

  it("resumes experiment", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "paused" });

    const result = await action({
      request: makeRequest({ intent: "resume", experimentId: "12" }),
    });

    expect(experimentServiceMocks.resumeExperiment).toHaveBeenCalledWith(12);
    expect(result).toEqual({ ok: true, action: "active" });
  });

  it("returns resume failure when resumeExperiment throws", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "paused" });
    experimentServiceMocks.resumeExperiment.mockRejectedValue(new Error("resume failed"));

    const result = await action({
      request: makeRequest({ intent: "resume", experimentId: "22" }),
    });

    expect(result).toEqual({ ok: false, error: "Failed to resume experiment", status: 500 });
  });

  it("starts experiment", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "draft" });

    const result = await action({
      request: makeRequest({ intent: "start", experimentId: "13" }),
    });

    expect(experimentServiceMocks.startExperiment).toHaveBeenCalledWith(13);
    expect(result).toEqual({ ok: true, action: "active" });
  });

  it("returns start failure when startExperiment throws", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "draft" });
    experimentServiceMocks.startExperiment.mockRejectedValue(new Error("start failed"));

    const result = await action({
      request: makeRequest({ intent: "start", experimentId: "25" }),
    });

    expect(result).toEqual({ ok: false, error: "Failed to start experiment", status: 500 });
  });

  it("ends experiment", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "active" });

    const result = await action({
      request: makeRequest({ intent: "end", experimentId: "14" }),
    });

    expect(experimentServiceMocks.endExperiment).toHaveBeenCalledWith(14);
    expect(result).toEqual({ ok: true, action: "completed" });
  });

  it("returns end failure when endExperiment throws", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "active" });
    experimentServiceMocks.endExperiment.mockRejectedValue(new Error("end failed"));

    const result = await action({
      request: makeRequest({ intent: "end", experimentId: "26" }),
    });

    expect(result).toEqual({ ok: false, error: "Failed to end experiment", status: 500 });
  });

  it("archives experiment", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "completed" });

    const result = await action({
      request: makeRequest({ intent: "archive", experimentId: "15" }),
    });

    expect(experimentServiceMocks.archiveExperiment).toHaveBeenCalledWith(15);
    expect(result).toEqual({ ok: true, action: "archived" });
  });

  it("returns archive failure when archiveExperiment throws", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "completed" });
    experimentServiceMocks.archiveExperiment.mockRejectedValue(new Error("archive failed"));

    const result = await action({
      request: makeRequest({ intent: "archive", experimentId: "23" }),
    });

    expect(result).toEqual({ ok: false, error: "Failed to archive experiment", status: 500 });
  });

  it("deletes experiment", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "draft" });

    const result = await action({
      request: makeRequest({ intent: "delete", experimentId: "16" }),
    });

    expect(experimentServiceMocks.deleteExperiment).toHaveBeenCalledWith(16);
    expect(result).toEqual({ ok: true, action: "deleteExperiment" });
  });

  it("returns delete failure when deleteExperiment throws", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ status: "draft" });
    experimentServiceMocks.deleteExperiment.mockRejectedValue(new Error("delete failed"));

    const result = await action({
      request: makeRequest({ intent: "delete", experimentId: "24" }),
    });

    expect(result).toEqual({ ok: false, error: "Failed to delete experiment", status: 500 });
  });

  it("returns rename error when new name is empty", async () => {
    const result = await action({
      request: makeRequest({
        intent: "rename",
        experimentId: "17",
        newName: "   ",
      }),
    });

    expect(result).toEqual({
      ok: false,
      action: "rename_error",
      error: "Experiment name cannot be null",
    });
  });

  it("returns rename error when experiment is not found", async () => {
    mockDb.experiment.findUnique.mockResolvedValue(null);

    const result = await action({
      request: makeRequest({
        intent: "rename",
        experimentId: "18",
        newName: "New Name",
      }),
    });

    expect(result).toEqual({
      ok: false,
      action: "rename_error",
      error: "Experiment not found.",
    });
  });

  it("returns rename error when duplicate exists", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ projectId: 33 });
    mockDb.experiment.findFirst.mockResolvedValue({ id: 999 });

    const result = await action({
      request: makeRequest({
        intent: "rename",
        experimentId: "19",
        newName: "Duplicate Name",
      }),
    });

    expect(result).toEqual({
      ok: false,
      action: "rename_error",
      error: "An experiment with that name already exists.",
    });
  });

  it("renames experiment when name is valid and unique", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ projectId: 44 });
    mockDb.experiment.findFirst.mockResolvedValue(null);
    mockDb.experiment.update.mockResolvedValue({});

    const result = await action({
      request: makeRequest({
        intent: "rename",
        experimentId: "20",
        newName: "Renamed Experiment",
      }),
    });

    expect(mockDb.experiment.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { name: "Renamed Experiment" },
    });

    expect(result).toEqual({
      ok: true,
      action: "renamed",
    });
  });

  it("returns rename error when rename update throws", async () => {
    mockDb.experiment.findUnique.mockResolvedValue({ projectId: 44 });
    mockDb.experiment.findFirst.mockResolvedValue(null);
    mockDb.experiment.update.mockRejectedValue(new Error("boom"));

    const result = await action({
      request: makeRequest({
        intent: "rename",
        experimentId: "20",
        newName: "Renamed Experiment",
      }),
    });

    expect(result).toEqual({
      ok: false,
      action: "rename_error",
      error: "Failed to rename experiment.",
    });
  });

  it("marks tutorial as viewed", async () => {
    const result = await action({
      request: makeRequest({ intent: "tutorial_viewed" }),
    });

    expect(tutorialServiceMocks.setViewedListExp).toHaveBeenCalledWith(1, true);
    expect(result).toEqual({
      ok: true,
      action: "tutorial_viewed",
    });
  });

  it("returns tutorial failure when tutorial update throws", async () => {
    tutorialServiceMocks.setViewedListExp.mockRejectedValue(new Error("tutorial failed"));

    const result = await action({
      request: makeRequest({ intent: "tutorial_viewed" }),
    });

    expect(result).toEqual({ ok: false, error: "Failed to update viewedListExperiment", status: 500});
  });

  it("runs the default analysis branch", async () => {
    const list = [{ id: 1 }, { id: 2 }];
    experimentServiceMocks.getExperimentsWithAnalyses.mockResolvedValue(list);
    experimentServiceMocks.updateProbabilityOfBest.mockResolvedValue(undefined);

    const result = await action({
      request: makeRequest({ intent: "anything_else" }),
    });

    expect(experimentServiceMocks.updateProbabilityOfBest).toHaveBeenCalledWith(list);
    expect(result).toEqual({
      ok: true,
      action: "analysis_updated",
    });
  });

  it("returns analysis failure when probability update throws", async () => {
    const list = [{ id: 1 }];
    experimentServiceMocks.getExperimentsWithAnalyses.mockResolvedValue(list);
    experimentServiceMocks.updateProbabilityOfBest.mockRejectedValue(new Error("analysis failed"));

    const result = await action({
      request: makeRequest({ intent: "refresh_stats" }),
    });

    expect(result).toEqual({ ok: false, error: "Stats calculation failed", status: 500});
  });
});
