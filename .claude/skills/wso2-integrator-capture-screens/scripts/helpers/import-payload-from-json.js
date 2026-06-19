globalThis.importPayloadFromJson = async (jsonString) => {
  // Must be in flow editor. Opens Configure, imports payload as json type, saves.
  // NOTE: Using "Continue with JSON Type" to avoid mangled type names.
  await guestClick(guestFrame.getByText('Configure').first());
  await waitForGuest();
  await window.waitForTimeout(500);

  await guestFrame.getByText('Define Payload').first().evaluate(el => el.click());
  await waitForGuest();
  await waitForText('Continue with JSON Type');

  // Skip the sample import — just use json type directly
  await guestFrame.getByText('Continue with JSON Type').evaluate(el => el.click());
  await waitForGuest();
  await waitForText('Payload');
  await window.waitForTimeout(500);

  // Save the resource form
  await guestFrame.locator('vscode-button').filter({hasText: 'Save'}).evaluate(el => el.click());
  await waitForGuest();
  await window.waitForTimeout(1000);
};
