//experimentCompleted.js (notification that experiment has ended, as in experiment has status "Completed")
//usage:
//   import { formatExperimentCompleted } from './messages/experimentCompleted';
//   const message = formatExperimentCompleted({ experimentName, experimentId, shop, analyses });
//
//parameters:
//   experimentName  — string  — "myExperiment"
//   experimentId    — number  — "9001"
//   shop            — string  — "test-store-for-ben.myshopify.com"
//   winnerSummary   - string  - "Variant A won with 90% Probability of best" | "Inconclusive" (calculate server side)

const APP_HANDLE = "ab-insightful-1"; //update if app handle changes

//test-store-for-ben.myshopify.com -> test-store-for-ben
function getExperimentUrl(shop, experimentId) {
  const shopFormatted = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${shopFormatted}/apps/${APP_HANDLE}/app/reports/${experimentId}`;
}

//return subject, emailBody and smsBody as formatted messages
export function formatExperimentCompleted({ experimentName, experimentId, shop, winnerSummary }) {
  const url = getExperimentUrl(shop, experimentId);

  return {
    //email
    subject: `Experiment "${experimentName}" has completed`,
    emailBody: `
Hello,

Your experiment "${experimentName}" has completed!

Result:
${winnerSummary}

You can check out the full details here:
${url}

—AB Insightful
    `.trim(),
    //SMS
    smsBody: `[AB Insightful] "${experimentName}" has completed. Result: ${winnerSummary}. View details: ${url}`,
  };
}

//will be something like send(message.smsBody); I would imagine