import { Builder, By, Key, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

(async function basicTest() {
  const options = new chrome.Options();

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  try {
    console.log("Opening Google...");
    await driver.get("https://www.google.com");

    const searchBox = await driver.findElement(By.name("q"));
    await searchBox.sendKeys("Selenium", Key.RETURN);

    await driver.wait(until.titleContains("Selenium"), 5000);

    const title = await driver.getTitle();
    console.log("Page title:", title);

    console.log("Selenium is working!");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await driver.quit();
  }
})();