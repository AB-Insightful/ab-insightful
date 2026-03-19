import { describe, it, expect } from "vitest";
import { ExperimentStatus } from "@prisma/client";
import {
  allowedStatusIntents,
  isIntentAllowed,
  isLockedStatus,
  canEditExperiment,
  canEditStructure,
  canEditSchedule,
  canRenameExperiment,
} from "../../routes/policies/experimentPolicy";

describe("experimentPolicy", () => {
  describe("allowedStatusIntents", () => {
    it("draft → start, delete", () => {
      expect([...allowedStatusIntents(ExperimentStatus.draft)].sort()).toEqual(
        ["delete", "start"].sort(),
      );
    });

    it("active → pause, end", () => {
      expect([...allowedStatusIntents(ExperimentStatus.active)].sort()).toEqual(
        ["pause", "end"].sort(),
      );
    });

    it("paused → resume, end", () => {
      expect([...allowedStatusIntents(ExperimentStatus.paused)].sort()).toEqual(
        ["resume", "end"].sort(),
      );
    });

    it("completed → archive", () => {
      expect([...allowedStatusIntents(ExperimentStatus.completed)]).toEqual([
        "archive",
      ]);
    });

    it("archived → nothing", () => {
      expect([...allowedStatusIntents(ExperimentStatus.archived)]).toEqual([]);
    });

    it("unknown status → nothing", () => {
      expect([...allowedStatusIntents("weird")]).toEqual([]);
    });
  });

  it("canRenameExperiment: always true", () => {
    expect(canRenameExperiment(ExperimentStatus.draft)).toBe(true);
    expect(canRenameExperiment("weird")).toBe(true);
  });

  it("isLockedStatus: completed/archived only", () => {
    expect(isLockedStatus(ExperimentStatus.completed)).toBe(true);
    expect(isLockedStatus(ExperimentStatus.archived)).toBe(true);

    expect(isLockedStatus(ExperimentStatus.draft)).toBe(false);
    expect(isLockedStatus(ExperimentStatus.active)).toBe(false);
    expect(isLockedStatus(ExperimentStatus.paused)).toBe(false);
    expect(isLockedStatus("weird")).toBe(false);
  });

  it("canEditExperiment: inverse of locked", () => {
    expect(canEditExperiment(ExperimentStatus.draft)).toBe(true);
    expect(canEditExperiment(ExperimentStatus.active)).toBe(true);
    expect(canEditExperiment(ExperimentStatus.paused)).toBe(true);

    expect(canEditExperiment(ExperimentStatus.completed)).toBe(false);
    expect(canEditExperiment(ExperimentStatus.archived)).toBe(false);
  });

  it("canEditStructure: draft only", () => {
    expect(canEditStructure(ExperimentStatus.draft)).toBe(true);
    expect(canEditStructure(ExperimentStatus.active)).toBe(false);
    expect(canEditStructure(ExperimentStatus.paused)).toBe(false);
    expect(canEditStructure(ExperimentStatus.completed)).toBe(false);
    expect(canEditStructure(ExperimentStatus.archived)).toBe(false);
  });

  it("canEditSchedule: draft/active/paused only", () => {
    expect(canEditSchedule(ExperimentStatus.draft)).toBe(true);
    expect(canEditSchedule(ExperimentStatus.active)).toBe(true);
    expect(canEditSchedule(ExperimentStatus.paused)).toBe(true);

    expect(canEditSchedule(ExperimentStatus.completed)).toBe(false);
    expect(canEditSchedule(ExperimentStatus.archived)).toBe(false);
  });

  it("isIntentAllowed: uses allowedStatusIntents()", () => {
    expect(isIntentAllowed(ExperimentStatus.draft, "start")).toBe(true);
    expect(isIntentAllowed(ExperimentStatus.draft, "pause")).toBe(false);

    expect(isIntentAllowed(ExperimentStatus.active, "pause")).toBe(true);
    expect(isIntentAllowed(ExperimentStatus.active, "resume")).toBe(false);

    expect(isIntentAllowed("weird", "start")).toBe(false);
  });
});
