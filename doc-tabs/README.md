# VoltMart series → Google Doc tabs

Three articles converted to clean, formatted HTML for pasting into one Google Doc,
one article per tab.

Target doc (paste into this one only):
https://docs.google.com/document/d/1pT8kZIVhS8HMZttNFmDu6xEi48tiUOSCakmlxfGv6CY/edit

## Tab order

| Tab | File | Tab title |
|-----|------|-----------|
| 1 | `tab1-first-ai-agent.html` | Part 1 — Your First AI Agent on WSO2 Integrator |
| 2 | `tab2-live-data-with-mcp.html` | Part 2 — Give Your AI Agent Live Data with MCP |
| 3 | `tab3-live-notifications-with-webhooks.html` | Part 3 — Push Live Notifications with Webhooks |
| 4 | `tab4-deploy-and-observe-on-cloud.html` | Part 4 — Deploy and Observe Your AI Agent on WSO2 Cloud |

## How to paste each tab (formatting preserved)

1. In the Google Doc, open the **tabs sidebar** (left edge) and click **+ Add tab**.
   Create three tabs and name them per the table above.
2. On your Mac, open the HTML file in a browser:
   `open doc-tabs/tab1-first-ai-agent.html`
3. Select all (**⌘A**), copy (**⌘C**).
4. Click into the matching Google Doc tab and paste (**⌘V**).
   Headings, bold, lists, blockquotes, and code blocks come across intact.
5. Repeat for tabs 2 and 3.

## What was adjusted for Google Docs

- **Cross-article links** (e.g. "part 2") pointed at local `.md` files, which would be
  dead links in Google Docs. They're now **bold plain text** instead of broken links.
- **In-page anchor links** (e.g. "Step 1.2") are kept as plain text for the same reason.
- **External links** (WSO2 docs, Docker, etc.) are preserved as real, clickable hyperlinks.
- **Images** — the architecture diagrams are local PNGs that can't travel through a copy/paste,
  so each appears as a highlighted placeholder: **[INSERT IMAGE HERE — <description>]**.
  Insert the matching file manually after pasting:
  - Tab 1: `voltmart-support/architecture.png`
  - Tab 2: `voltmart-orders-mcp/architecture.png`
  - Tab 3: `voltmart-orders-webhook/architecture.png`
- **[SCREENSHOT: …] notes** from the drafts are left in place as visible reminders of where
  screenshots go. Delete them once real screenshots are added.

## Regenerating

If the source `.md` files change, rebuild with:

```bash
python3 doc-tabs/build.py
```
