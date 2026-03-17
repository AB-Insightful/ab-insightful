// notifications.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock AWS SNS ─────────────────────────────────────────────────────────────
// SNSClient must be mocked as a class — arrow functions can't be used with `new`
const mockSend = vi.fn().mockResolvedValue({ MessageId: "mock-message-id-123" });
vi.mock("@aws-sdk/client-sns", () => {
    class SNSClient {
        constructor(config) { this.config = config; }
        send = mockSend;
    }
    class PublishCommand {
        constructor(input) { this.input = input; this.__type = "PublishCommand"; }
    }
    class SubscribeCommand {
        constructor(input) { this.input = input; this.__type = "SubscribeCommand"; }
    }
    return { SNSClient, PublishCommand, SubscribeCommand };
});

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const mockProjectFindUnique = vi.fn();
vi.mock("../db.server.js", () => ({
    default: {
        project: { findUnique: mockProjectFindUnique },
    },
}));

// ─── Mock experiment/variant services ────────────────────────────────────────
const mockGetVariants = vi.fn();
const mockGetAnalysis = vi.fn();
const mockStartExperiment = vi.fn().mockResolvedValue({ ok: true });
const mockEndExperiment = vi.fn().mockResolvedValue({ ok: true });

vi.mock("../services/experiment.server.js", () => ({
    getAnalysis: mockGetAnalysis,
    startExperiment: mockStartExperiment,
    endExperiment: mockEndExperiment,
}));

vi.mock("../services/variant.server.js", () => ({
    getVariants: mockGetVariants,
}));

// ─── Import after mocks are set up ───────────────────────────────────────────
const { determineWinner, sendEmailEnd, sendEmailStart } = await import(
    "../services/notifications.server.js"
);

// ─── Shared mock analysis data ────────────────────────────────────────────────

const ANALYSIS_VARIANT_A_WINS = [
    { variantName: "Control",   probabilityOfBeingBest: 0.05, conversionRate: 0.10 },
    { variantName: "Variant A", probabilityOfBeingBest: 0.92, conversionRate: 0.18 },
];

const ANALYSIS_INCONCLUSIVE = [
    { variantName: "Control",   probabilityOfBeingBest: 0.45, conversionRate: 0.10 },
    { variantName: "Variant A", probabilityOfBeingBest: 0.55, conversionRate: 0.11 },
];

const ANALYSIS_BASE_CASE_DOMINATES = [
    { variantName: "Control",   probabilityOfBeingBest: 0.95, conversionRate: 0.20 },
    { variantName: "Variant A", probabilityOfBeingBest: 0.05, conversionRate: 0.08 },
];

const ANALYSIS_MULTI_VARIANT = [
    { variantName: "Control",   probabilityOfBeingBest: 0.02, conversionRate: 0.08 },
    { variantName: "Variant A", probabilityOfBeingBest: 0.45, conversionRate: 0.15 },
    { variantName: "Variant B", probabilityOfBeingBest: 0.91, conversionRate: 0.22 },
    { variantName: "Variant C", probabilityOfBeingBest: 0.30, conversionRate: 0.13 },
];

// ─────────────────────────────────────────────────────────────────────────────

