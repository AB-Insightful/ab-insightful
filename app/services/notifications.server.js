// This file focuses on functions tied to the Amazon SNS
import { SNSClient, PublishCommand, SubscribeCommand } from "@aws-sdk/client-sns";

//will initiate a static message to the topic
export async function sendEmailTopic()
{
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
export async function subscribeEmail(email)
{
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
