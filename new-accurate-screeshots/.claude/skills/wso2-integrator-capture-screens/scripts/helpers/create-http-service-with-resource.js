globalThis.createHttpServiceWithResource = async (method, path, responseCodes = []) => {
  // From integration overview. Ends in flow editor for the new resource.
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Add Artifact'}));
  await waitForGuest();
  await waitForText('HTTP Service');
  await guestClick(guestFrame.getByText('HTTP Service').last());
  await waitForGuest();
  await waitForText('Service Base Path');
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Create'}));
  await waitForGuest();
  await waitForText('Add Resource');

  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Add Resource'}));
  await waitForGuest();
  await guestFrame.getByText(method, {exact: true}).evaluate(el => el.click());
  await waitForGuest();
  await waitForText('Resource Path');
  await guestFill(guestFrame.getByRole('textbox', {name: /Resource Path/i}), path);

  for (const code of responseCodes) {
    await guestClick(guestFrame.getByText('Response', {exact: true}));
    await guestFill(guestFrame.getByRole('combobox', {name: /Status Code/i}), String(code));
    await guestClick(guestFrame.getByText('Add', {exact: true}));
    await window.waitForTimeout(500);
  }

  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save'}));
  await waitForGuest();
  await waitForText('Flow Sequence');
};
