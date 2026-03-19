import { By, until } from "selenium-webdriver";

export async function waitForManualLoginIfNeeded(driver, timeoutMs = 10 * 60 * 1000) {
  // Wait briefly for navigation/redirects to settle
  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return typeof url === "string" && url.length > 0;
  }, 30000);

  const startUrl = await driver.getCurrentUrl();
  const isLogin =
    startUrl.includes("accounts.shopify.com") ||
    startUrl.includes("/login") ||
    startUrl.includes("id.shopify.com");

  // If we're not on login, don't block
  if (!isLogin) return;

  // Otherwise, give time for manual login
  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return (
      !url.includes("accounts.shopify.com") &&
      !url.includes("id.shopify.com") &&
      !url.includes("/login")
    );
  }, timeoutMs);
}

export async function switchToAppIFrame(driver, timeoutMs = 60000) {
  const iframe = await driver.wait(
    until.elementLocated(By.css("iframe#app-iframe, iframe[name='app-iframe']")),
    timeoutMs,
  );
  await driver.wait(until.elementIsVisible(iframe), timeoutMs);
  await driver.switchTo().frame(iframe);

  // Wait for app to become interactive/ready.
  await driver.wait(async () => {
    const rs = await driver.executeScript("return document.readyState");
    return rs === "complete" || rs === "interactive";
  }, timeoutMs);
}

