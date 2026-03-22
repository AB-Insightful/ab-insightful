// notifications.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  determineWinner,
  sendEmailEnd,
  sendEmailStart,
  subscribeEmail,
  unsubscribeEmail,
  unsubscribeAll,
  subscribePhoneNum,
  unsubscribePhoneNum,
  sendSMSEnd,
  sendSMSStart,
  unsubscribeAllPhoneNums,
} from "../services/notifications.server.js";

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
    constructor(input) {
        this.input = input;
        this.__type = "SubscribeCommand";
        }
    }

    class ListSubscriptionsByTopicCommand {
        constructor(input) {
        this.input = input;
        this.__type = "ListSubscriptionsByTopicCommand";
        }
    }

    class UnsubscribeCommand {
        constructor(input) {
        this.input = input;
        this.__type = "UnsubscribeCommand";
        }
    }
    return {
        SNSClient,
        PublishCommand,
        SubscribeCommand,
        ListSubscriptionsByTopicCommand,
        UnsubscribeCommand,
    };
    
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockReset();
  mockSend.mockResolvedValue({ MessageId: "mock-message-id-123" });
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
    
    describe("subscribeEmail", () => {
        it("calls SNS SubscribeCommand with email topic and email protocol", async () => {
            mockSend.mockResolvedValueOnce({ SubscriptionArn: "arn:email-sub" });

            const response = await subscribeEmail("user@example.com");
            
            expect(mockSend).toHaveBeenCalledOnce();
            const sentCommand = mockSend.mock.calls[0][0];
            
            expect(sentCommand.__type).toBe("SubscribeCommand");
            expect(sentCommand.input).toEqual({
            TopicArn: process.env.AWS_TOPIC,
            Protocol: "email",
            Endpoint: "user@example.com",
            });
            expect(response).toEqual({ SubscriptionArn: "arn:email-sub" });
        });
    });

    //testing for unsubscribeEmail
    describe("unsubscribeEmail", () => {
        it("unsubscribes matching email when found", async () => {
            mockSend
            .mockResolvedValueOnce({
                Subscriptions: [
                { Endpoint: "other@example.com", SubscriptionArn: "arn:other" },
                { Endpoint: "user@example.com", SubscriptionArn: "arn:target" },
                ],
                NextToken: undefined,
            })
            .mockResolvedValueOnce({
                $metadata: { httpStatusCode: 200 },
            });

            await unsubscribeEmail("user@example.com");

            expect(mockSend).toHaveBeenCalledTimes(2);

            expect(mockSend.mock.calls[0][0].__type).toBe("ListSubscriptionsByTopicCommand");
            expect(mockSend.mock.calls[1][0].__type).toBe("UnsubscribeCommand");
            expect(mockSend.mock.calls[1][0].input).toEqual({
            SubscriptionArn: "arn:target",
            });
        });

        it("returns early when matching email is PendingConfirmation", async () => {
            mockSend.mockResolvedValueOnce({
            Subscriptions: [
                { Endpoint: "user@example.com", SubscriptionArn: "PendingConfirmation" },
            ],
            NextToken: undefined,
            });

            await unsubscribeEmail("user@example.com");

            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(mockSend.mock.calls[0][0].__type).toBe("ListSubscriptionsByTopicCommand");
        });

        it("returns early when email is not found", async () => {
            mockSend.mockResolvedValueOnce({
            Subscriptions: [
                { Endpoint: "other@example.com", SubscriptionArn: "arn:other" },
            ],
            NextToken: undefined,
            });

            await unsubscribeEmail("user@example.com");

            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(mockSend.mock.calls[0][0].__type).toBe("ListSubscriptionsByTopicCommand");
        });

        it("searches multiple pages until it finds the email", async () => {
            mockSend
            .mockResolvedValueOnce({
                Subscriptions: [{ Endpoint: "other@example.com", SubscriptionArn: "arn:other" }],
                NextToken: "page-2",
            })
            .mockResolvedValueOnce({
                Subscriptions: [{ Endpoint: "user@example.com", SubscriptionArn: "arn:target" }],
                NextToken: undefined,
            })
            .mockResolvedValueOnce({
                $metadata: { httpStatusCode: 200 },
            });

            await unsubscribeEmail("user@example.com");

            expect(mockSend).toHaveBeenCalledTimes(3);
            expect(mockSend.mock.calls[1][0].__type).toBe("ListSubscriptionsByTopicCommand");
            expect(mockSend.mock.calls[1][0].input.NextToken).toBe("page-2");
            expect(mockSend.mock.calls[2][0].__type).toBe("UnsubscribeCommand");
        });
    });

    //unsubscribe all tests
    describe("unsubscribeAll", () => {
        it("removes all confirmed email subscriptions across pages", async () => {
            mockSend
            .mockResolvedValueOnce({
                Subscriptions: [
                { Endpoint: "a@example.com", SubscriptionArn: "arn:a" },
                { Endpoint: "b@example.com", SubscriptionArn: "PendingConfirmation" },
                ],
                NextToken: "page-2",
            })
            .mockResolvedValueOnce({
                Subscriptions: [
                { Endpoint: "c@example.com", SubscriptionArn: "arn:c" },
                ],
                NextToken: undefined,
            })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});

            const result = await unsubscribeAll();

            expect(result).toEqual({ ok: true, removed: 2 });
            expect(mockSend).toHaveBeenCalledTimes(4);
            expect(mockSend.mock.calls[2][0].__type).toBe("UnsubscribeCommand");
            expect(mockSend.mock.calls[2][0].input.SubscriptionArn).toBe("arn:a");
            expect(mockSend.mock.calls[3][0].input.SubscriptionArn).toBe("arn:c");
        });

        it("returns zero removed when there are no subscriptions", async () => {
            mockSend.mockResolvedValueOnce({
            Subscriptions: [],
            NextToken: undefined,
            });

            const result = await unsubscribeAll();

            expect(result).toEqual({ ok: true, removed: 0 });
            expect(mockSend).toHaveBeenCalledTimes(1);
        });
    });

    //subscribe phone number testing
    describe("subscribePhoneNum", () => {
        it("throws for invalid phone number length", async () => {
            await expect(subscribePhoneNum("12345")).rejects.toThrow("invalid phone number format");
        });

        it("formats 10-digit phone number to E.164 and subscribes with sms protocol", async () => {
            mockSend.mockResolvedValueOnce({ SubscriptionArn: "arn:sms-sub" });

            const response = await subscribePhoneNum("9165551234");

            expect(mockSend).toHaveBeenCalledOnce();
            const sentCommand = mockSend.mock.calls[0][0];

            expect(sentCommand.__type).toBe("SubscribeCommand");
            expect(sentCommand.input).toEqual({
            TopicArn: process.env.AWS_TOPIC_SMS,
            Protocol: "sms",
            Endpoint: "+19165551234",
            });
            expect(response).toEqual({ SubscriptionArn: "arn:sms-sub" });
        });
    });

    describe("subscribePhoneNum", () => {
        it("throws for invalid phone number length", async () => {
            await expect(subscribePhoneNum("12345")).rejects.toThrow("invalid phone number format");
        });

        it("formats 10-digit phone number to E.164 and subscribes with sms protocol", async () => {
            mockSend.mockResolvedValueOnce({ SubscriptionArn: "arn:sms-sub" });

            const response = await subscribePhoneNum("9165551234");

            expect(mockSend).toHaveBeenCalledOnce();
            const sentCommand = mockSend.mock.calls[0][0];

            expect(sentCommand.__type).toBe("SubscribeCommand");
            expect(sentCommand.input).toEqual({
            TopicArn: process.env.AWS_TOPIC_SMS,
            Protocol: "sms",
            Endpoint: "+19165551234",
            });
            expect(response).toEqual({ SubscriptionArn: "arn:sms-sub" });
        });
    });

    describe("unsubscribePhoneNum", () => {
        it("throws for invalid phone number length", async () => {
            await expect(unsubscribePhoneNum("12345")).rejects.toThrow("invalid phone number format");
        });

        it("unsubscribes matching phone number when found", async () => {
            mockSend
            .mockResolvedValueOnce({
                Subscriptions: [
                { Endpoint: "+15551234567", SubscriptionArn: "arn:other" },
                { Endpoint: "+19165551234", SubscriptionArn: "arn:target" },
                ],
                NextToken: undefined,
            })
            .mockResolvedValueOnce({
                $metadata: { requestId: "req-1", httpStatusCode: 200 },
            });

            await unsubscribePhoneNum("9165551234");

            expect(mockSend).toHaveBeenCalledTimes(2);
            expect(mockSend.mock.calls[0][0].__type).toBe("ListSubscriptionsByTopicCommand");
            expect(mockSend.mock.calls[1][0].__type).toBe("UnsubscribeCommand");
            expect(mockSend.mock.calls[1][0].input).toEqual({
            SubscriptionArn: "arn:target",
            });
        });

        it("returns early when matching phone number is PendingConfirmation", async () => {
            mockSend.mockResolvedValueOnce({
            Subscriptions: [
                { Endpoint: "+19165551234", SubscriptionArn: "PendingConfirmation" },
            ],
            NextToken: undefined,
            });

            await unsubscribePhoneNum("9165551234");

            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        it("returns early when phone number is not found", async () => {
            mockSend.mockResolvedValueOnce({
            Subscriptions: [
                { Endpoint: "+15551234567", SubscriptionArn: "arn:other" },
            ],
            NextToken: undefined,
            });

            await unsubscribePhoneNum("9165551234");

            expect(mockSend).toHaveBeenCalledTimes(1);
        });
    });

    describe("sendSMSStart", () => {
        it("throws if experimentId is missing", async () => {
            await expect(sendSMSStart(null, "My Experiment", "test.myshopify.com"))
            .rejects.toThrow("experimentId is required");
        });

        it("throws if experimentName is missing", async () => {
            await expect(sendSMSStart(1, null, "test.myshopify.com"))
            .rejects.toThrow("experimentName is required");
        });

        it("throws if shop is missing", async () => {
            await expect(sendSMSStart(1, "My Experiment", null))
            .rejects.toThrow("shop is required");
        });

        it("publishes SMS start message to AWS_TOPIC_SMS without Subject", async () => {
            const response = await sendSMSStart(1, "My Experiment", "test.myshopify.com");

            expect(mockSend).toHaveBeenCalledOnce();
            const sentCommand = mockSend.mock.calls[0][0];

            expect(sentCommand.__type).toBe("PublishCommand");
            expect(sentCommand.input.TopicArn).toBe(process.env.AWS_TOPIC_SMS);
            expect(sentCommand.input.Message).toContain("My Experiment");
            expect(sentCommand.input.Subject).toBeUndefined();
            expect(response).toEqual({ MessageId: "mock-message-id-123" });
        });
    });

    //sendSMSEnd function tests
    describe("sendSMSEnd", () => {
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

        it("throws if experimentId is missing", async () => {
            await expect(sendSMSEnd(null, "My Experiment", "test.myshopify.com"))
            .rejects.toThrow("experimentId is required");
        });

        it("throws if experimentName is missing", async () => {
            await expect(sendSMSEnd(1, null, "test.myshopify.com"))
            .rejects.toThrow("experimentName is required");
        });

        it("throws if shop is missing", async () => {
            await expect(sendSMSEnd(1, "My Experiment", null))
            .rejects.toThrow("shop is required");
        });

        it("publishes SMS end message to AWS_TOPIC_SMS without Subject and includes winner summary", async () => {
            const response = await sendSMSEnd(1, "My Experiment", "test.myshopify.com");

            expect(mockSend).toHaveBeenCalledOnce();
            const sentCommand = mockSend.mock.calls[0][0];

            expect(sentCommand.__type).toBe("PublishCommand");
            expect(sentCommand.input.TopicArn).toBe(process.env.AWS_TOPIC_SMS);
            expect(sentCommand.input.Message).toContain("Variant A has won");
            expect(sentCommand.input.Subject).toBeUndefined();
            expect(response).toEqual({ MessageId: "mock-message-id-123" });
        });

        it("uses Inconclusive when no winner exists", async () => {
            mockGetAnalysis.mockImplementation((_experimentId, variantId) => {
            if (variantId === 1) return { probabilityOfBeingBest: 0.45, conversionRate: 0.10 };
            if (variantId === 2) return { probabilityOfBeingBest: 0.55, conversionRate: 0.11 };
            });

            await sendSMSEnd(1, "My Experiment", "test.myshopify.com");

            const sentCommand = mockSend.mock.calls[0][0];
            expect(sentCommand.input.Message).toContain("Inconclusive");
        });
    });

    //unsubscribeAllPhoneNums feature
    describe("unsubscribeAllPhoneNums", () => {
        it("removes all confirmed phone subscriptions across pages", async () => {
            mockSend
            .mockResolvedValueOnce({
                Subscriptions: [
                { Endpoint: "+19165550001", SubscriptionArn: "arn:p1" },
                { Endpoint: "+19165550002", SubscriptionArn: "PendingConfirmation" },
                ],
                NextToken: "page-2",
            })
            .mockResolvedValueOnce({
                Subscriptions: [
                { Endpoint: "+19165550003", SubscriptionArn: "arn:p3" },
                ],
                NextToken: undefined,
            })
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({});

            const result = await unsubscribeAllPhoneNums();

            expect(result).toEqual({ ok: true, removed: 2 });
            expect(mockSend).toHaveBeenCalledTimes(4);
            expect(mockSend.mock.calls[2][0].__type).toBe("UnsubscribeCommand");
            expect(mockSend.mock.calls[2][0].input.SubscriptionArn).toBe("arn:p1");
            expect(mockSend.mock.calls[3][0].input.SubscriptionArn).toBe("arn:p3");
        });

        it("returns zero removed when there are no phone subscriptions", async () => {
            mockSend.mockResolvedValueOnce({
            Subscriptions: [],
            NextToken: undefined,
            });

            const result = await unsubscribeAllPhoneNums();

            expect(result).toEqual({ ok: true, removed: 0 });
            expect(mockSend).toHaveBeenCalledTimes(1);
        });
    });


});