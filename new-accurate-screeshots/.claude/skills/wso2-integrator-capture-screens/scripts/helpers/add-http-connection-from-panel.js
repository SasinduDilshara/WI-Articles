globalThis.addHttpConnectionFromPanel = async (name, url) => {
  // Must be in flow editor.
  // First connection: "Add Connection" text visible → webview navigation.
  // Subsequent: open node panel, use "+" icon (overlay, no nav).
  await waitForGuest();

  const textBtn = guestFrame.getByText('Add Connection', {exact: true}).first();
  if (await textBtn.isVisible().catch(() => false)) {
    await guestClick(textBtn);
    await waitForGuest();
  } else {
    await ensureNodePanelOpen();
    await guestFrame.locator('.codicon-add').first().evaluate(el => el.closest('vscode-button').click());
    await window.waitForTimeout(500);
  }

  // Wait for connector list OR direct form
  const landing = await Promise.race([
    waitForText('Pre-built Connectors', 20000).then(() => 'list'),
    waitForText('Connection Name', 20000).then(() => 'form'),
  ]);
  if (landing === 'list') {
    await guestFrame.getByText('HTTP', {exact: true}).first().evaluate(el => el.click());
    await waitForText('Connection Name');
  }

  // URL field: CM editor on Pre-built Connectors path, plain text-field on direct path.
  // The CM path requires a quoted Ballerina string literal: "https://..."
  // But this produces double-escaped quotes in the generated .bal file.
  // Use keyboard input instead, which the UI handles correctly.
  const cmCount = await guestFrame.evaluate(() => document.querySelectorAll('.cm-content').length);
  if (cmCount > 0) {
    await cmFill(url, 0);
  } else {
    const urlField = guestFrame.getByRole('textbox').first();
    await guestFill(urlField, url);
  }
  await guestFill(guestFrame.getByRole('textbox', {name: /Connection Name/i}), name);
  await window.keyboard.press('Escape');
  await window.waitForTimeout(300);
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save Connection'}));
  await waitForGuest();
  // Wait for form to close
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const visible = await guestFrame.locator('vscode-button').filter({hasText: 'Save Connection'}).isVisible().catch(() => false);
    if (!visible) break;
    await window.waitForTimeout(300);
  }
  await window.waitForTimeout(500);
  await closeSidePanel();
};
