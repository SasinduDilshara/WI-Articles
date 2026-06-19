// Generic connection/provider helpers for the Add Connection catalog.

globalThis.selectConnectorFromCatalog = async ({search, title, packageName}) => {
  const waitForCatalogText = async (text, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const s = await snapshot().catch(() => '');
      if (s.includes(text)) return;
      if (search && s.includes('Search connectors')) await setCatalogSearch('Search connectors...', search).catch(() => {});
      await window.waitForTimeout(1000);
    }
    throw new Error(`waitForText("${text}") timed out after ${timeout}ms`);
  };

  if (search) await setCatalogSearch('Search connectors...', search);
  if (title) await waitForCatalogText(title, 30000);
  if (packageName) await waitForCatalogText(packageName, 30000);

  if (packageName) {
    const card = guestFrame.locator('p').filter({hasText: packageName}).first();
    await guestClick(card);
    await window.waitForTimeout(2500);
  } else {
    await clickCatalogCard({title});
  }
  await waitForCatalogLoad();
};

globalThis.switchLabeledFieldToExpression = async (labelText) => {
  const clicked = await guestFrame.evaluate((labelText) => {
    const all = [...document.querySelectorAll('*')];
    let afterLabel = false;
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if ((el.textContent || '').includes(labelText) && el.children.length === 0) afterLabel = true;
      if (afterLabel && el.textContent?.trim() === 'Expression') {
        el.click();
        return true;
      }
    }
    return false;
  }, labelText);
  await window.waitForTimeout(clicked ? 700 : 100);
  return clicked;
};

globalThis.fillExpressionAt = async (expr, index = 0) => {
  await cmFill(expr, index);
  await window.waitForTimeout(200);
  await closeHelperPanel();
};

globalThis.saveConnectionForm = async () => {
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save Connection'}));
  await waitForButtonGone('Save Connection', 30000);
  await window.waitForTimeout(1000);
};

globalThis.addPrebuiltConnection = async ({
  search,
  connectorName,
  connectorTitle = connectorName,
  packageName,
  connectionName,
  configExpr,
  expressionFields = [],
  recordFields,
  useExpressionMode = false,
}) => {
  await selectConnectorFromCatalog({search: search || connectorTitle, title: connectorTitle, packageName});
  await waitForText('Connection Name', 30000);

  if (connectionName) {
    await guestFill(guestFrame.getByRole('textbox', {name: /Connection Name/i}), connectionName);
    await window.waitForTimeout(200);
  }

  if (configExpr) {
    if (useExpressionMode) await switchLabeledFieldToExpression('Config');
    await fillExpressionAt(configExpr, 0);
  }

  for (const [i, f] of expressionFields.entries()) {
    if (f.label) await switchLabeledFieldToExpression(f.label);
    await fillExpressionAt(f.expr, f.index ?? i);
  }

  if (recordFields) await fillRecordConfig(recordFields);

  await saveConnectionForm();
};

globalThis.fillRecordConfig = async (recordFields) => {
  const hasCm = await guestFrame.evaluate(() => document.querySelectorAll('.cm-content').length);
  if (hasCm > 0) await guestFrame.locator('.cm-content').first().click();
  else await guestFrame.locator('textarea').first().click();
  await window.waitForTimeout(1500);
  await waitForText('Record Configuration', 10000);
  await checkRecordFields(Object.keys(recordFields));
  const recordValue = '{\n' + Object.entries(recordFields).map(([f, v]) => `    ${f}: ${v}`).join(',\n') + '\n}';
  await fillExpressionAt(recordValue, 0);
  await guestFrame.evaluate(() => document.querySelector('.fw-bi-minimize-modal')?.closest('button')?.click()).catch(() => {});
  await window.waitForTimeout(500);
};

globalThis.addOpenAiEmbeddingProvider = async ({apiKeyExpr, modelExpr, name} = {}) => {
  await addPrebuiltConnection({
    search: 'Openai',
    connectorTitle: 'Openai EmbeddingProvider',
    connectionName: name,
    expressionFields: [
      {label: 'API Key', expr: apiKeyExpr},
      {label: 'Embedding Model Type', expr: modelExpr},
    ],
  });
};

globalThis.addCalendarConnection = async ({connectionName, configExpr} = {}) => {
  await addPrebuiltConnection({
    search: 'Calendar',
    connectorTitle: 'Calendar',
    packageName: 'ballerinax / googleapis.calendar',
    connectionName,
    configExpr,
    useExpressionMode: true,
  });
};
