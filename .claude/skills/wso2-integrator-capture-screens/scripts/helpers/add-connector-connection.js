// Add a connector connection (S3, SQS, etc.) via the node panel's "Add Connection" flow.
// Must be in flow editor with node panel open or openable.
//
// connectorName: display name in pre-built list, e.g. "S3", "Kafka Producer"
// connectionName: name for the connection, e.g. "s3Client"
// recordFields: {fieldName: value} for Record mode config, e.g. {accessKeyId: '"key"', region: '"ap-southeast-1"'}
//   Values must be Ballerina expressions (strings need quotes).
globalThis.addConnectorConnection = async (connectorName, connectionName, recordFields = {}) => {
  await waitForGuest()

  // Open "Add Connection" — first time shows text, subsequent shows + icon
  const textBtn = guestFrame.getByText('Add Connection', {exact: true}).first()
  if (await textBtn.isVisible().catch(() => false)) {
    await guestClick(textBtn)
  } else {
    await ensureNodePanelOpen()
    await guestFrame.locator('.codicon-add').first().evaluate(el => el.closest('vscode-button').click())
  }
  await window.waitForTimeout(1000)

  // Wait for connector list
  await waitForText('Pre-built Connectors', 20000)

  // Search for the connector
  const searchBox = guestFrame.getByPlaceholder('Search connectors...').first()
  await guestFill(searchBox, connectorName)
  await window.waitForTimeout(500)

  // Click the connector card — find <p> with exact name, click its parent card
  await guestFrame.evaluate((name) => {
    const ps = [...document.querySelectorAll('p')]
    const match = ps.find(p => p.textContent.trim() === name)
    if (!match) throw new Error(`Connector "${name}" not found`)
    match.closest('[class*="card"], [class*="item"], div')?.click() || match.click()
  }, connectorName)

  // Wait for connector to load
  await waitForText('Connection Name', 30000)

  // If Config field exists with Record mode, fill it
  if (Object.keys(recordFields).length > 0) {
    // Click the config textarea/placeholder to open Record Configuration panel
    const hasCm = await guestFrame.evaluate(() => document.querySelectorAll('.cm-content').length)
    if (hasCm > 0) {
      // CM already visible — just click it to open record panel
      await guestFrame.locator('.cm-content').first().click()
    } else {
      // Click the textarea placeholder
      await guestFrame.locator('textarea').first().click()
    }
    await window.waitForTimeout(2000)
    await waitForText('Record Configuration', 10000)

    // Check the required field checkboxes
    const fieldNames = Object.keys(recordFields)
    await checkRecordFields(fieldNames)
    await window.waitForTimeout(1000)

    // Fill the CM editor with the record value
    const recordValue = '{\n' + fieldNames.map(f => `    ${f}: ${recordFields[f]}`).join(',\n') + '\n}'
    await cmFill(recordValue, 0)
    await window.waitForTimeout(300)

    // Close helper panel if it opened
    await guestFrame.evaluate(() => document.querySelector('[aria-label="Close Helper Panel"]')?.click())
    await window.waitForTimeout(300)

    // Minimize record config panel
    await guestFrame.evaluate(() => {
      const icon = document.querySelector('.fw-bi-minimize-modal')
      if (icon) icon.closest('button')?.click() || icon.click()
    })
    await window.waitForTimeout(500)
  }

  // Fill connection name
  const nameField = guestFrame.getByRole('textbox', {name: /Connection Name/i})
  await guestFill(nameField, connectionName)
  await window.waitForTimeout(300)

  // Save connection
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save Connection'}))
  // Wait for save to complete
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const visible = await guestFrame.locator('vscode-button').filter({hasText: 'Save Connection'}).isVisible().catch(() => false)
    if (!visible) break
    await window.waitForTimeout(300)
  }
  await window.waitForTimeout(500)

}

// Check checkboxes in the Record Configuration panel by field name.
// Uses guestClick — the only reliable way to toggle vscode-checkbox.
globalThis.checkRecordFields = async (fieldNames) => {
  for (const name of fieldNames) {
    // Find the unchecked checkbox whose sibling <p> matches the field name
    const idx = await guestFrame.evaluate((name) => {
      const unchecked = [...document.querySelectorAll('vscode-checkbox[aria-checked="false"]')]
      return unchecked.findIndex(cb => {
        const text = cb.parentElement?.textContent || ''
        return new RegExp('\\b' + name + '\\b').test(text)
      })
    }, name)
    if (idx === -1) continue // already checked or not found
    await guestClick(guestFrame.locator('vscode-checkbox[aria-checked="false"]').nth(idx))
    await window.waitForTimeout(300)
  }
}
