// Generic AI component helpers usable from AI-agent and flow views.

globalThis.openNodePanelFromTopLink = async () => {
  await waitForGuest();
  const off = await window.evaluate(() => {
    const f = [...document.querySelectorAll('iframe')].find(f => f.getBoundingClientRect().width > 500);
    const r = f.getBoundingClientRect();
    return {x: r.x, y: r.y};
  });
  const points = await guestFrame.evaluate(() => [...document.querySelectorAll('[data-testid^="diagram-link-"]')]
    .map(el => { const r = el.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })
    .filter(p => p.x > 0 && p.y > 0)
    .sort((a, b) => a.y - b.y));
  for (const p of points) {
    await window.mouse.move(off.x + p.x, off.y + p.y);
    await window.waitForTimeout(500);
    await window.waitForTimeout(300);
    const addId = await guestFrame.evaluate(() => [...document.querySelectorAll('[data-testid^="link-add-button-"]')]
      .map(el => { const r = el.getBoundingClientRect(); return {id: el.getAttribute('data-testid'), r: {x: r.x, y: r.y, w: r.width, h: r.height}}; })
      .filter(e => e.r.w > 0 && e.r.h > 0)
      .sort((a, b) => a.r.y - b.r.y)[0]?.id);
    if (addId) {
      await guestClick(guestFrame.locator(`[data-testid="${addId}"]`));
      await window.waitForTimeout(1000);
      await waitForText('Statement', 15000);
      return;
    }
  }
  throw new Error('top link add button not visible');
};

globalThis.openNodePanelCategory = async (...labels) => {
  for (const label of labels) {
    const deadline = Date.now() + 5000;
    let clicked = false;
    while (Date.now() < deadline && !clicked) {
      const loc = guestFrame.getByText(label, {exact: true}).last();
      if (await loc.isVisible().catch(() => false)) {
        await guestClick(loc);
        clicked = true;
        break;
      }
      await window.waitForTimeout(250);
    }
    if (!clicked) throw new Error(`node panel item not found: ${label}`);
    await window.waitForTimeout(700);
  }
};

globalThis.openAiComponentCatalog = async (componentPluralTitle) => {
  const singular = componentPluralTitle.replace(/s$/, '');
  const hasVisibleText = async (text) => await guestFrame.evaluate((text) =>
    [...document.querySelectorAll('*')].some(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && el.textContent?.trim() === text;
    }), text);

  if (!(await hasVisibleText(componentPluralTitle))) {
    if (!(await hasVisibleText(singular))) await openNodePanelCategory('AI');
    if (!(await hasVisibleText(componentPluralTitle))) await openNodePanelCategory(singular);
  }

  const opened = await guestFrame.evaluate((title) => {
    const heading = [...document.querySelectorAll('*')].find(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && el.children.length === 0 && el.textContent?.trim() === title;
    });
    const plus = heading?.parentElement?.querySelector('[aria-label="Icon Button"]');
    if (!plus) return !!heading;
    plus.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    return true;
  }, componentPluralTitle);
  if (!opened) throw new Error(`AI component catalog not opened: ${componentPluralTitle}`);
  await window.waitForTimeout(2000);
};

globalThis.addOpenAiModelProvider = async ({apiKeyExpr, modelExpr, retryExpr, name} = {}) => {
  await openAiComponentCatalog('Model Providers');
  await waitForText('OpenAI Model Provider', 30000);
  await clickCatalogCard({title: 'OpenAI Model Provider'});
  await waitForCatalogLoad();
  await waitForText('API Key', 30000);

  if (name) await guestFill(guestFrame.getByRole('textbox', {name: /Model Provider Name/i}), name);
  await fillExpressionAt(apiKeyExpr, 0);
  await switchLabeledFieldToExpression('Model Type');
  await fillExpressionAt(modelExpr, 1);

  if (retryExpr) {
    await guestFrame.getByText('Expand', {exact: true}).evaluate(el => el.click());
    await window.waitForTimeout(700);
    await switchLabeledFieldToExpression('Retry Configuration');
    const cms = await guestFrame.evaluate(() => [...document.querySelectorAll('.cm-content')].map((cm, i) => ({i, text: cm.textContent?.trim()})));
    const idx = cms.find(c => c.text === '{}')?.i ?? cms.length - 1;
    await fillExpressionAt(retryExpr, idx);
  }

  await saveAndCloseNodeForm();
};

