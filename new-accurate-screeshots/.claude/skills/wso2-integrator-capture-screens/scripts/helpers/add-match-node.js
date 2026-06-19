globalThis.addMatchNode = async (targetExpr, patterns) => {
  // Must be in flow editor. Opens node panel if needed, adds Match.
  // patterns: e.g. ['"standard"', '"express"', '"digital"']
  // Do NOT include '_' in patterns — default case is added automatically.
  await ensureNodePanelOpen();
  await guestClick(guestFrame.getByText('Match', {exact: true}).last());
  await waitForGuest();
  await waitForText('Target');

  await cmFill(targetExpr, 0);
  await cmFill(patterns[0], 1);

  for (let i = 1; i < patterns.length; i++) {
    await guestFrame.getByText('Add Case Block').evaluate(el => el.click());
    await window.waitForTimeout(500);
    await cmFill(patterns[i], i + 1);
  }

  await guestFrame.getByText('Add Default Case Block').evaluate(el => el.click());
  await window.waitForTimeout(500);

  await guestFrame.evaluate(() => document.querySelector('.cm-content')?.dispatchEvent(new Event('focusout', {bubbles:true})));
  await window.waitForTimeout(200);
  await guestFrame.locator('vscode-button').filter({hasText: 'Save'}).evaluate(el => el.click());
  await waitForGuest();
  await waitForText('Match ' + targetExpr);
};
