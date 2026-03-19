// This file focuses on functions tied to the Amazon SNS
import { SNSClient, PublishCommand, SubscribeCommand, ListSubscriptionsByTopicCommand, UnsubscribeCommand } from "@aws-sdk/client-sns";

//will initiate a static message to the topic
export async function sendEmailTopic() {
    console.log("inside sendEmailTopic()")
    const sns = new SNSClient({
        region: process.env.AWS_REGION,
    });

    //contains message sent, subject line and ARN
    //ARN is the unique identifier for the designated 'topic' that will contain everyone receiving the message
    const command = new PublishCommand({
        TopicArn: process.env.AWS_TOPIC,
        Message: "Hello from my Shopify app!",
        Subject: "test-1-notification",
    });

    const response = await sns.send(command);
    console.log(response.Message);

    return response

}

//subscribe function to send request for new subscribers. 
//functions based off of limited testing with a secondary email. 
export async function subscribeEmail(email) {
  const sns = new SNSClient({
    region: process.env.AWS_REGION,
  });

  const command = new SubscribeCommand({
    TopicArn: process.env.AWS_TOPIC,
    Protocol: "email",                 
    Endpoint: email, 
  });

  const response = await sns.send(command);

  console.log("Subscription response: ", response.SubscriptionArn);
  return response;
}

//subscribes phone number input param must follow e.164 format (ex. +19166666666)
export async function subscribePhone(phoneNumber) {
  const sns = new SNSClient({
    region: process.env.AWS_REGION,
  });

  const command = new SubscribeCommand({
    TopicArn: process.env.AWS_TOPIC,
    Protocol: "sms",
    Endpoint: phoneNumber,
  });

  const response = await sns.send(command);

  console.log("Subscription response:", response.SubscriptionArn);
  return response;
}

//unsubscirbe function to remove emails from our specified topic. 
export async function unsubscribeEmail(email) {
  const sns = new SNSClient({
    region: process.env.AWS_REGION,
  });

  //queries particular AWS topic for list of emails 


  //searching through list of emails for input email. 
  let nextToken = undefined;
  let subscriptionArn = null;

  //performs loop to search for email since aws only returns first 100 queries, have to loop it if you have more emails than that.
  do {
    const response = await sns.send(
      new ListSubscriptionsByTopicCommand({
        TopicArn: process.env.AWS_TOPIC,
        NextToken: nextToken //loads 
      })
    );

    const sub = response.Subscriptions?.find(
      s => s.Endpoint === email
    );

    if (sub) {
      subscriptionArn = sub.SubscriptionArn;
      break;
    }

    nextToken = response.NextToken; //gives nextToken relevant value (is null when there are no more emails to return)

  } while (nextToken); //runs until nextToken is not null

  //fail case for finding no matching email or finding email that has not clicked 'subscribe' email
  if(subscriptionArn === "PendingConfirmation")
  {
    console.log("unsubscribe email is pending.");
    return;
  }
  if (!subscriptionArn)
  {
    console.log("unsubscribe email was invalid");
    return;
  }

  await sns.send(
    new UnsubscribeCommand({ SubscriptionArn: subscriptionArn})
  );
  console.log("unsubscribe of " + email + " successful")
}// end unsubscribeEmail


export async function unsubscribeAll() {
  const sns = new SNSClient({ region: process.env.AWS_REGION });
  const topicArn = process.env.AWS_TOPIC;
  
  let nextToken = undefined;
  const arnsToRemove = [];

  do {
    const response = await sns.send(
      new ListSubscriptionsByTopicCommand({
        TopicArn: topicArn,
        NextToken: nextToken,
      })
    );

    for (const sub of response.Subscriptions || []) {
      if (
        sub.SubscriptionArn &&
        sub.SubscriptionArn !== "PendingConfirmation" //avoids aws throwing an error, means the email has not accepted subscription
      ) {
        arnsToRemove.push(sub.SubscriptionArn);
      }
    }
    nextToken = response.NextToken;
  } while (nextToken);

  for (const subscriptionArn of arnsToRemove) {
    await sns.send(
      new UnsubscribeCommand({ SubscriptionArn: subscriptionArn })
    );
  }

  return { ok: true, removed: arnsToRemove.length };
}