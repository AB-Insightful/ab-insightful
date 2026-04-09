import { Builder, Browser } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

/**
 * Creates a Chrome WebDriver instance.
 *
 * Two modes:
 *
 * 1. HEADED=true — connects to an already-running Chrome on port 9222.
 *    The user launches Chrome via `npm run test:e2e:setup`, logs in to
 *    Shopify (captcha works because it's a real Chrome, not ChromeDriver),
 *    then Selenium attaches to save cookies and run tests.
 *
 * 2. Headless (default) — launches a new headless Chrome with
 *    anti-detection flags. Auth uses saved cookies from a previous
 *    headed session.
 */
export async function createDriver() {
  const options = new chrome.Options();
  const isHeadless = process.env.HEADED !== "true";

  if (isHeadless) {
    // Launch a new headless Chrome
    options.excludeSwitches("enable-automation");
    options.addArguments(
      "--headless=new",
      "--window-size=1280,800",
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    );

    const driver = await new Builder()
      .forBrowser(Browser.CHROME)
      .setChromeOptions(options)
      .build();

    try {
      await driver.sendDevToolsCommand("Page.addScriptToEvaluateOnNewDocument", {
        source: `Object.defineProperty(navigator, 'webdriver', { get: () => undefined });`,
      });
    } catch {
      // Non-fatal
    }

    await driver.manage().setTimeouts({ implicit: 10_000, pageLoad: 60_000 });
    return driver;
  }

  // Headed mode: attach to the user's running Chrome via remote debugging.
  // This Chrome was launched by `npm run test:e2e:setup` (a real Chrome,
  // no ChromeDriver), so hCaptcha and all captchas work normally.
  console.log("[e2e-driver] Connecting to Chrome on 127.0.0.1:9222...");
  options.debuggerAddress("127.0.0.1:9222");

  const driver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(options)
    .build();

  await driver.manage().setTimeouts({ implicit: 10_000, pageLoad: 60_000 });
  console.log("[e2e-driver] Connected to running Chrome");
  return driver;
}

/**
 * Safely quit the driver.
 * In headed/remote mode we just detach — don't close the user's browser.
 */
export async function quitDriver(driver) {
  try {
    if (process.env.HEADED === "true") {
      // Remote debugging mode — don't quit the user's Chrome
      return;
    }
    await driver.quit();
  } catch {
    // session already terminated
  }
}
