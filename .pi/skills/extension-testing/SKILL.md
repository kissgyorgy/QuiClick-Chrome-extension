---
name: extension-testing
description: Testing the QuiClick Chrome extension with playwright-cli. Use when asked to test, visually verify, or interact with the extension in a browser.
---

# Extension Testing with playwright-cli

## Prerequisites

Build the extension first:

```bash
just extension::build
```

The config at `.playwright/cli.config.json` is picked up automatically. It loads
the built extension from `extension/dist/` into Chromium.

## Extension ID

```
cphhflhnofoigodnkecohlndjbpbhpml
```

Verify: `just extension::extension-id`

## Key URLs

- Newtab: `chrome-extension://cphhflhnofoigodnkecohlndjbpbhpml/newtab.html`
- Popup: `chrome-extension://cphhflhnofoigodnkecohlndjbpbhpml/popup.html`

## Launch

```bash
playwright-cli open --persistent
```

## Navigate to Extension Pages

Playwright blocks `chrome-extension://` URLs in normal navigation.
Use CDP to bypass:

```bash
# Newtab page
playwright-cli run-code "async page => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.navigate', { url: 'chrome-extension://cphhflhnofoigodnkecohlndjbpbhpml/newtab.html' });
  await page.waitForLoadState('domcontentloaded');
}"

# Popup page
playwright-cli run-code "async page => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.navigate', { url: 'chrome-extension://cphhflhnofoigodnkecohlndjbpbhpml/popup.html' });
  await page.waitForLoadState('domcontentloaded');
}"
```

After navigating, use normal playwright-cli commands: `snapshot`, `screenshot`, `click`, etc.

## Seed Test Data

Inject bookmarks into `chrome.storage.local` before or after navigating:

```bash
playwright-cli run-code "async page => {
  await page.evaluate(() => {
    return chrome.storage.local.set({
      bookmarks: [
        { id: 'b1', title: 'Google', url: 'https://google.com', position: [0, 0] },
        { id: 'b2', title: 'GitHub', url: 'https://github.com', position: [1, 0] },
        { id: 'b3', title: 'Reddit', url: 'https://reddit.com', position: [2, 0] },
      ],
      folders: [],
      bookmarkSettings: { showTitles: true, tilesPerRow: 8, tileGap: 1, showAddButton: true }
    });
  });
}"
```

Then reload the page (use the CDP navigate snippet above) to pick up changes.

## Cleanup

```bash
playwright-cli close
# Delete persistent profile for a fresh start next time:
playwright-cli delete-data
```
