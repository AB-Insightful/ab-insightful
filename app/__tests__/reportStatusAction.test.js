import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExperimentStatus } from "@prisma/client";

// mock authenticate
vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(async () => ({ session: { shop: "test.myshopify.com" } })),
  },
}));

// mock db
vi.mock("../db.server", () => ({
  default: {
    experiment: {
      findUnique: vi.fn(),
    },
  },
}));

// mock experiment.server services used by action
vi.mock("../services/experiment.server", () => ({
  startExperiment: vi.fn(),
  pauseExperiment: vi.fn(),
  resumeExperiment: vi.fn(),
  endExperiment: vi.fn(),
  archiveExperiment: vi.fn(),
  deleteExperiment: vi.fn(),
}));

import db from "../db.server";
import * as expSvc from "../services/experiment.server";

import { action } from "../routes/app.reports.$id.jsx";

function makeRequest(formObj) {
  return new Request("http://localhost/app/reports/1", {
    method: "POST",
    body: new URLSearchParams(formObj),
  });
}

describe("Report action - status changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks an intent not allowed by policy (draft cannot archive)", async () => {
    db.experiment.findUnique.mockResolvedValue({ id: 1, status: ExperimentStatus.draft });

    const res = await action({
      request: makeRequest({ intent: "archive" }),
      params: { id: "1" },
    });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not allowed/i);
    expect(expSvc.archiveExperiment).not.toHaveBeenCalled();
  });

  it("allows start when draft", async () => {
    db.experiment.findUnique.mockResolvedValue({ id: 1, status: ExperimentStatus.draft });

    const res = await action({
      request: makeRequest({ intent: "start" }),
      params: { id: "1" },
    });

    expect(expSvc.startExperiment).toHaveBeenCalledWith(1);
    expect(res.ok).toBe(true);
    expect(res.action).toBe(ExperimentStatus.active);
  });

  it("allows pause when active", async () => {
    db.experiment.findUnique.mockResolvedValue({ id: 1, status: ExperimentStatus.active });

    const res = await action({
      request: makeRequest({ intent: "pause" }),
      params: { id: "1" },
    });

    expect(expSvc.pauseExperiment).toHaveBeenCalledWith(1);
    expect(res.ok).toBe(true);
    expect(res.action).toBe(ExperimentStatus.paused);
  });

  it("returns error if experiment not found", async () => {
    db.experiment.findUnique.mockResolvedValue(null);

    const res = await action({
      request: makeRequest({ intent: "start" }),
      params: { id: "999" },
    });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });
});