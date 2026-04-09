/**
 * Get text content from an element, handling shadow DOM.
 * Falls back to textContent via JavaScript if getText() returns empty
 * (common with web components).
 */
export async function getTextContent(driver, element) {
  let text = await element.getText();
  if (!text) {
    text = await driver.executeScript("return arguments[0].textContent", element);
  }
  return (text || "").trim();
}

/**
 * Click an element by executing JavaScript.
 * Useful when normal click() doesn't work on shadow DOM elements.
 */
export async function jsClick(driver, element) {
  await driver.executeScript("arguments[0].click()", element);
}
