// From integration overview, open Add Artifact and select by name.
// Waits for the target form/view to appear after selection.
//
// name: display text, e.g. "HTTP Service", "CDC for PostgreSQL", "Kafka", "Automation"
//
// Lands on the artifact creation form. Caller fills and submits.
globalThis.addArtifact = async (name) => {
  await waitForGuest();
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Add Artifact'}));
  await waitForGuest();
  // Wait for the artifact catalog
  await waitForText('Automation', 10000);
  await guestClick(guestFrame.getByText(name, {exact: false}).first());
  await window.waitForTimeout(2000);
};
