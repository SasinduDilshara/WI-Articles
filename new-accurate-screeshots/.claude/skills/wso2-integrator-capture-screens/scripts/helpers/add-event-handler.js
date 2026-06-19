// From an event-driven service view (CDC, Kafka, RabbitMQ, etc.),
// add an event handler and land in its flow editor.
//
// handlerName: display text, e.g. "onCreate", "onUpdate", "onMessage", "onError"
//
// Clicks "Add Handler", selects the handler type, saves the default config,
// and waits for the flow editor (Flow Sequence) to appear.
globalThis.addEventHandler = async (handlerName) => {
  await waitForGuest();
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Add Handler'}));
  await window.waitForTimeout(1000);

  // Handler names are <p> elements in a picker — JS click is reliable
  await guestFrame.getByText(handlerName, {exact: true}).first().evaluate(el => el.click());
  await window.waitForTimeout(2000);

  // Save the default handler config (caller can configure before calling if needed)
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save'}).last());
  await waitForText('Flow Sequence', 30000);
};
