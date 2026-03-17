//verificationMessage.js - format verification message sent when a new email/phone number is added
//usage:
//   import { formatVerificationMessage } from './data/verificationMessage';
//   const message = formatVerificationMessage({ contactType, contactValue, token, shop });
//
//parameters:
//   contactType   — string  - "email" | "phone"
//   contactValue  — string  — "example@example.com | 555-555-5555"
//   token         — string  —  unique token stored on ContactEmail/ContactPhone record
//   shop          — string  — "test-store-for-ben.myshopify.com"

//note: based on change in planning (aws has it's own subscribe/unsubscribed), this is likely to not be used

const APP_HANDLE = "ab-insightful-1"; //update if app handle changes

//test-store-for-ben.myshopify.com -> test-store-for-ben
function getVerifyUrl(shop, token, contactType) {
  const shopSlug = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${shopSlug}/apps/${APP_HANDLE}/app/verify?token=${token}&type=${contactType}`;
}

//return subject, emailBody and smsBody as formatted messages
export function formatVerificationMessage({ contactType, contactValue, token, shop }) {
  const verifyUrl = getVerifyUrl(shop, token, contactType);
  const isEmail = contactType === "email";

  return {
    //email
    subject: "Please verify your contact information — AB Insightful",
    emailBody: `
Hello,

${
  isEmail
    ? `You recently added ${contactValue} to receive AB Insightful notifications.`
    : `You recently added ${contactValue} to receive AB Insightful SMS notifications.`
}

Please verify this ${isEmail ? "email address" : "phone number"} by clicking the link below:
${verifyUrl}

If you did not add this contact information, ignore this message.

—AB Insightful
    `.trim(),
    //SMS
    smsBody: `[AB Insightful] Verify your phone number to receive notifications. Tap to confirm: ${verifyUrl}`,
  };
}
