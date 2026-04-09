Here are the key limitations you'll hit:

Navigation
Every page navigation requires a full URL reload. App Bridge renders the sidebar nav in the parent frame, so s-link elements inside the iframe have zero size and can't be clicked. You must use navigateToAppRoute() → switchToAppIframe() → waitForAppReady() for every page change. This is slow (~5-7s per navigation) and loses any in-memory React state.

In-app links/buttons that use React Router (not App Bridge) should work fine inside the iframe — things like clicking a row in the experiments table to go to a detail page.

Interacting with Polaris Components
App Bridge components render in the parent frame, not the iframe. This includes:

s-title-bar (page title, action buttons)
s-modal (modals triggered via App Bridge)
s-toast (toast notifications)
s-contextual-save-bar
To interact with these, you'd need to switchToParent(driver), find the element, interact, then switch back. And they may be inside shadow DOM.

Polaris React components (<Button>, <TextField>, <Select>, etc.) render as normal HTML inside the iframe and should be interactable with standard Selenium selectors. Target the underlying <button>, <input>, <select> elements.

Cookie Expiration
Cookies expire. When they do, tests fail with an error telling you to re-run the setup flow. There's no way to auto-refresh them since hCaptcha blocks all ChromeDriver-launched browsers. You'll need to periodically repeat npm run test:e2e:setup → npm run test:e2e:headed.

CI/CD
This can't run in CI without pre-seeded cookies. You'd need to run the manual login locally, commit or upload the .e2e-cookies.json as a CI secret/artifact, and accept that it'll break when cookies expire. This is inherently fragile for CI.

Shared Browser State (Headed Mode)
In headed mode, both test files share the same Chrome tab. The quitDriver() detaches without closing Chrome, so the second test file inherits whatever page the first one left off on. Test files should not assume a clean starting state — each beforeAll navigates explicitly, which is already the case.

Performance
Each test that navigates is slow (~5-10s for URL load + iframe switch + React hydration). A full suite of 20+ tests could take several minutes. Keep navigation-heavy tests to critical paths and prefer testing multiple assertions per page load rather than one assertion per test.

What Works Well
Reading page content inside the iframe
Clicking standard HTML elements (<button>, <a>, <input>) inside the iframe
Form filling via sendKeys or jsClick
Asserting text content, element presence, element counts
Direct URL navigation to any app route
