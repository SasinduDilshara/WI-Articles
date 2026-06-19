// Return the link-add-button ID that sits just before the Error Handler node —
// i.e. the last insertion point INSIDE the do{} block.
//
// Scrolls the Error Handler into view first so the virtual canvas renders
// all nearby link buttons (avoids the need to zoom).
globalThis.getLastDoBlockButtonId = async () => {
  await scrollNodeIntoView('Error Handler');
  const btns = await guestFrame.evaluate(() =>
    [...document.querySelectorAll('foreignObject')]
      .filter(fo => fo.querySelector('[data-testid*="link-add-button"]'))
      .map(fo => ({
        id: fo.querySelector('[data-testid]').dataset.testid,
        y: parseFloat(fo.getAttribute('y'))
      }))
      .filter(b => !b.id.includes('undefined'))
      .sort((a, b) => a.y - b.y)
  );
  if (btns.length < 2) throw new Error('getLastDoBlockButtonId: need ≥2 buttons, got: ' + JSON.stringify(btns));
  return btns[btns.length - 2].id;
};

// Declare a variable inside the do{} block (at the end, before Error Handler).
globalThis.addDeclareVarInDoBlock = async (name, expr) => {
  const btnId = await getLastDoBlockButtonId();
  await clickLinkButton(btnId);
  await window.waitForTimeout(300);
  await clickInNodePanel('Declare Variable');
  await window.waitForTimeout(500);
  await fillVariableName(name);
  await cmFill(expr);
  await blurAllCM();
  await window.waitForTimeout(200);
  await saveNodeForm();
  await waitForText(name);
};

// Add a Return node at the end of the do{} block (before Error Handler).
globalThis.addReturnInDoBlock = async (expression) => {
  const btnId = await getLastDoBlockButtonId();
  await addReturnInBranch(btnId, expression);
};

// Delete a canvas node by its data-nodeid attribute.
globalThis.deleteNodeById = async (nodeId) => {
  await guestFrame.evaluate((id) => {
    const node = document.querySelector(`.node[data-nodeid="${id}"]`);
    node?.querySelector('vscode-button[appearance="icon"]')?.click();
  }, nodeId);
  await window.waitForTimeout(400);
  await guestFrame.getByText('Delete', {exact: true}).evaluate(el => el.click());
  await window.waitForTimeout(500);
};

// Delete a canvas node by matching text visible inside it.
globalThis.deleteNodeByText = async (text) => {
  const nodeId = await guestFrame.evaluate((t) => {
    const node = [...document.querySelectorAll('.node[data-nodeid]')]
      .find(n => n.textContent.includes(t));
    return node?.getAttribute('data-nodeid');
  }, text);
  if (!nodeId) throw new Error(`deleteNodeByText: node with text "${text}" not found`);
  await deleteNodeById(nodeId);
};
