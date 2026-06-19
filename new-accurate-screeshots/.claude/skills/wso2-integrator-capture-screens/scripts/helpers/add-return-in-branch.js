globalThis.addReturnInBranch = async (buttonId, expression) => {
  // buttonId can be empty-node-add-button-N or link-add-button-N
  if (buttonId.startsWith('empty')) {
    await clickEmptyNodeButton(buttonId);
  } else {
    await clickLinkButton(buttonId);
  }
  await waitForText('Statement');
  // guestClick misses the Return item when panel is in a zoomed-out branch;
  // JS click is reliable here (not a canvas coordinate issue).
  await guestFrame.getByText('Return', {exact: true}).last().evaluate(el => el.click());
  await waitForText('Expression');

  await cmFill(expression, 0);
  await guestFrame.evaluate(() => document.querySelector('.cm-content')?.dispatchEvent(new Event('focusout', {bubbles:true})));
  await window.waitForTimeout(200);
  await guestFrame.locator('vscode-button').filter({hasText: 'Save'}).evaluate(el => el.click());
  await waitForGuest();
  await window.waitForTimeout(500);
};
