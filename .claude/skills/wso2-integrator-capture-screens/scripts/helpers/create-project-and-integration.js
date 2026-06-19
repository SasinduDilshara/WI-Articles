globalThis.createProjectAndIntegration = async (baseName) => {
  const ts = Date.now();
  const integrationName = `${baseName}${ts}`;
  const projectName = `Project${ts}`;

  await waitForGuest();
  try { await window.frames()[0].getByRole("button", {name: "Skip for now"}).click(); } catch {}

  await guestClick(guestFrame.getByText('Create', {exact: true}).first());
  await waitForGuest();
  await waitForText('Integration Name');

  await guestFill(guestFrame.getByRole('textbox', {name: /Integration Name/i}), integrationName);
  await guestFill(guestFrame.getByRole('textbox', {name: /Project Name/i}), projectName);
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Create Integration'}));
  await waitForGuest();
  await waitForText(integrationName);

  // Now on project page — click integration name to enter overview
  // guestClick unreliable here; use JS click + poll for navigation
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await guestFrame.getByText(integrationName).evaluate(el => el.click());
    const found = await waitForText('Design', 10000).catch(() => null);
    if (found) return { integrationName, projectName };
  }
  throw new Error('Failed to navigate to integration overview');
};
