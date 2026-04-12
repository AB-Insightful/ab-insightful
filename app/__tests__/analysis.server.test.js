import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAnalysisSnapshot } from "../services/analysis.server";
import db from "../db.server";
import * as experimentService from "../services/experiment.server";
import { afterEach } from "vitest";
import { getAnalysisById } from "../services/analysis.server";


// Mock the database
vi.mock("../db.server", () => ({
  default: {
    experiment: { findMany: vi.fn() },
    allocation: { groupBy: vi.fn() },
    conversion: { groupBy: vi.fn() },
    analysis: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
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

describe("analysis.server.js", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers(); // timer so we can test the time based logic analysis
  });

  describe("getAnalysisById()", () => {
    it("returns the analysis row when id is provided", async () => {
      const mockAnalysis = { id: 123, probabilityOfBeingBest: 0.91 }; //seeds values to be extracted
      db.analysis.findUnique.mockResolvedValue(mockAnalysis);

      const result = await getAnalysisById(123);

      expect(db.analysis.findUnique).toHaveBeenCalledWith({
        where: {
          id: 123,
        },
        orderBy: {
          probabilityOfBeingBest: "desc",
        },
      });
      expect(result).toEqual(mockAnalysis);
    });

    it("returns null when id is missing", async () => {
      const result = await getAnalysisById();

      expect(db.analysis.findUnique).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  //Additional testing for createAnalysisSnapshot function
  describe("createAnalysisSnapshot()", () => {
    it("completes the full pipeline: aggregate data, save rows, and evaluate stableSuccessProbability termination", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 9110,
          startDate: new Date("2026-03-10"),
          endCondition: "stableSuccessProbability",
          probabilityToBeBest: 80,
          variants: [{ id: 101 }],
          experimentGoals: [{ goalId: 501 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 9110, variantId: 101, deviceType: "desktop", _count: { id: 100 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 9110, variantId: 101, goalId: 501, deviceType: "desktop", _count: { id: 50 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 2 });

      db.analysis.findFirst.mockResolvedValue({
        probabilityOfBeingBest: 0.95,
      });

      await createAnalysisSnapshot();

      //checking structural return of function
      expect(db.analysis.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              totalUsers: 100,
              totalConversions: 50,
              conversionRate: 0.5,
            }),
          ]),
        }),
      );

      //comparing mocked with function values
      expect(experimentService.setProbabilityOfBest).toHaveBeenCalledWith({
        experimentId: 9110,
        goalId: 501,
        deviceSegment: "all",
      });
      expect(experimentService.setProbabilityOfBest).toHaveBeenCalledWith({
        experimentId: 9110,
        goalId: 501,
        deviceSegment: "mobile",
      });
      expect(experimentService.setProbabilityOfBest).toHaveBeenCalledWith({
        experimentId: 9110,
        goalId: 501,
        deviceSegment: "desktop",
      });

      expect(experimentService.endExperiment).toHaveBeenCalledWith(9110);
    }); //end it("completes the full pipeline: aggregate data, save rows, and evaluate stableSuccessProbability termination")

    it("returns a no-op response when there are no active experiments", async () => {
      db.experiment.findMany.mockResolvedValue([]);

      const response = await createAnalysisSnapshot();
      const body = await response.json();

      expect(db.allocation.groupBy).not.toHaveBeenCalled();
      expect(db.conversion.groupBy).not.toHaveBeenCalled();
      expect(db.analysis.createMany).not.toHaveBeenCalled();
      expect(experimentService.setProbabilityOfBest).not.toHaveBeenCalled();
      expect(body).toEqual({
        message: "no experiments; no analysis. no-op.",
      });
      expect(response.status).toBe(200);
    }); //end it("returns a no-op response when there are no active experiments")

    it("returns a no-analysis-rows response when experiments exist but there are no allocations", async () => {
      //pre-load the db with values
      db.experiment.findMany.mockResolvedValue([
        {
          id: 2001,
          startDate: new Date("2026-03-01"),
          endCondition: "manual",
          variants: [{ id: 301 }],
          experimentGoals: [{ goalId: 401 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([]);
      db.conversion.groupBy.mockResolvedValue([]);

      const response = await createAnalysisSnapshot();
      const body = await response.json();

      expect(db.analysis.createMany).not.toHaveBeenCalled();

      
      expect(experimentService.setProbabilityOfBest).toHaveBeenCalledTimes(3); //kind of brittle, may need to be removed later.
      expect(experimentService.endExperiment).not.toHaveBeenCalled();

      expect(body).toEqual({
        message: "no analysis rows created.",
      });
      expect(response.status).toBe(200);
    });

    it("uses 1 day analyzed when startDate is missing", async () => {
      //pre-loaded values that will be called by snapshot function
      db.experiment.findMany.mockResolvedValue([
        {
          id: 3001,
          startDate: null,
          endCondition: "manual",
          variants: [{ id: 401 }],
          experimentGoals: [{ goalId: 501 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 3001, variantId: 401, deviceType: "mobile", _count: { id: 10 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 3001, variantId: 401, goalId: 501, deviceType: "mobile", _count: { id: 2 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 2 });

      //calls and returns mocked values (expected)
      await createAnalysisSnapshot();

      expect(db.analysis.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            daysAnalyzed: 1,
          }),
        ]),
      });
    });

    it("does not terminate when endCondition is endDate but endDate is missing", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 10003,
          startDate: new Date("2026-04-01"),
          endCondition: "endDate",
          endDate: null,
          variants: [{ id: 1203 }],
          experimentGoals: [{ goalId: 1303 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 10003, variantId: 1203, deviceType: "desktop", _count: { id: 20 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 10003, variantId: 1203, goalId: 1303, deviceType: "desktop", _count: { id: 5 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 1 });

      await createAnalysisSnapshot();

      expect(experimentService.endExperiment).not.toHaveBeenCalled();
    });

    it("does not terminate when endCondition is missing", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 10006,
          startDate: new Date("2026-03-01"),
          endCondition: null,
          variants: [{ id: 1206 }],
          experimentGoals: [{ goalId: 1306 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 10006, variantId: 1206, deviceType: "desktop", _count: { id: 10 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 10006, variantId: 1206, goalId: 1306, deviceType: "desktop", _count: { id: 2 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 1 });

      await createAnalysisSnapshot();

      expect(experimentService.endExperiment).not.toHaveBeenCalled();
      expect(db.analysis.findFirst).not.toHaveBeenCalled();
    });
    
    it("uses 0 conversions when a segment has users but no matching conversions", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 10100,
          startDate: new Date("2026-03-01"),
          endCondition: "manual",
          variants: [{ id: 201 }],
          experimentGoals: [{ goalId: 301 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 10100, variantId: 201, deviceType: "desktop", _count: { id: 20 } },
      ]);

      // No matching conversion row for that experiment/variant/goal/device segment
      db.conversion.groupBy.mockResolvedValue([]);

      db.analysis.createMany.mockResolvedValue({ count: 2 });

      await createAnalysisSnapshot();

      expect(db.analysis.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            deviceSegment: "all",
            totalUsers: 20,
            totalConversions: 0,
            conversionRate: 0,
            postAlpha: 1,
            postBeta: 21,
          }),
          expect.objectContaining({
            deviceSegment: "desktop",
            totalUsers: 20,
            totalConversions: 0,
            conversionRate: 0,
            postAlpha: 1,
            postBeta: 21,
          }),
        ]),
      });
    });

    it("maps missing deviceType to unknown and rolls it into all only", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 10004,
          startDate: new Date("2026-03-01"),
          endCondition: "manual",
          variants: [{ id: 1204 }],
          experimentGoals: [{ goalId: 1304 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 10004, variantId: 1204, deviceType: null, _count: { id: 12 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 10004, variantId: 1204, goalId: 1304, deviceType: null, _count: { id: 3 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 1 });

      await createAnalysisSnapshot();

      expect(db.analysis.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            deviceSegment: "all",
            totalUsers: 12,
            totalConversions: 3,
          }),
        ]),
      });
    });

    it("maps unexpected deviceType to unknown and rolls it into all only", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 10005,
          startDate: new Date("2026-03-01"),
          endCondition: "manual",
          variants: [{ id: 1205 }],
          experimentGoals: [{ goalId: 1305 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 10005, variantId: 1205, deviceType: "console", _count: { id: 8 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 10005, variantId: 1205, goalId: 1305, deviceType: "console", _count: { id: 2 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 1 });

      await createAnalysisSnapshot();

      expect(db.analysis.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            deviceSegment: "all",
            totalUsers: 8,
            totalConversions: 2,
          }),
        ]),
      });
    });

    it("creates both segmented and all-device rows from grouped data", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 4001,
          startDate: new Date("2026-03-01"),
          endCondition: "manual",
          variants: [{ id: 501 }],
          experimentGoals: [{ goalId: 601 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 4001, variantId: 501, deviceType: "mobile", _count: { id: 40 } },
        { experimentId: 4001, variantId: 501, deviceType: "tablet", _count: { id: 20 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 4001, variantId: 501, goalId: 601, deviceType: "mobile", _count: { id: 4 } },
        { experimentId: 4001, variantId: 501, goalId: 601, deviceType: "tablet", _count: { id: 1 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 2 });

      await createAnalysisSnapshot();

      expect(db.analysis.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            deviceSegment: "all",
            totalUsers: 60,
            totalConversions: 5,
            conversionRate: 5 / 60,
          }),
          expect.objectContaining({
            deviceSegment: "mobile",
            totalUsers: 40,
            totalConversions: 4,
            conversionRate: 0.1,
          }),
        ]),
      });

      expect(db.analysis.createMany).not.toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            deviceSegment: "desktop",
          }),
        ]),
      });
    }); //end it("creates both segmented and all-device rows from grouped data")

    it("terminates an experiment when endCondition is endDate and endDate has passed", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

      db.experiment.findMany.mockResolvedValue([
        {
          id: 5001,
          startDate: new Date("2026-04-01"),
          endCondition: "endDate",
          endDate: new Date("2026-04-09T12:00:00.000Z"),
          variants: [{ id: 601 }],
          experimentGoals: [{ goalId: 701 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 5001, variantId: 601, deviceType: "desktop", _count: { id: 20 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 5001, variantId: 601, goalId: 701, deviceType: "desktop", _count: { id: 5 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 2 });

      await createAnalysisSnapshot();

      expect(experimentService.endExperiment).toHaveBeenCalledWith(5001); //expecting 5001 to be ended be the experiment should be completed. 
    });

    it("does not terminate when endCondition is endDate and endDate has not passed", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

      db.experiment.findMany.mockResolvedValue([
        {
          id: 10002,
          startDate: new Date("2026-04-01"),
          endCondition: "endDate",
          endDate: new Date("2026-04-11T12:00:00.000Z"),
          variants: [{ id: 1202 }],
          experimentGoals: [{ goalId: 1302 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 10002, variantId: 1202, deviceType: "desktop", _count: { id: 20 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 10002, variantId: 1202, goalId: 1302, deviceType: "desktop", _count: { id: 5 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 1 });

      await createAnalysisSnapshot();

      expect(experimentService.endExperiment).not.toHaveBeenCalled();
    });

    it("does not terminate a manual experiment", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 6001,
          startDate: new Date("2026-03-01"),
          endCondition: "manual",
          variants: [{ id: 701 }],
          experimentGoals: [{ goalId: 801 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 6001, variantId: 701, deviceType: "desktop", _count: { id: 20 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 6001, variantId: 701, goalId: 801, deviceType: "desktop", _count: { id: 5 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 2 });

      await createAnalysisSnapshot();

      expect(experimentService.endExperiment).not.toHaveBeenCalled();
      expect(db.analysis.findFirst).not.toHaveBeenCalled(); //should not ebe called due to endCondition being manual
    });

    it("does not terminate stableSuccessProbability experiment when latest result is below threshold", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 7001,
          startDate: new Date("2026-03-01"),
          endCondition: "stableSuccessProbability",
          probabilityToBeBest: 90,
          variants: [{ id: 801 }],
          experimentGoals: [{ goalId: 901 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 7001, variantId: 801, deviceType: "desktop", _count: { id: 50 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 7001, variantId: 801, goalId: 901, deviceType: "desktop", _count: { id: 15 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 2 });
      db.analysis.findFirst.mockResolvedValue({
        probabilityOfBeingBest: 0.75,
      });

      await createAnalysisSnapshot();

      expect(db.analysis.findFirst).toHaveBeenCalledWith({
        where: {
          experimentId: 7001,
          deviceSegment: "all",
        },
        orderBy: { calculatedWhen: "desc" },
      });
      expect(experimentService.endExperiment).not.toHaveBeenCalled();
    });

    it("uses the default 80 threshold when probabilityToBeBest is not provided", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 8001,
          startDate: new Date("2026-03-01"),
          endCondition: "stableSuccessProbability",
          probabilityToBeBest: null,
          variants: [{ id: 901 }],
          experimentGoals: [{ goalId: 1001 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 8001, variantId: 901, deviceType: "desktop", _count: { id: 50 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 8001, variantId: 901, goalId: 1001, deviceType: "desktop", _count: { id: 25 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 2 });
      db.analysis.findFirst.mockResolvedValue({
        probabilityOfBeingBest: 0.8,
      });

      await createAnalysisSnapshot();

      expect(experimentService.endExperiment).toHaveBeenCalledWith(8001);
    });

    it("does not terminate stableSuccessProbability experiment when there is no latest result", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 9001,
          startDate: new Date("2026-03-01"),
          endCondition: "stableSuccessProbability",
          probabilityToBeBest: 80,
          variants: [{ id: 1001 }],
          experimentGoals: [{ goalId: 1101 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 9001, variantId: 1001, deviceType: "desktop", _count: { id: 15 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 9001, variantId: 1001, goalId: 1101, deviceType: "desktop", _count: { id: 3 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 2 });
      db.analysis.findFirst.mockResolvedValue(null);

      await createAnalysisSnapshot();

      expect(experimentService.endExperiment).not.toHaveBeenCalled();
    });

    it("does not terminate stableSuccessProbability experiment when probabilityOfBeingBest is null", async () => {
      db.experiment.findMany.mockResolvedValue([
        {
          id: 9101,
          startDate: new Date("2026-03-01"),
          endCondition: "stableSuccessProbability",
          probabilityToBeBest: 80,
          variants: [{ id: 1101 }],
          experimentGoals: [{ goalId: 1201 }],
        },
      ]);

      db.allocation.groupBy.mockResolvedValue([
        { experimentId: 9101, variantId: 1101, deviceType: "desktop", _count: { id: 15 } },
      ]);

      db.conversion.groupBy.mockResolvedValue([
        { experimentId: 9101, variantId: 1101, goalId: 1201, deviceType: "desktop", _count: { id: 3 } },
      ]);

      db.analysis.createMany.mockResolvedValue({ count: 2 });
      db.analysis.findFirst.mockResolvedValue({
        probabilityOfBeingBest: null,
      });

      await createAnalysisSnapshot();

      expect(experimentService.endExperiment).not.toHaveBeenCalled();
    });
  });
});