import { Builder, By, until } from "selenium-webdriver";
import * as firefox from "selenium-webdriver/firefox.js";
import "dotenv/config";
const ADMIN_APP_URL = process.env.SHOPIFY_ADMIN_APP_URL;

describe("Shopify app - selenium (Firefox)", function () {
  this.timeout(120000);

  let driver;

  before(async () => {
    const options = new firefox.Options();

    // Headless mode (Firefox syntax is different from Chrome)
    if (process.env.HEADLESS === "1") {
      options.addArguments("-headless");
    }

    if (process.env.FIREFOX_PROFILE_PATH) {
      options.setProfile(process.env.FIREFOX_PROFILE_PATH);
    }

    driver = await new Builder()
      .forBrowser("firefox")
      .setFirefoxOptions(options)
      .build();
  });

  after(async () => {
    if (driver) await driver.quit();
  });

  it("opens the embedded Shopify app", async () => {
    if (!ADMIN_APP_URL) {
      throw new Error("Missing SHOPIFY_ADMIN_APP_URL in .env");
    }

    await driver.get(ADMIN_APP_URL);

    // Wait for embedded app iframe
    const iframe = await driver.wait(
      until.elementLocated(By.css("iframe#app-iframe, iframe[name='app-iframe']")),
      3000000
    );

    await driver.switchTo().frame(iframe);

    const heading = await driver.wait(
      until.elementLocated(By.css("[data-testid='app-title'], h1")),
      3000000
    );

    const text = await heading.getText();
    if (!text) throw new Error("App UI did not load properly");
  });
});