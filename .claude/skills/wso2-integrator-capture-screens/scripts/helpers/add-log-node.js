// Add a Log Info node in the flow editor.
//
// buttonId: add-button testid, or null to auto-pick:
//   - uses getLastDoBlockButtonId() if available (inside do{} block)
//   - falls back to firstEmptyNodeButton()
// msgExpr: Ballerina expression for the log message (Expression mode)
globalThis.addLogInfoNode = async (buttonId, msgExpr) => {
  await waitForGuest();

  if (!buttonId) {
    try { buttonId = await getLastDoBlockButtonId(); }
    catch { buttonId = await firstEmptyNodeButton(); }
  }
  await clickAddButton(buttonId);
  await waitForText('Statement', 10000);

  await clickInNodePanel('Logging');
  await window.waitForTimeout(500);
  await clickInNodePanel('Log Info');
  await window.waitForTimeout(1000);

  await guestClick(guestFrame.getByText('Expression', {exact: true}).first());
  await window.waitForTimeout(300);
  await cmFill(msgExpr, 0);
  await closeHelperPanel();
  await blurAllCM();
  await window.waitForTimeout(300);

  await saveAndCloseNodeForm();
};
