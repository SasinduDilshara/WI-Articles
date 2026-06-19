// Configure a resource in one shot. Must be in flow editor for the resource.
//
// opts.queryParams: string[] — query parameter names to add
// opts.payloadType: string   — payload type via Browse Existing Types (e.g. 'string', 'json', 'byte[]')
// opts.headers:     string[] — header names to add
//
// Opens Configure, applies all options, saves and closes.
globalThis.configureResource = async (opts = {}) => {
  await guestClick(guestFrame.getByText('Configure', {exact: false}).first());
  await waitForText('Resource Configuration');

  // Payload type first — its sub-panel overlays the form and blocks subsequent fields
  if (opts.payloadType) {
    await guestClick(guestFrame.getByText('Define Payload', {exact: true}).first());
    await window.waitForTimeout(500);
    await guestClick(guestFrame.getByText('Browse Existing Types', {exact: true}).first());
    await window.waitForTimeout(500);
    await guestFrame.evaluate((t) => {
      const ps = [...document.querySelectorAll('p')];
      const match = ps.find(p => p.textContent.trim() === t);
      if (!match) throw new Error(`Type "${t}" not found in Browse Existing Types`);
      match.click();
    }, opts.payloadType);
    await window.waitForTimeout(500);
    // Inner Save (Define Payload panel) — overlay's Save is last in DOM
    await guestFrame.locator('vscode-button').filter({hasText: 'Save'}).last()
      .evaluate(el => el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true})));
    await window.waitForTimeout(1000);
  }

  if (opts.queryParams) {
    for (const name of opts.queryParams) {
      await guestClick(guestFrame.getByText('Query Parameter', {exact: true}).first());
      await window.waitForTimeout(500);
      await guestFill(guestFrame.getByRole('textbox', {name: /Name/}).first(), name);
      await window.waitForTimeout(300);
      await clickSaveButton();
      await waitForText(`string ${name}`, 20000);
    }
  }

  if (opts.headers) {
    for (const name of opts.headers) {
      await guestClick(guestFrame.getByText('Header', {exact: true}).first());
      await window.waitForTimeout(500);
      await guestFill(guestFrame.getByRole('textbox', {name: /Name/}).first(), name);
      await window.waitForTimeout(300);
      await clickSaveButton();
      await window.waitForTimeout(1000);
    }
  }

  // Save overall resource config
  await clickSaveButton();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const saving = await guestFrame.getByText('Saving...').isVisible().catch(() => false);
    if (!saving) break;
    await window.waitForTimeout(300);
  }
  await window.waitForTimeout(500);
  await window.keyboard.press('Escape');
  await window.waitForTimeout(500);
};
