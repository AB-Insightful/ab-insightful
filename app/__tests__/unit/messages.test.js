import { describe, it, expect } from "vitest";
import { formatExperimentStarted } from "../../routes/messages/experimentStarted";
import { formatExperimentCompleted } from "../../routes/messages/experimentCompleted";
import { formatVerificationMessage } from "../../routes/messages/verificationMessage";

//shared mock data
const SHOP = "test-store-for-ben.myshopify.com";
const EXPERIMENT_NAME = "Red Button Test";
const EXPERIMENT_ID = 9001;
const APP_URL_BASE =
  "https://admin.shopify.com/store/test-store-for-ben/apps/ab-insightful-1/app";

//experimentStarted
describe("formatExperimentStarted", () => {
  const result = formatExperimentStarted({
    experimentName: EXPERIMENT_NAME,
    experimentId: EXPERIMENT_ID,
    shop: SHOP,
  });

  it("returns a subject containing the experiment name", () => {
    expect(result.subject).toContain(EXPERIMENT_NAME);
  });

  it("email body contains the experiment name", () => {
    expect(result.emailBody).toContain(EXPERIMENT_NAME);
  });

  it("email body contains the correct experiment URL", () => {
    expect(result.emailBody).toContain(
      `${APP_URL_BASE}/reports/${EXPERIMENT_ID}`,
    );
  });

  it("SMS body contains the experiment name", () => {
    expect(result.smsBody).toContain(EXPERIMENT_NAME);
  });

  it("SMS body contains the correct experiment URL", () => {
    expect(result.smsBody).toContain(
      `${APP_URL_BASE}/reports/${EXPERIMENT_ID}`,
    );
  });

  it("strips .myshopify.com from the shop in the URL", () => {
    expect(result.emailBody).not.toContain(".myshopify.com");
    expect(result.smsBody).not.toContain(".myshopify.com");
  });
});

//experimentCompleted
describe("formatExperimentCompleted", () => {
  const winnerSummary = "Variant A won with 90.0% probability of being best";

  const result = formatExperimentCompleted({
    experimentName: EXPERIMENT_NAME,
    experimentId: EXPERIMENT_ID,
    shop: SHOP,
    winnerSummary,
  });

  it("returns a subject containing the experiment name", () => {
    expect(result.subject).toContain(EXPERIMENT_NAME);
  });

  it("email body contains the experiment name", () => {
    expect(result.emailBody).toContain(EXPERIMENT_NAME);
  });

  it("email body contains the winner summary", () => {
    expect(result.emailBody).toContain(winnerSummary);
  });

  it("email body contains the correct experiment URL", () => {
    expect(result.emailBody).toContain(
      `${APP_URL_BASE}/reports/${EXPERIMENT_ID}`,
    );
  });

  it("SMS body contains the winner summary", () => {
    expect(result.smsBody).toContain(winnerSummary);
  });

  it("SMS body contains the correct experiment URL", () => {
    expect(result.smsBody).toContain(
      `${APP_URL_BASE}/reports/${EXPERIMENT_ID}`,
    );
  });

  it("also works with an inconclusive winner summary", () => {
    const inconclusiveResult = formatExperimentCompleted({
      experimentName: EXPERIMENT_NAME,
      experimentId: EXPERIMENT_ID,
      shop: SHOP,
      winnerSummary: "Inconclusive",
    });
    expect(inconclusiveResult.emailBody).toContain("Inconclusive");
    expect(inconclusiveResult.smsBody).toContain("Inconclusive");
  });
});

//verificationMessage
describe("formatVerificationMessage", () => {
  const TOKEN = "abc-123-def-456";

  describe("email type", () => {
    const result = formatVerificationMessage({
      contactType: "email",
      contactValue: "user@example.com",
      token: TOKEN,
      shop: SHOP,
    });

    it("returns a verification subject", () => {
      expect(result.subject).toBeTruthy();
      expect(result.subject.toLowerCase()).toContain("verify");
    });

    it("email body contains the contact value", () => {
      expect(result.emailBody).toContain("user@example.com");
    });

    it("email body contains the verification URL with correct token", () => {
      expect(result.emailBody).toContain(`token=${TOKEN}`);
      expect(result.emailBody).toContain("type=email");
    });

    it("verification URL points to the verify route", () => {
      expect(result.emailBody).toContain(`${APP_URL_BASE}/verify`);
    });

    it("strips .myshopify.com from the shop in the URL", () => {
      expect(result.emailBody).not.toContain(".myshopify.com");
    });
  });

  describe("phone type", () => {
    const result = formatVerificationMessage({
      contactType: "phone",
      contactValue: "555-555-5555",
      token: TOKEN,
      shop: SHOP,
    });

    it("SMS body contains the verification URL with correct token", () => {
      expect(result.smsBody).toContain(`token=${TOKEN}`);
      expect(result.smsBody).toContain("type=phone");
    });

    it("SMS body contains the verify route URL", () => {
      expect(result.smsBody).toContain(`${APP_URL_BASE}/verify`);
    });
  });
});
