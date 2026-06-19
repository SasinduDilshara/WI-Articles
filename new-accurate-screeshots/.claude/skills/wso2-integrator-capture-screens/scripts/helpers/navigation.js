// Navigate from any view to the integration overview via breadcrumb.
// Retries with guestClick on the integration name in the breadcrumb.
globalThis.navigateToOverview = async (integrationName) => {
  await waitForGuest();
  const isOverview = (s) => s.includes('Overview') && s.includes('Design') && s.includes('Add Artifact');
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const s = await snapshot().catch(() => '');
    if (isOverview(s)) return;
    await window.getByRole('button', {name: 'Open Overview'}).click().catch(() => {});
    await window.waitForTimeout(1000);
    const afterHost = await snapshot().catch(() => '');
    if (isOverview(afterHost)) return;
    // If on a flow page without full breadcrumbs, use the page back button first.
    if (s.includes('AI Agent Services') && !s.includes('Artifacts')) {
      await guestFrame.locator('[data-testid="back-button"]').evaluate(el => el.click()).catch(() => {});
      await window.waitForTimeout(3000);
      guestFrame = null;
      await waitForGuest(15000).catch(() => {});
      continue;
    }
    // If on any integration sub-page, click breadcrumb home to go to Project page.
    if (s.includes('Artifacts') || s.includes('Configurable Variables') || s.includes('Function Configuration') || s.includes('Agent Tool')) {
      await guestFrame.evaluate(() => {
        const home = document.querySelector('.fw-bi-home');
        if (home) home.closest('div[class]')?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
      }).catch(() => {});
      await window.waitForTimeout(3000);
      guestFrame = null;
      await waitForGuest(15000).catch(() => {});
      continue;
    }
    // If on Project page, click the integration name to get to overview
    if (s.includes('Integrations & Libraries')) {
      await guestFrame.getByText(integrationName).first().evaluate(el => el.click()).catch(() => {});
      await window.waitForTimeout(3000);
      guestFrame = null;
      await waitForGuest(15000).catch(() => {});
      continue;
    }
    // Otherwise click breadcrumb integration name (may go to Project first)
    await guestFrame.getByText(integrationName).first().evaluate(el => el.click()).catch(() => {});
    await window.waitForTimeout(3000);
    guestFrame = null;
    await waitForGuest(15000).catch(() => {});
  }
  throw new Error(`navigateToOverview("${integrationName}") timed out`);
};

// From the integration overview, click an artifact node to enter its view.
// Uses guestClick on the inner div (dispatchEvent doesn't trigger navigation here).
globalThis.openArtifactFromOverview = async (artifactText) => {
  await waitForGuest();
  for (let attempt = 0; attempt < 3; attempt++) {
    const innerDiv = guestFrame.locator('.node').filter({hasText: artifactText}).locator('div').first();
    if (await innerDiv.isVisible().catch(() => false)) await guestClick(innerDiv);
    else await guestFrame.getByText(artifactText, {exact: false}).first().click().catch(() => {});
    await window.waitForTimeout(3000);
    const s = await snapshot().catch(() => '');
    if (!s.includes('Overview') || s.includes('Start')) return;
    const treeItem = window.getByRole('treeitem', {name: /AI Agent Services/}).first();
    if (await treeItem.isVisible().catch(() => false)) await treeItem.dblclick();
    await window.waitForTimeout(3000);
    if (((await snapshot().catch(() => '')).includes('Start'))) return;
  }
  throw new Error(`openArtifactFromOverview("${artifactText}") did not open artifact`);
};

// Navigate back from a tool/sub-view using the back button.
globalThis.navigateBack = async () => {
  await guestFrame.locator('[data-testid="back-button"]').evaluate(el => el.click());
  await window.waitForTimeout(2000);
};

// On the overview, click the kebab (3-dot) menu for an artifact/connection node and select an action.
// nodeText: text that identifies the node (e.g. "wso2ModelProvider", "AI Agent Service")
// action: "Edit" | "Delete"
globalThis.overviewNodeAction = async (nodeText, action) => {
  await waitForGuest();
  // Find the kebab (3-dot svg) button whose ancestor node card contains nodeText
  const clicked = await guestFrame.evaluate((nodeText) => {
    const btns = [...document.querySelectorAll('[aria-label="Icon Button"]')];
    for (const btn of btns) {
      if (!btn.querySelector('svg')) continue;
      let cur = btn.parentElement;
      for (let i = 0; i < 4 && cur; i++, cur = cur.parentElement) {
        if (cur.textContent?.includes(nodeText)) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  }, nodeText);
  if (!clicked) throw new Error(`overviewNodeAction: node "${nodeText}" not found`);
  await window.waitForTimeout(500);
  await guestFrame.getByText(action, {exact: true}).last().evaluate(el => el.click());
  await window.waitForTimeout(2000);
};