describe("notifications.server", () => {

    beforeEach(() => {
        vi.clearAllMocks();
        // restore default SNS send response after any test that overrides it
        mockSend.mockResolvedValue({ MessageId: "mock-message-id-123" });
    });

    // ── determineWinner ──────────────────────────────────────────────────────

    describe("determineWinner", () => {
        it("returns 'Variant A has won' when Variant A clears both thresholds", () => {
            expect(determineWinner(ANALYSIS_VARIANT_A_WINS)).toBe("Variant A has won");
        });

        it("returns 'Inconclusive' when no variant clears the probability threshold", () => {
            expect(determineWinner(ANALYSIS_INCONCLUSIVE)).toBe("Inconclusive");
        });

        it("returns 'Inconclusive' when base case dominates (no variant beats control)", () => {
            expect(determineWinner(ANALYSIS_BASE_CASE_DOMINATES)).toBe("Inconclusive");
        });

        it("returns the correct label for the winning variant in a multi-variant experiment", () => {
            // Variant B is index 1 among non-control variants → label "B"
            expect(determineWinner(ANALYSIS_MULTI_VARIANT)).toBe("Variant B has won");
        });

        it("returns 'Inconclusive' for empty analysis array", () => {
            expect(determineWinner([])).toBe("Inconclusive");
        });

        it("returns 'Inconclusive' when control row is missing", () => {
            const noControl = [
                { variantName: "Variant A", probabilityOfBeingBest: 0.95, conversionRate: 0.20 },
            ];
            expect(determineWinner(noControl)).toBe("Inconclusive");
        });

        it("returns 'Inconclusive' when variant beats threshold but delta is too small", () => {
            const tinyDelta = [
                { variantName: "Control",   probabilityOfBeingBest: 0.15, conversionRate: 0.10 },
                { variantName: "Variant A", probabilityOfBeingBest: 0.85, conversionRate: 0.105 }, // delta = 0.005, under 0.01
            ];
            expect(determineWinner(tinyDelta)).toBe("Inconclusive");
        });
    });

    // ── sendEmailEnd ─────────────────────────────────────────────────────────

    describe("sendEmailEnd", () => {
        beforeEach(() => {
            // Default: two variants, Variant A wins
            mockGetVariants.mockResolvedValue([
                { id: 1, name: "Control" },
                { id: 2, name: "Variant A" },
            ]);
            mockGetAnalysis.mockImplementation((_experimentId, variantId) => {
                if (variantId === 1) return { probabilityOfBeingBest: 0.05, conversionRate: 0.10 };
                if (variantId === 2) return { probabilityOfBeingBest: 0.92, conversionRate: 0.18 };
            });
        });

        it("throws if experimentId is missing", async () => {
            await expect(sendEmailEnd(null, "My Experiment", "test.myshopify.com"))
                .rejects.toThrow("experimentId is required");
        });

        it("throws if experimentName is missing", async () => {
            await expect(sendEmailEnd(1, null, "test.myshopify.com"))
                .rejects.toThrow("experimentName is required");
        });

        it("throws if shop is missing", async () => {
            await expect(sendEmailEnd(1, "My Experiment", null))
                .rejects.toThrow("shop is required");
        });

        it("calls SNS PublishCommand with correct subject and winner summary", async () => {
            await sendEmailEnd(1, "My Experiment", "test.myshopify.com");

            expect(mockSend).toHaveBeenCalledOnce();
            const sentCommand = mockSend.mock.calls[0][0];
            expect(sentCommand.input.Subject).toBe(`Experiment "My Experiment" has completed`);
            expect(sentCommand.input.Message).toContain("Variant A has won");
        });

        it("includes the correct shop URL in the email body", async () => {
            await sendEmailEnd(42, "My Experiment", "test-store.myshopify.com");

            const sentCommand = mockSend.mock.calls[0][0];
            expect(sentCommand.input.Message).toContain(
                "https://admin.shopify.com/store/test-store/apps/ab-insightful-1/app/reports/42"
            );
        });

        it("sends 'Inconclusive' in the email body when no variant wins", async () => {
            mockGetAnalysis.mockImplementation((_experimentId, variantId) => {
                if (variantId === 1) return { probabilityOfBeingBest: 0.45, conversionRate: 0.10 };
                if (variantId === 2) return { probabilityOfBeingBest: 0.55, conversionRate: 0.11 };
            });

            await sendEmailEnd(1, "My Experiment", "test.myshopify.com");

            const sentCommand = mockSend.mock.calls[0][0];
            expect(sentCommand.input.Message).toContain("Inconclusive");
        });

        it("returns the SNS response on success", async () => {
            const response = await sendEmailEnd(1, "My Experiment", "test.myshopify.com");
            expect(response).toEqual({ MessageId: "mock-message-id-123" });
        });
    });

    // ── sendEmailStart ───────────────────────────────────────────────────────

    describe("sendEmailStart", () => {
        it("throws if experimentId is missing", async () => {
            await expect(sendEmailStart(null, "My Experiment", "test.myshopify.com"))
                .rejects.toThrow("experimentId is required");
        });

        it("throws if experimentName is missing", async () => {
            await expect(sendEmailStart(1, null, "test.myshopify.com"))
                .rejects.toThrow("experimentName is required");
        });

        it("throws if shop is missing", async () => {
            await expect(sendEmailStart(1, "My Experiment", null))
                .rejects.toThrow("shop is required");
        });

        it("calls SNS PublishCommand with correct subject", async () => {
            await sendEmailStart(1, "My Experiment", "test.myshopify.com");

            expect(mockSend).toHaveBeenCalledOnce();
            const sentCommand = mockSend.mock.calls[0][0];
            expect(sentCommand.input.Subject).toBe(`Experiment "My Experiment" has started`);
            expect(sentCommand.input.Message).toContain("My Experiment");
        });

        it("returns the SNS response on success", async () => {
            const response = await sendEmailStart(1, "My Experiment", "test.myshopify.com");
            expect(response).toEqual({ MessageId: "mock-message-id-123" });
        });
    });

    // ── Cron job: project flag gating ────────────────────────────────────────

    describe("cron job flag gating", () => {
        // Uses top-level mocks directly rather than re-importing inside the
        // function body — dynamic imports inside functions are served from the
        // module cache and bypass vi.mock, so mockSend would never be called.

        async function simulateCronEnd(experiments) {
            const failures = [];
            const end_results = [];

            for (const experiment of experiments) {
                try {
                    end_results.push(await mockEndExperiment(experiment.id));
                    const project = await mockProjectFindUnique({
                        where: { id: experiment.projectId },
                        select: { enableExperimentEnd: true, shop: true },
                    });
                    if (project?.enableExperimentEnd) {
                        await sendEmailEnd(experiment.id, experiment.name, project.shop);
                    }
                } catch (e) {
                    failures.push(e.message);
                }
            }
            return { end_results, failures };
        }

        async function simulateCronStart(experiments) {
            const failures = [];
            const start_results = [];

            for (const experiment of experiments) {
                try {
                    start_results.push(await mockStartExperiment(experiment.id));
                    const project = await mockProjectFindUnique({
                        where: { id: experiment.projectId },
                        select: { enableExperimentStart: true, shop: true },
                    });
                    if (project?.enableExperimentStart) {
                        await sendEmailStart(experiment.id, experiment.name, project.shop);
                    }
                } catch (e) {
                    failures.push(e.message);
                }
            }
            return { start_results, failures };
        }

        const MOCK_EXPERIMENT = { id: 1, name: "Mock Experiment", projectId: 10 };

        beforeEach(() => {
            mockGetVariants.mockResolvedValue([
                { id: 1, name: "Control" },
                { id: 2, name: "Variant A" },
            ]);
            mockGetAnalysis.mockImplementation((_experimentId, variantId) => {
                if (variantId === 1) return { probabilityOfBeingBest: 0.05, conversionRate: 0.10 };
                if (variantId === 2) return { probabilityOfBeingBest: 0.92, conversionRate: 0.18 };
            });
        });

        it("does not send end email when enableExperimentEnd is false", async () => {
            mockProjectFindUnique.mockResolvedValue({
                enableExperimentEnd: false,
                shop: "test.myshopify.com",
            });

            await simulateCronEnd([MOCK_EXPERIMENT]);

            expect(mockEndExperiment).toHaveBeenCalledWith(MOCK_EXPERIMENT.id);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it("sends end email when enableExperimentEnd is true", async () => {
            mockProjectFindUnique.mockResolvedValue({
                enableExperimentEnd: true,
                shop: "test.myshopify.com",
            });

            await simulateCronEnd([MOCK_EXPERIMENT]);

            expect(mockEndExperiment).toHaveBeenCalledWith(MOCK_EXPERIMENT.id);
            expect(mockSend).toHaveBeenCalledOnce();
        });

        it("does not send start email when enableExperimentStart is false", async () => {
            mockProjectFindUnique.mockResolvedValue({
                enableExperimentStart: false,
                shop: "test.myshopify.com",
            });

            await simulateCronStart([MOCK_EXPERIMENT]);

            expect(mockStartExperiment).toHaveBeenCalledWith(MOCK_EXPERIMENT.id);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it("sends start email when enableExperimentStart is true", async () => {
            mockProjectFindUnique.mockResolvedValue({
                enableExperimentStart: true,
                shop: "test.myshopify.com",
            });

            await simulateCronStart([MOCK_EXPERIMENT]);

            expect(mockStartExperiment).toHaveBeenCalledWith(MOCK_EXPERIMENT.id);
            expect(mockSend).toHaveBeenCalledOnce();
        });

        it("does not send email when project is not found", async () => {
            mockProjectFindUnique.mockResolvedValue(null);

            await simulateCronEnd([MOCK_EXPERIMENT]);

            expect(mockEndExperiment).toHaveBeenCalledWith(MOCK_EXPERIMENT.id);
            expect(mockSend).not.toHaveBeenCalled();
        });

        it("logs failure and continues if endExperiment throws", async () => {
            mockEndExperiment.mockRejectedValueOnce(new Error("DB connection failed"));
            mockProjectFindUnique.mockResolvedValue({
                enableExperimentEnd: true,
                shop: "test.myshopify.com",
            });

            const { failures } = await simulateCronEnd([MOCK_EXPERIMENT]);

            expect(failures).toContain("DB connection failed");
            expect(mockSend).not.toHaveBeenCalled();
        });

        it("processes multiple experiments and only emails flagged ones", async () => {
            const experiments = [
                { id: 1, name: "Experiment One",   projectId: 10 },
                { id: 2, name: "Experiment Two",   projectId: 11 },
                { id: 3, name: "Experiment Three", projectId: 12 },
            ];

            mockProjectFindUnique
                .mockResolvedValueOnce({ enableExperimentEnd: true,  shop: "shop-a.myshopify.com" })
                .mockResolvedValueOnce({ enableExperimentEnd: false, shop: "shop-b.myshopify.com" })
                .mockResolvedValueOnce({ enableExperimentEnd: true,  shop: "shop-c.myshopify.com" });

            await simulateCronEnd(experiments);

            expect(mockEndExperiment).toHaveBeenCalledTimes(3);
            expect(mockSend).toHaveBeenCalledTimes(2);
        });
    });
});