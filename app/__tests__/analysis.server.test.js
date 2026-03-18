import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAnalysisSnapshot } from "../services/analysis.server";
import db from "../db.server";
import * as experimentService from "../services/experiment.server";

// Mock the database
vi.mock("../db.server", () => ({
  default: {
    experiment: { findMany: vi.fn() },
    allocation: { groupBy: vi.fn() },
    conversion: { groupBy: vi.fn() },
    analysis: { 
      createMany: vi.fn(), 
      findFirst: vi.fn() 
    },
  },
}));

// Mock the experiment service functions
vi.mock("../services/experiment.server", () => ({
  setProbabilityOfBest: vi.fn(),
  endExperiment: vi.fn(),
}));

describe("analysis.server.js -> createAnalysisSnapshot()", () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should complete the full pipeline: aggregate data, save rows, and evaluate termination", async () => {
    
    // Mock 1 Active Experiment
    db.experiment.findMany.mockResolvedValue([{
      id: 9110,
      startDate: new Date("2026-03-10"),
      endCondition: "stableSuccessProbability",
      probabilityToBeBest: 80,
      variants: [{ id: 101 }],
      experimentGoals: [{ goalId: 501 }]
    }]);

    // Mock Allocation (100 users) and Conversion (50 users)
    db.allocation.groupBy.mockResolvedValue([
      { experimentId: 9110, variantId: 101, deviceType: "desktop", _count: { id: 100 } }
    ]);
    db.conversion.groupBy.mockResolvedValue([
      { experimentId: 9110, variantId: 101, goalId: 501, deviceType: "desktop", _count: { id: 50 } }
    ]);

    // Mock the "Winning" result for the termination check
    db.analysis.findFirst.mockResolvedValue({
      probabilityOfBeingBest: 0.95 // 95% is > 80% target
    });

    await createAnalysisSnapshot();
    
    // 1. Check if it calculated the correct math for the DB save
    expect(db.analysis.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            totalUsers: 100,
            totalConversions: 50,
            conversionRate: 0.5
          })
        ])
      })
    );

    // 2. Check if the math engine was triggered
    expect(experimentService.setProbabilityOfBest).toHaveBeenCalled();

    // 3. Check if the Auto-Termination was triggered based on the 95% result
    expect(experimentService.endExperiment).toHaveBeenCalledWith(9110);
  });
});