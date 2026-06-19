// Shared form-fill for an HTTP POST node form (already open, waiting for 'Path').
async function fillHttpPostForm(connectionName, resultVar) {
  await cmFill('"/"', 0);
  await guestFrame.locator('[data-testid="mode-switcher-slider-message"]')
    .getByText('Expression', {exact: true}).evaluate(el => el.click());
  await window.waitForTimeout(300);
  await closeHelperPanel();
  await cmFill('payload', 1);
  await guestFill(guestFrame.getByRole('textbox', {name: /Result/i}), resultVar);
  await guestFill(guestFrame.getByRole('textbox').last(), 'json');
  await blurAllCM();
  await window.waitForTimeout(200);
  await saveNodeForm();
  await waitForText(connectionName, 10000);
}

// After saving a POST node, find the link-add-button that immediately follows it.
// Scrolls the new node into view so the virtual canvas renders its buttons.
async function findAfterPostLinkButton(btnsBefore) {
  await scrollNodeIntoView('Error Handler');
  await window.waitForTimeout(800);
  const btnsAfter = await linkAddButtonExplainer();
  const beforeIds = new Set(btnsBefore.map(b => b.btnId));
  const newTrunkBtns = btnsAfter.filter(b => !beforeIds.has(b.btnId) && b.label === '(trunk)');
  if (!newTrunkBtns.length) throw new Error('No new (trunk) link button found after POST save');
  return newTrunkBtns[0].btnId;
}

// Add HTTP POST call + Return in a branch.
globalThis.addHttpPostAndReturn = async (buttonId, connectionName, resultVar) => {
  const btnsBefore = await linkAddButtonExplainer();
  await clickEmptyNodeButton(buttonId);
  await waitForText('Statement');
  await guestClick(guestFrame.getByText(connectionName, {exact: true}));
  await waitForGuest();
  await waitForText('Post');
  await guestClick(guestFrame.getByText('Post', {exact: true}));
  await waitForGuest();
  await waitForText('Path');

  await fillHttpPostForm(connectionName, resultVar);
  await window.waitForTimeout(500);

  const afterPostBtn = await findAfterPostLinkButton(btnsBefore);
  await addReturnInBranch(afterPostBtn, resultVar);
};

// Add HTTP POST only; returns the link-add-button ID that follows the POST node.
globalThis.addHttpPostCallInBranch = async (buttonId, connectionName, resultVar) => {
  const btnsBefore = await linkAddButtonExplainer();
  await clickEmptyNodeButton(buttonId);
  await waitForText('Statement');
  await guestClick(guestFrame.getByText(connectionName, {exact: true}));
  await waitForGuest();
  await waitForText('Post');
  await guestClick(guestFrame.getByText('Post', {exact: true}));
  await waitForGuest();
  await waitForText('Path');

  await fillHttpPostForm(connectionName, resultVar);
  await window.waitForTimeout(500);
  return findAfterPostLinkButton(btnsBefore);
};