globalThis.configureAgentModelProvider = async (providerName) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await closeSidePanel().catch(() => {});
    await window.waitForTimeout(2000 + attempt * 3000);
    await openAgentModelProviderConfig();
    if (await selectModelProviderOption(providerName)) {
      await clickVscodeButton('Save');
      await window.waitForTimeout(1500);
      return;
    }
  }
  throw new Error(`model provider option not found: ${providerName}`);
};

const openAgentModelProviderConfig = async () => {
  const target = await guestFrame.evaluate(() => {
    const canvas = [...document.querySelectorAll('svg')].map(el => {
      const r = el.getBoundingClientRect();
      return {x: r.x, y: r.y, w: r.width, h: r.height, text: el.textContent || ''};
    }).find(e => e.w > 100 && e.h > 100 && e.text.includes('Configure Model Provider'));
    if (!canvas) return null;
    const icon = [...document.querySelectorAll('foreignObject')].map(el => {
      const r = el.getBoundingClientRect();
      return {x: r.x, y: r.y, w: r.width, h: r.height};
    }).find(e => e.w >= 35 && e.h >= 35 && e.x > canvas.x + 50 && e.x < canvas.x + 160 && e.y > canvas.y && e.y < canvas.y + 80);
    return icon ? {x: icon.x + icon.w / 2, y: icon.y + icon.h / 2} : {x: canvas.x + 100, y: canvas.y + 34};
  });
  if (!target) throw new Error('agent model-provider icon not found');

  const off = await window.evaluate(() => {
    const f = [...document.querySelectorAll('iframe')].find(f => f.getBoundingClientRect().width > 500);
    const r = f.getBoundingClientRect();
    return {x: r.x, y: r.y};
  });
  await window.mouse.click(off.x + target.x, off.y + target.y);
  await waitForText('Configure Model Provider', 15000);
};

const selectModelProviderOption = async (providerName) => {
  await guestFrame.locator('[role="combobox"]').first().click();
  return await guestFrame.evaluate(async (providerName) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 30; i++) {
      const option = [...document.querySelectorAll('[role="option"], div, span')]
        .find(el => el.getBoundingClientRect().height > 0 && el.textContent?.trim() === providerName);
      if (option) {
        option.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
        return true;
      }
      await sleep(500);
    }
    return false;
  }, providerName);
};

globalThis.addVectorKnowledgeBase = async ({
  vectorStoreTitle,
  vectorStorePackage,
  vectorStoreExpressions,
  embeddingProviderExpr,
  knowledgeBaseName,
} = {}) => {
  await openAiComponentCatalog('Knowledge Bases');
  const hasAdd = await guestFrame.getByText('Add Knowledge Base', {exact: true}).isVisible().catch(() => false);
  if (hasAdd) {
    await guestClick(guestFrame.getByText('Add Knowledge Base', {exact: true}).last());
    await window.waitForTimeout(1000);
  }
  await waitForText('Vector Knowledge Base', 15000);
  await guestClick(guestFrame.getByText('Vector Knowledge Base', {exact: true}).first());
  await waitForText('Vector Store', 15000);

  await guestFrame.getByText('Create New Vector Store', {exact: false}).first().evaluate(el => el.click());
  await waitForText(vectorStoreTitle, 30000);
  await clickCatalogCard({title: vectorStoreTitle, subtitle: vectorStorePackage});
  await waitForCatalogLoad();

  for (const [i, expr] of vectorStoreExpressions.entries()) await fillExpressionAt(expr, i);
  await clickVscodeButton('Save');
  await window.waitForTimeout(2000);

  await switchLabeledFieldToExpression('Embedding Model');
  await fillExpressionAt(embeddingProviderExpr, 0);
  if (knowledgeBaseName) await vscodeFill('vscode-text-field[name="variable"]', knowledgeBaseName);
  await clickVscodeButton('Save');
  await window.waitForTimeout(2000);
};
