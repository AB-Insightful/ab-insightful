import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";

const sendMock = vi.fn();

//built mock for aws sns 
vi.mock("@aws-sdk/client-sns", () => {
  class SNSClient {
    constructor(config) {
      this.config = config;   
    }
    send = sendMock;
  }

  class PublishCommand {
    constructor(input) {
      this.input = input;
      this.__type = "PublishCommand";
    }
  }

  class SubscribeCommand {
    constructor(input) {
      this.input = input;
      this.__type = "SubscribeCommand";
    }
  }

  return { SNSClient, PublishCommand, SubscribeCommand };
});

let sendEmailTopic;
let subscribeEmail;

//needs these imports regularly
beforeAll(async () => {
  const mod = await import("../services/notifications.server.js");
  sendEmailTopic = mod.sendEmailTopic;
  subscribeEmail = mod.subscribeEmail;
});

//arbitrary secrets, used later for the tests
describe("SNS functions", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.AWS_REGION = "us-west-2";
    process.env.AWS_TOPIC = "arn:aws:sns:us-west-2:123456789012:my-topic";
  });

  afterEach(() => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_TOPIC;
  });

  //tests for static message. Will need to change later once this is more dynamic
  it("sendEmailTopic sends PublishCommand with expected payload", async () => {
    const fakeResponse = { MessageId: "abc-123" };
    sendMock.mockResolvedValue(fakeResponse);

    const result = await sendEmailTopic();
    expect(result).toEqual(fakeResponse);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sentCommand = sendMock.mock.calls[0][0];

    expect(sentCommand.__type).toBe("PublishCommand");
    expect(sentCommand.input).toEqual({
      TopicArn: process.env.AWS_TOPIC,
      Message: "Hello from my Shopify app!",
      Subject: "test-1-notification",
    });
  });

  //simple test for subscribing. Will be utilized more for future sprints. 
  it("subscribeEmail sends SubscribeCommand with expected email", async () => {
    const fakeResponse = { SubscriptionArn: "pending confirmation" };
    sendMock.mockResolvedValue(fakeResponse);

    const result = await subscribeEmail("test@example.com");
    expect(result).toEqual(fakeResponse);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sentCommand = sendMock.mock.calls[0][0];

    expect(sentCommand.__type).toBe("SubscribeCommand");
    expect(sentCommand.input).toEqual({
      TopicArn: process.env.AWS_TOPIC,
      Protocol: "email",
      Endpoint: "test@example.com",
    });
  });

  it("propagates errors from AWS send()", async () => {
    sendMock.mockRejectedValue(new Error("AWS is down"));
    await expect(sendEmailTopic()).rejects.toThrow("AWS is down");
  });
});