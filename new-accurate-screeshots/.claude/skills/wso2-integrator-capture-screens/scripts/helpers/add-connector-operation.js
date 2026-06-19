// Add a connector operation node to the flow.
// Must be in flow editor. Clicks the specified add-button, selects the connection,
// then picks the operation. Lands on the operation config form.
//
// buttonId: add-button testid, OR null if node panel is already open (e.g. right after addConnectorConnection)
// connectionName: name of the connection, e.g. "s3Client"
// operationName: display name, e.g. "Create Object", "List Buckets"
globalThis.addConnectorOperationNode = async (buttonId, connectionName, operationName) => {
  await waitForGuest();

  if (buttonId) {
    await clickAddButton(buttonId);
    await window.waitForTimeout(500);
  }

  await clickInNodePanel(connectionName);
  await window.waitForTimeout(500);

  await clickInNodePanel(operationName);
  await window.waitForTimeout(1000);
};
