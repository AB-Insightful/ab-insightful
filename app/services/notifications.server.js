//import two message cases
import { formatExperimentCompleted } from '../routes/messages/experimentCompleted';
import { formatExperimentStarted } from '../routes/messages/experimentStarted';

// This file focuses on functions tied to the Amazon SNS
import { SNSClient, PublishCommand, SubscribeCommand } from "@aws-sdk/client-sns";

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
    const variants = await getVariants(experimentId);
    const { getAnalysis } = await import("../services/experiment.server");
    
    const analysisResults = await Promise.all(
        variants.map(async (v) => {
            const a = await getAnalysis(experimentId, v.id, "all");
            if (!a) return null;
            return { ...a, variantName: v.name };
        })
    );

    // dumps any null data before returning 
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

//determine the winner of the completed experiment
export function determineWinner(analysis) {
    const PROB_THRESHOLD = 0.8;
    const DELTA_THRESHOLD = 0.01;

    //error handling
    if (!analysis || analysis.length === 0) return "Inconclusive";
    const control = analysis.find(a => a.variantName === "Control");
    if (!control) return "Inconclusive";

    const winners = analysis.filter(variant => {
        if (variant.variantName === "Control") return false;
        const delta = variant.conversionRate - control.conversionRate;
        return variant.probabilityOfBeingBest >= PROB_THRESHOLD && delta > DELTA_THRESHOLD;
    });

    if (winners.length === 0) return "Inconclusive";

    //map variant names to [A/B/C/D] labels or "Base case" for Control
    const VARIANT_LABELS = { "Control": "Base case" };
    const nonControlVariants = analysis
        .filter(a => a.variantName !== "Control")
        .map((a, i) => ({ name: a.variantName, label: String.fromCharCode(65 + i) })); //[A, B, C, D] from [0, 1, 2, 3]

    nonControlVariants.forEach(v => {
        VARIANT_LABELS[v.name] = v.label;
    });

    if (winners.length === 1) {
        const label = VARIANT_LABELS[winners[0].variantName] ?? winners[0].variantName;
        return `Variant ${label} has won`;
    }

    //multiple winners — return the one with highest probability
    const topWinner = winners.reduce((best, curr) =>
        curr.probabilityOfBeingBest > best.probabilityOfBeingBest ? curr : best
    );
    const label = VARIANT_LABELS[topWinner.variantName] ?? topWinner.variantName;
    return `Variant ${label} has won`;
}