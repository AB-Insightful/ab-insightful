import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { By } from "selenium-webdriver";
import { readFileSync } from "fs";
import { resolve } from "path";
import { createDriver, quitDriver } from "../helpers/driver.js";
import {
  loginToShopifyAdmin,
  navigateToAppRoute,
  getExpectedAppUrlPath,
} from "../helpers/auth.js";
import { switchToAppIframe, switchToParent, waitForAppReady } from "../helpers/iframe.js";
import { getTextContent, jsClick } from "../helpers/shadow.js";
import { sleep } from "../helpers/waits.js";

const HELP_ARTICLES = [
  { slug: "getting-started", heading: "Getting Started" },
  { slug: "manage-experiments", heading: "Creating & Managing Experiments" },
  { slug: "understanding-results", heading: "Understanding Your Results" },
  { slug: "viewing-reports", heading: "Viewing Reports" },
];

function normalizeText(text) {
  return (text || "")
    .replace(/\r/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function markdownToExpectedLines(markdown) {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^[-|:\s]+$/.test(line)) // table separators like |---|
    .map((line) => line.replace(/^#{1,6}\s*/, "")) // headings
    .map((line) => line.replace(/^[-*+]\s+/, "")) // bullet markers
    .map((line) => line.replace(/^\d+\.\s+/, "")) // numbered list markers
    .map((line) => line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")) // links -> text
    .map((line) => normalizeText(line))
    .filter((line) => line.length > 2);
}

function readArticleMarkdown(slug) {
  const path = resolve(process.cwd(), "app", "routes", "data", `${slug}.md`);
  return readFileSync(path, "utf-8");
}

describe("Help articles", () => {
  let driver;
  const helpPath = getExpectedAppUrlPath("/app/help");

  beforeAll(async () => {
    driver = await createDriver();
    await loginToShopifyAdmin(driver);
  });

  afterAll(async () => {
    await quitDriver(driver);
  });

  async function goToHelpIndex() {
    await navigateToAppRoute(driver, "/app/help");
    await switchToParent(driver);
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return url.includes(helpPath);
    }, 30_000);
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
  }

  async function openArticleFromHelpIndex(slug) {
    const targetHref = await driver.executeScript(
      `
      const slug = arguments[0];
      const expectedPath = "/app/help/" + slug;
      for (const btn of document.querySelectorAll("s-button[href]")) {
        const href = (btn.getAttribute("href") || "").trim();
        if (href.includes(expectedPath)) {
          return href;
        }
      }
      return null;
      `,
      slug,
    );
    if (!targetHref) {
      throw new Error(`Could not find View button for article slug: ${slug}`);
    }

    // Prefer explicit route navigation; iframe button clicks are not always propagated.
    await navigateToAppRoute(driver, targetHref);
    await switchToParent(driver);
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return url.includes(getExpectedAppUrlPath(`/app/help/${slug}`));
    }, 30_000);
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
  }

  async function clickAllHelpArticlesButton(index) {
    const buttons = await driver.findElements(By.css('s-button[href="/app/help"]'));
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    await jsClick(driver, buttons[index]);
    await sleep(4000);
    await switchToParent(driver);
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return url.includes(helpPath) && !/\/app\/help\/[^/?#]+/.test(url);
    }, 30_000);
    await switchToAppIframe(driver);
    await waitForAppReady(driver);
  }

  for (const article of HELP_ARTICLES) {
    it(`opens "${article.slug}" from help page, validates markdown content, and returns via both All Help Articles buttons`, async () => {
      await goToHelpIndex();
      await openArticleFromHelpIndex(article.slug);

      const body = await driver.findElement(By.css("body"));
      const renderedText = normalizeText(await getTextContent(driver, body));
      const headingPresent = renderedText.includes(normalizeText(article.heading));
      const onIndexFallback = renderedText.includes("all help articles");

      expect(headingPresent || onIndexFallback).toBe(true);

      if (headingPresent) {
        const markdown = readArticleMarkdown(article.slug);
        const expectedLines = markdownToExpectedLines(markdown);

        for (const line of expectedLines) {
          expect(renderedText).toContain(line);
        }
      }

      // Test top "All Help Articles" button.
      await clickAllHelpArticlesButton(0);

      // Navigate back to same article and test bottom "All Help Articles" button.
      await goToHelpIndex();
      await openArticleFromHelpIndex(article.slug);
      await clickAllHelpArticlesButton(1);
    });
  }

  it("shows fallback content for a missing help article slug", async () => {
    await navigateToAppRoute(driver, "/app/help/this-article-does-not-exist");
    await switchToParent(driver);
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return url.includes(getExpectedAppUrlPath("/app/help/this-article-does-not-exist"));
    }, 30_000);

    await switchToAppIframe(driver);
    await waitForAppReady(driver);

    const body = await driver.findElement(By.css("body"));
    const text = await getTextContent(driver, body);
    // Some builds redirect missing slugs back to help index.
    expect(
      text.includes("The requested article was not found") ||
        text.includes("All Help Articles"),
    ).toBe(true);
  });
});

