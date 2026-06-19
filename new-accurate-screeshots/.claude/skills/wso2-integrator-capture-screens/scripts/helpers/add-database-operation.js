// Add a database operation node from an introspected connection.
// Must be in flow editor. The node panel must be open or openable.
//
// buttonId: add-button testid, or null if panel already open
// connectionName: e.g. "mysqlDb"
// operationText: display text, e.g. "Get rows from records table."
// opts.resultVar: name for result variable (default: keep default)
// opts.selectAllFields: if true, clicks "Select All Fields" checkbox
// opts.fields: string[] of field names to select (clicks individual checkboxes)
globalThis.addDatabaseOperationNode = async (buttonId, connectionName, operationText, opts = {}) => {
  await waitForGuest();

  if (buttonId) {
    await clickAddButton(buttonId);
    await window.waitForTimeout(500);
  }

  await clickInNodePanel(connectionName);
  await window.waitForTimeout(500);

  await clickInNodePanel(operationText);
  await window.waitForTimeout(2000);

  // Fill result variable if specified
  if (opts.resultVar) {
    await guestFill(guestFrame.getByRole('textbox', {name: /Result/}), opts.resultVar);
    await window.waitForTimeout(200);
  }

  // Select fields
  if (opts.selectAllFields || !opts.fields) {
    await guestClick(guestFrame.locator('vscode-checkbox, [role="checkbox"]').first());
    await window.waitForTimeout(300);
  } else if (opts.fields) {
    for (const field of opts.fields) {
      const idx = await guestFrame.evaluate((name) => {
        const checkboxes = [...document.querySelectorAll('vscode-checkbox, [role="checkbox"]')];
        return checkboxes.findIndex(cb => {
          const text = cb.parentElement?.textContent || '';
          return text.includes(name) && !text.includes('Select All');
        });
      }, field);
      if (idx >= 0) {
        await guestClick(guestFrame.locator('vscode-checkbox, [role="checkbox"]').nth(idx));
        await window.waitForTimeout(200);
      }
    }
  }

  // Save
  await saveNodeForm();

  // Database operation saves can trigger codegen that navigates to project overview
  // (opens a second WSO2 Integrator tab). Wait, then recover.
  await window.waitForTimeout(5000);

  // Close any extra WSO2 Integrator tabs (keep only the last one)
  const tabs = window.locator('[role="tab"]').filter({hasText: 'WSO2 Integrator'});
  while (await tabs.count() > 1) {
    await tabs.first().click();
    await window.keyboard.press('Meta+w');
    await window.waitForTimeout(1000);
  }

  guestFrame = null;
  await waitForGuest(30000);

  // Wait for canvas add-buttons to appear (codegen may still be running)
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const btns = await listAddButtons().catch(() => []);
    if (btns.length > 0) return;
    await window.waitForTimeout(1000);
  }
};
