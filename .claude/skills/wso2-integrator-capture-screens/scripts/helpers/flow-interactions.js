// ── Canvas add-buttons ──

globalThis.clickEmptyNodeButton = async (id) => {
  await guestFrame.locator(`[data-testid="${id}"]`).evaluate(
    el => el.dispatchEvent(new MouseEvent('click', {bubbles: true}))
  );
  await window.waitForTimeout(300);
};

globalThis.clickLinkButton = async (id) => {
  await guestClick(guestFrame.locator(`[data-testid="${id}"]`));
  await window.waitForTimeout(300);
};

globalThis.clickAddButton = async (id) => {
  if (id.startsWith('empty-node')) await clickEmptyNodeButton(id);
  else await clickLinkButton(id);
};

globalThis.firstEmptyNodeButton = async () => {
  const buttons = await listAddButtons();
  const btn = buttons.find(b => b.startsWith('empty-node'));
  if (!btn) throw new Error('No empty-node-add-button found');
  return btn;
};

// ── Panel management ──

globalThis.dismissSidePanel = async () => {
  await window.keyboard.press('Escape');
  await window.waitForTimeout(300);
};

globalThis.closeSidePanel = async () => {
  // Try data-testid close button first, fall back to finding any panel close button
  const closeBtn = guestFrame.locator('[data-testid="close-panel-btn"]');
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.evaluate(el => el.click());
    await window.waitForTimeout(300);
    return;
  }
  // Avoid clicking title-bar actions such as Configure. If there is no known
  // panel close button, Escape is the safest generic fallback.
  await window.keyboard.press('Escape');
  await window.waitForTimeout(300);
};

globalThis.closeHelperPanel = async () => {
  await guestFrame.evaluate(() =>
    document.querySelector('[aria-label="Close Helper Panel"]')?.click()
  );
  await window.waitForTimeout(200);
};

globalThis.closeNodeForm = async () => {
  const closeButtons = guestFrame.locator('.side-panel-header button, [class*="header"] button[aria-label="Icon Button"]');
  if (await closeButtons.count() > 0) {
    await closeButtons.first().click();
    await window.waitForTimeout(500);
  }
};

globalThis.ensureNodePanelOpen = async () => {
  const hasPanel = await guestFrame.getByText('Statement', {exact: true}).isVisible().catch(() => false);
  if (hasPanel) return;
  const buttons = await listAddButtons();
  const btn = buttons.find(b => b.startsWith('empty-node')) || buttons[0];
  if (!btn) throw new Error('No add buttons found to open node panel');
  await clickEmptyNodeButton(btn);
  await waitForText('Statement');
};

globalThis.clickInNodePanel = async (text) => {
  await guestFrame.getByText(text, {exact: true}).last().evaluate(el => el.click());
  await window.waitForTimeout(300);
};

// ── CodeMirror helpers ──

globalThis.blurAllCM = async () => {
  await guestFrame.evaluate(() =>
    document.querySelectorAll('.cm-content').forEach(el =>
      el.dispatchEvent(new Event('focusout', {bubbles: true}))
    )
  );
  await window.waitForTimeout(300);
};

// ── Save helpers ──
// dispatchEvent is more reliable than guestClick for vscode-buttons.

globalThis.clickSaveButton = async () => {
  await guestFrame.locator('vscode-button').filter({hasText: 'Save'}).first()
    .evaluate(el => el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true})));
};

// Click a vscode-button by its text label using dispatchEvent.
globalThis.clickVscodeButton = async (text) => {
  await guestFrame.locator('vscode-button').filter({hasText: text}).first()
    .evaluate(el => el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true})));
  await window.waitForTimeout(300);
};

globalThis.clickExactVscodeButton = async (text) => {
  const clicked = await guestFrame.evaluate((text) => {
    const btn = [...document.querySelectorAll('vscode-button')]
      .find(b => b.getBoundingClientRect().height > 0 && b.textContent?.trim() === text);
    if (!btn) return false;
    btn.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    return true;
  }, text);
  if (!clicked) throw new Error(`vscode-button not found: ${text}`);
  await window.waitForTimeout(300);
};

globalThis.saveNodeForm = async () => {
  await clickSaveButton();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const saving = await guestFrame.getByText('Saving...').isVisible().catch(() => false);
    const validating = await guestFrame.getByText('Validating...').isVisible().catch(() => false);
    if (!saving && !validating) return;
    await window.waitForTimeout(300);
  }
};

globalThis.saveAndCloseNodeForm = async () => {
  await blurAllCM();
  await window.waitForTimeout(300);
  await saveNodeForm();
  await window.waitForTimeout(1000);
  await closeSidePanel();
};

// Wait for a vscode-button to disappear (e.g. after Save Connection).
globalThis.waitForButtonGone = async (text, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const visible = await guestFrame.locator('vscode-button').filter({hasText: text}).isVisible().catch(() => false);
    if (!visible) return;
    await window.waitForTimeout(300);
  }
};

// ── Canvas navigation ──

globalThis.scrollNodeIntoView = async (textMatch) => {
  await guestFrame.evaluate((match) => {
    const node = [...document.querySelectorAll('.node[data-nodeid]')]
      .find(n => n.textContent.includes(match));
    node?.scrollIntoView({block: 'center'});
  }, textMatch);
  await window.waitForTimeout(500);
};

// ── Zoom helpers (discovery only — don't use in recordings) ──

globalThis.fitCanvasToScreen = async () => {
  await waitForGuest();
  const fitSelectors = ['[data-testid="fit-to-screen-button"]', 'button.codicon-screen-full'];
  for (const sel of fitSelectors) {
    try {
      const loc = guestFrame.locator(sel).first();
      if (await loc.count() > 0) {
        await loc.evaluate(el => el.dispatchEvent(new MouseEvent('click', {bubbles: true})));
        await window.waitForTimeout(300);
        return;
      }
    } catch {}
  }
  await zoomOutCanvas(3);
};

globalThis.zoomOutCanvas = async (clicks = 3) => {
  await waitForGuest();
  const selectors = [
    'button.codicon-zoom-out',
    '[data-testid="zoom-out-button"]',
    '.canvas-zoom-controls button:first-child',
  ];
  for (let i = 0; i < clicks; i++) {
    let clicked = false;
    for (const sel of selectors) {
      try {
        const loc = guestFrame.locator(sel).first();
        if (await loc.count() > 0) {
          await loc.evaluate(el => el.dispatchEvent(new MouseEvent('click', {bubbles: true})));
          clicked = true;
          break;
        }
      } catch {}
    }
    if (!clicked) {
      await window.keyboard.press(process.platform === 'darwin' ? 'Meta+-' : 'Control+-');
    }
    await window.waitForTimeout(200);
  }
};
