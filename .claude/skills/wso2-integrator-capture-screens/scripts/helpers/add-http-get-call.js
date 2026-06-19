// Add an HTTP GET call node to the flow.
//
// buttonId: add-button testid, or null if node panel already open
// connectionName: e.g. "weatherApi"
// pathExpr: Ballerina expression for the path (Expression mode)
//           e.g. 'string `/forecast?lat=${lat}`'
// resultVar: name for result variable (default: "var1")
// targetType: e.g. "json", "string" (default: "json")
globalThis.addHttpGetCall = async (buttonId, connectionName, pathExpr, resultVar = 'var1', targetType = 'json') => {
  await addConnectorOperationNode(buttonId, connectionName, 'Get');

  // Fill Result variable
  await guestFill(guestFrame.getByRole('textbox', {name: /Result/i}), resultVar);

  // Fill Target Type — last textbox, defaults to "undefined".
  // Keyboard input works; type picker click doesn't persist.
  const allTb = await guestFrame.getByRole('textbox').all();
  const targetTa = allTb[allTb.length - 1];
  await targetTa.click();
  await window.waitForTimeout(300);
  await window.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await window.waitForTimeout(100);
  await window.keyboard.type(targetType);
  await window.waitForTimeout(500);

  // Switch Path to Expression mode and fill
  await _toggleFieldToExpression('Path');
  await window.waitForTimeout(300);
  await cmFill(pathExpr, 0);
  await closeHelperPanel();

  await saveAndCloseNodeForm();
};
