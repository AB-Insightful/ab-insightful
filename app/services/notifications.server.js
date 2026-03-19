//import two message cases
import { formatExperimentCompleted } from '../routes/messages/experimentCompleted';
import { formatExperimentStarted } from '../routes/messages/experimentStarted';

// This file focuses on functions tied to the Amazon SNS
import { SNSClient, PublishCommand, SubscribeCommand, ListSubscriptionsByTopicCommand, UnsubscribeCommand } from "@aws-sdk/client-sns";

//sends an email on experiment start
export async function sendEmailStart(experimentId, experimentName, shop)
{
    //error handling
    if (!experimentId) {
        throw new Error("sendEmailStart: experimentId is required");
    }
    if (!experimentName) {
        throw new Error("sendEmailStart: experimentName is required");
    }
    if (!shop) {
        throw new Error("sendEmailStart: shop is required");
    }

    console.log(`inside sendEmailStart()`);
    const sns = new SNSClient({
        region: process.env.AWS_REGION,
    });

    const message = formatExperimentStarted({
        experimentName,
        experimentId,
        shop,
    });

    if (!message?.emailBody || !message?.subject) {
        throw new Error("sendEmailStart: message formatting failed, emailBody or subject is missing");
    }
    //contains message sent, subject line and ARN
    //ARN is the unique identifier for the designated 'topic' that will contain everyone receiving the message
    const command = new PublishCommand({
        TopicArn: process.env.AWS_TOPIC,
        Message: message.emailBody,
        Subject: message.subject,
    });

    const response = await sns.send(command);
    console.log(`sendEmailStart: email sent successfully, MessageId: ${response.MessageId}`);
    return response;
}

//sends an email on experiment end
export async function sendEmailEnd(experimentId, experimentName, shop)
{
    //error handling
    if (!experimentId) {
        throw new Error("sendEmailStart: experimentId is required");
    }
    if (!experimentName) {
        throw new Error("sendEmailStart: experimentName is required");
    }
    if (!shop) {
        throw new Error("sendEmailStart: shop is required");
    }

    //fetch analysis for determining winner
    const { getVariants } = await import("../services/variant.server"); 
    const variants = await getVariants(experimentId); //fetch variants for experiment
    const { getAnalysis } = await import("../services/experiment.server");
    
    //fetch analysis for all experiments (including mobile and desktop)
    const analysisResults = await Promise.all(
        variants.map(async (v) => {
            const a = await getAnalysis(experimentId, v.id, "all");
            //if no analysis, return null
            if (!a) return null;
            //return all analysises, and also the variant name
            return { ...a, variantName: v.name };
        })
    );

    //drops null entries (if a variant has no analysis it gets excluded)
    const analysis = analysisResults.filter(Boolean);

    const winnerSummary = determineWinner(analysis);

    console.log(`inside sendEmailStart()`);
    const sns = new SNSClient({
        region: process.env.AWS_REGION,
    }); 

    const message = formatExperimentCompleted({
        experimentName,
        experimentId,
        shop,
        winnerSummary,
    });

    if (!message?.emailBody || !message?.subject) {
        throw new Error("sendEmailStart: message formatting failed, emailBody or subject is missing");
    }
    //contains message sent, subject line and ARN
    //ARN is the unique identifier for the designated 'topic' that will contain everyone receiving the message
    const command = new PublishCommand({
        TopicArn: process.env.AWS_TOPIC,
        Message: message.emailBody,
        Subject: message.subject,
    });

    const response = await sns.send(command);
    console.log(`sendEmailStart: email sent successfully, MessageId: ${response.MessageId}`);
    return response;
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
//determine the winner of the completed experiment
export function determineWinner(analysis) {
    //must have %80 probability of being best
    const PROB_THRESHOLD = 0.8;
    //must be %1 better than control
    const DELTA_THRESHOLD = 0.01;

    //error handling
    if (!analysis || analysis.length === 0) return "Inconclusive";
    //find control for baseline, if no controll can't make comparison (inconclusive)
    const control = analysis.find(a => a.variantName === "Control");
    if (!control) return "Inconclusive";


    const winners = analysis.filter(variant => {
        if (variant.variantName === "Control") return false;
        //how much better variant is than control
        const delta = variant.conversionRate - control.conversionRate;
        //return variant if it's better than probability threshold and better than control
        return variant.probabilityOfBeingBest >= PROB_THRESHOLD && delta > DELTA_THRESHOLD;
    });

    //if no better variants, inconclusive
    if (winners.length === 0) return "Inconclusive";

    //map variant names to [A/B/C/D] labels or "Base case" for Control
    //first non control gets A, second B, etc
    const VARIANT_LABELS = { "Control": "Base case" };
    const nonControlVariants = analysis
        .filter(a => a.variantName !== "Control")
        .map((a, i) => ({ name: a.variantName, label: String.fromCharCode(65 + i) })); //[A, B, C, D] from [0, 1, 2, 3]

    nonControlVariants.forEach(v => {
        VARIANT_LABELS[v.name] = v.label;
    });

    //if one winner, return it directly
    if (winners.length === 1) {
        const label = VARIANT_LABELS[winners[0].variantName] ?? winners[0].variantName;
        return `Variant ${label} has won`;
    }

    //multiple winners - return the one with highest probability
    const topWinner = winners.reduce((best, curr) =>
        curr.probabilityOfBeingBest > best.probabilityOfBeingBest ? curr : best
    );
    const label = VARIANT_LABELS[topWinner.variantName] ?? topWinner.variantName;
    return `Variant ${label} has won`;
}