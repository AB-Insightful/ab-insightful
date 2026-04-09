//experimentStarted.js (notification that experiment has started, as in experiment has status "active")
//usage:
//   import { formatExperimentStarted } from './messages/experimentStarted';
//   const message = formatExperimentStarted({ experimentName, experimentId, shop });
//parameters:
//   experimentName  — string  — "myExperiment"
//   experimentId    — number  — "9001"
//   shop            — string  — "test-store-for-ben.myshopify.com"

const APP_HANDLE = "ab-insightful-1"; //update if app handle changes

//test-store-for-ben.myshopify.com -> test-store-for-ben
function getExperimentUrl(shop, experimentId) {
  const shopFormatted = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${shopFormatted}/apps/${APP_HANDLE}/app/reports/${experimentId}`;
}

//return subject, emailBody and smsBody as formatted messages
export function formatExperimentStarted({ experimentName, experimentId, shop }) {
  const url = getExperimentUrl(shop, experimentId);

  return {
    //email
    subject: `Experiment "${experimentName}" has started`,
    emailBody: `
Hello,

Your experiment "${experimentName}" is now active and collecting data!

You can check out the full details here:
${url}

—AB Insightful
    `.trim(),
    //SMS
    smsBody: `[AB Insightful] "${experimentName}" has started. View details: ${url}`,
  };
}

//will be something like send(message.smsBody); I would imagine