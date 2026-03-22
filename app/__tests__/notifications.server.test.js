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

  //necessary mock functions for unsubscribing
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

  return { SNSClient, PublishCommand, SubscribeCommand, UnsubscribeCommand, ListSubscriptionsByTopicCommand };
});

let sendEmailStart;
let subscribeEmail;
let unsubscribeEmail;
let unsubscribeAll

//needs these imports regularly
beforeAll(async () => {
  const mod = await import("../services/notifications.server.js");
  sendEmailStart = mod.sendEmailStart;
  subscribeEmail = mod.subscribeEmail;
  unsubscribeEmail = mod.unsubscribeEmail;
  unsubscribeAll = mod.unsubscribeAll;
});

//arbitrary faux secrets, used later for the tests
describe("SNS functions", () => {
  beforeEach(() => {
    sendMock.mockReset(); //resets any previous mock behavior for fresh test
    process.env.AWS_REGION = "us-west-2";
    process.env.AWS_TOPIC = "arn:aws:sns:us-west-2:123456789012:my-topic";
  });

  afterEach(() => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_TOPIC;
  });

  //tests for static message. Will need to change later once this is more dynamic
it("sendEmailStart sends PublishCommand with expected payload", async () => {
    const fakeResponse = { MessageId: "abc-123" };
    sendMock.mockResolvedValue(fakeResponse);

    const result = await sendEmailStart(1, "My Experiment", "test.myshopify.com");
    expect(result).toEqual(fakeResponse);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sentCommand = sendMock.mock.calls[0][0];

    expect(sentCommand.__type).toBe("PublishCommand");
    expect(sentCommand.input).toEqual({
        TopicArn: process.env.AWS_TOPIC,
        Subject: `Experiment "My Experiment" has started`,
        Message: expect.stringContaining("My Experiment"),
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
    await expect(sendEmailStart(1, "My Experiment", "test.myshopify.com")).rejects.toThrow("AWS is down");
  });

  //unsubscribe test
  it("unsubscribe command success", async () => {

    const email = "test@exmaple.com";
    //build mocking for unsubscribe functionality
     sendMock.mockResolvedValueOnce({
    Subscriptions: [
      {
        Endpoint: email,
        SubscriptionArn: "arn:123",
      },
    ],
    NextToken: undefined,
    });

    // unsubscribe
    sendMock.mockResolvedValueOnce({});

    await unsubscribeEmail(email);

    //evaluates first and second call

    //check to make sure first call command happened as expected
    const firstCall = sendMock.mock.calls[0][0];
    expect(firstCall.__type).toBe("ListSubscriptionsByTopicCommand");

    // Check second call
    const secondCall = sendMock.mock.calls[1][0];
    expect(secondCall.__type).toBe("UnsubscribeCommand");
    expect(secondCall.input).toEqual({
      SubscriptionArn: "arn:123",
    });

    expect(sendMock).toHaveBeenCalledTimes(2);

  }); //end unsubscribe success

  it("unsubscribe command pending", async () => {

    const email = "test@exmaple.com";
    //build mocking for unsubscribe functionality
     sendMock.mockResolvedValueOnce({
    Subscriptions: [
      {
        Endpoint: email,
        SubscriptionArn: "PendingConfirmation",
      },
    ],
    NextToken: undefined,
    });

    // unsubscribe
    sendMock.mockResolvedValueOnce({});

    await unsubscribeEmail(email);

    //evaluates first and second call

    //check to make sure first call command happened as expected
    const firstCall = sendMock.mock.calls[0][0];
    expect(firstCall.__type).toBe("ListSubscriptionsByTopicCommand");

    // Check second call
    const calls = sendMock.mock.calls.map(([cmd]) => cmd.__type);
      expect(calls).toContain("ListSubscriptionsByTopicCommand");
      expect(calls).not.toContain("UnsubscribeCommand");

  }); //end unsubscribe failure due to pending

    it("invalid email unsubscribe", async () => {

      const email = "bogus@exmaple.com";
      const correctEmail = "correct@example.com"
    //build mocking for unsubscribe functionality
     sendMock.mockResolvedValueOnce({
      Subscriptions: [
        {
          Endpoint: correctEmail,
          SubscriptionArn: "arn:123",
        },
      ],
      NextToken: undefined,
      });

      // unsubscribe
      sendMock.mockResolvedValueOnce({});

      await unsubscribeEmail(email);

      //check to make sure first call command happened as expected
      const firstCall = sendMock.mock.calls[0][0];
      expect(firstCall.__type).toBe("ListSubscriptionsByTopicCommand");

      //gets all of the command type of calls
      //should not contain UnsubscribeCommand
      const calls = sendMock.mock.calls.map(([cmd]) => cmd.__type);
      expect(calls).toContain("ListSubscriptionsByTopicCommand");
      expect(calls).not.toContain("UnsubscribeCommand");
      
    }); //end unsubscribe failure

    it("finds subscriber on the second page and unsubscribes", async () => {
    const email = "target@example.com";

    // first page: no match, but has another page
    sendMock.mockResolvedValueOnce({
      Subscriptions: [
        {
          Endpoint: "other@example.com",
          SubscriptionArn: "arn:first-page"
        }
      ],
      NextToken: "page-2-token",
    });

    // second page: match found
    sendMock.mockResolvedValueOnce({
      Subscriptions: [
        {
          Endpoint: email,
          SubscriptionArn: "arn:found-on-page-2"
        }
      ],
      NextToken: undefined,
    });

    // third call: unsubscribe succeeds
    sendMock.mockResolvedValueOnce({});

    await unsubscribeEmail(email);

    expect(sendMock).toHaveBeenCalledTimes(3);

    // first AWS call should list page 1
    const firstCall = sendMock.mock.calls[0][0];
    expect(firstCall.__type).toBe("ListSubscriptionsByTopicCommand");
    expect(firstCall.input).toEqual({
      TopicArn: process.env.AWS_TOPIC,
      NextToken: undefined,
    });

    // second AWS call should list page 2 using the token
    const secondCall = sendMock.mock.calls[1][0];
    expect(secondCall.__type).toBe("ListSubscriptionsByTopicCommand");
    expect(secondCall.input).toEqual({
      TopicArn: process.env.AWS_TOPIC,
      NextToken: "page-2-token",
    });

    // third AWS call should unsubscribe the found ARN
    const thirdCall = sendMock.mock.calls[2][0];
    expect(thirdCall.__type).toBe("UnsubscribeCommand");
    expect(thirdCall.input).toEqual({
      SubscriptionArn: "arn:found-on-page-2",
    });
  });

  it("unsubscribeAll unsubscribes one valid email subscription", async () => {
    // first AWS call,  list subscriptions
    sendMock.mockResolvedValueOnce({
      Subscriptions: [
        {
          Protocol: "email",
          Endpoint: "test@example.com",
          SubscriptionArn: "arn:email-1",
        },
      ],
      NextToken: undefined,
    });

    // Second AWS call: unsubscribe that ARN
    sendMock.mockResolvedValueOnce({});

    const result = await unsubscribeAll();

    expect(result).toEqual({ ok: true, removed: 1 });
    expect(sendMock).toHaveBeenCalledTimes(2);

    // First call should list subscriptions
    const firstCall = sendMock.mock.calls[0][0];
    expect(firstCall.__type).toBe("ListSubscriptionsByTopicCommand");
    expect(firstCall.input).toEqual({
      TopicArn: process.env.AWS_TOPIC,
      NextToken: undefined,
    });

    // Second call should unsubscribe the matching ARN
    const secondCall = sendMock.mock.calls[1][0];
    expect(secondCall.__type).toBe("UnsubscribeCommand");
    expect(secondCall.input).toEqual({
      SubscriptionArn: "arn:email-1",
    });
  }); // end unsubscribe all success test

  it("unsubscribeAll unsubscribes both email and sms subscriptions", async () => {
    // First AWS call: mixed subscriptions
    sendMock.mockResolvedValueOnce({
      Subscriptions: [
        {
          Protocol: "email",
          Endpoint: "user1@example.com",
          SubscriptionArn: "arn:email-1",
        },
        {
          Protocol: "sms",
          Endpoint: "+19165551234",
          SubscriptionArn: "arn:sms-1",
        },
        {
          Protocol: "email",
          Endpoint: "pending@example.com",
          SubscriptionArn: "PendingConfirmation",
        },
      ],
      NextToken: undefined,
    });

    // Two unsubscribe calls (email and sms)
    sendMock.mockResolvedValueOnce({});
    sendMock.mockResolvedValueOnce({});

    const result = await unsubscribeAll();

    // Should remove 2 (email, sms, skip pending)
    expect(result).toEqual({ ok: true, removed: 2 });

    // 1 list call 2 unsubscribe calls
    expect(sendMock).toHaveBeenCalledTimes(3);

    const calls = sendMock.mock.calls.map(([cmd]) => cmd.__type);

    expect(calls).toEqual([
      "ListSubscriptionsByTopicCommand",
      "UnsubscribeCommand",
      "UnsubscribeCommand",
    ]);

    // Verify correct ARNs were unsubscribed
    const secondCall = sendMock.mock.calls[1][0];
    const thirdCall = sendMock.mock.calls[2][0];

    expect(secondCall.input).toEqual({
      SubscriptionArn: "arn:email-1",
    });

    expect(thirdCall.input).toEqual({
      SubscriptionArn: "arn:sms-1",
    });
  }); //end unsubscribe all for sms lambda and email protocol

  

}); //end SNS functions