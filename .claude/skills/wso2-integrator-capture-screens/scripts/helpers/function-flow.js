// Generic helpers for editing function/tool flow bodies.

globalThis.openFunctionFlow = async (functionName) => {
  await closeSidePanel().catch(() => {});
  const current = await snapshot().catch(() => '');
  if (!(current.includes(` ${functionName} `) && current.includes('Start') && !current.includes('Edit Agent Tool'))) {
    const treeItem = window.getByRole('treeitem', {name: new RegExp(`(^|\\s)${functionName}(\\s|$)`)}).first();
    if (await treeItem.isVisible().catch(() => false)) {
      await treeItem.dblclick();
    } else {
      const flowItem = await guestFrame.evaluate((functionName) => [...document.querySelectorAll('foreignObject, div')]
        .filter(el => (el.textContent || '').trim() === `Click to view ${functionName}` && el.getBoundingClientRect().height > 0)
        .map(el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; })[0], functionName).catch(() => null);
      if (flowItem) {
        const off = await window.evaluate(() => { const f = [...document.querySelectorAll('iframe')].find(f => f.getBoundingClientRect().width > 500); const r = f.getBoundingClientRect(); return {x: r.x, y: r.y}; });
        await window.mouse.dblclick(off.x + flowItem.x + flowItem.w / 2, off.y + flowItem.y + flowItem.h / 2);
      } else {
        const item = await window.evaluate((functionName) => [...document.querySelectorAll('*')]
          .filter(el => el.textContent?.trim() === functionName && el.getBoundingClientRect().height > 0)
          .map(el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; })[0], functionName);
        if (!item) throw new Error(`function not found in tree: ${functionName}`);
        await window.mouse.dblclick(item.x + item.w / 2, item.y + item.h / 2);
      }
    }
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const s = await snapshot().catch(() => '');
      if (s.includes(` ${functionName} `)) break;
      await window.waitForTimeout(500);
    }
    const afterOpen = await snapshot().catch(() => '');
    if (!afterOpen.includes(` ${functionName} `)) throw new Error(`openFunctionFlow("${functionName}") did not open function flow`);
  }

  const s = await snapshot().catch(() => '');
  if (s.includes('Edit Agent Tool') || s.includes('Function Configuration')) {
    const save = guestFrame.locator('vscode-button').filter({hasText: 'Save'}).first();
    if (await save.isVisible().catch(() => false)) {
      await clickVscodeButton('Save');
      await window.waitForTimeout(1000);
    }
    if ((await snapshot().catch(() => '')).includes('Edit Agent Tool')) await navigateBack();
    await window.waitForTimeout(1000);
  }
};

globalThis.visibleAddButtons = async () => guestFrame.evaluate(() => [...document.querySelectorAll('[data-testid]')]
  .map(el => ({id: el.getAttribute('data-testid'), r: (() => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; })()}))
  .filter(e => e.id?.includes('add-button') && e.r.w > 0 && e.r.h > 0));

globalThis.hoverFlowPoint = async (x, y) => {
  const off = await window.evaluate(() => {
    const f = [...document.querySelectorAll('iframe')].find(f => f.getBoundingClientRect().width > 500);
    const r = f.getBoundingClientRect();
    return {x: r.x, y: r.y};
  });
  await window.mouse.move(off.x + x, off.y + y);
  await window.waitForTimeout(900);
};

globalThis.lastVisibleAddButton = async () => {
  const buttons = await visibleAddButtons();
  return buttons.sort((a, b) => b.r.y - a.r.y)[0]?.id;
};

globalThis.openNodePanelAfterLastNode = async () => {
  await closeSidePanel().catch(() => {});
  await window.waitForTimeout(300);
  const clickVisibleBottomButton = async () => {
    const id = await lastVisibleAddButton();
    if (!id) return null;
    await clickAddButton(id);
    await waitForText('Statement', 15000);
    return id;
  };
  for (let pass = 0; pass < 2; pass++) {
    const linkCenters = await guestFrame.evaluate(() => [...document.querySelectorAll('[data-testid^="diagram-link-"]')]
      .map(el => { const r = el.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height}; })
      .filter(p => p.x > 0 && p.y > 0 && p.h > 0)
      .sort((a, b) => b.y - a.y));
    const points = [...linkCenters, ...[426, 546, 656].flatMap(x => [360, 470, 590, 710].map(y => ({x, y})))]
      .filter(p => p.y < 630);
    for (const p of points) {
      await hoverFlowPoint(p.x, p.y);
      const id = await clickVisibleBottomButton();
      if (id) return id;
    }
    await window.waitForTimeout(500);
  }
  throw new Error('no visible add-button found');
};

globalThis.openNodeFormAfterLastNode = async (nodeText) => {
  const panelOpen = (await snapshot(/Statement|Declare Variable|Return/).catch(() => '')).includes('Statement');
  if (!panelOpen) await openNodePanelAfterLastNode();
  await clickInNodePanel(nodeText);
  await window.waitForTimeout(1000);
};

globalThis.setDeclareVariableType = async (type) => {
  const exists = await guestFrame.evaluate(() => !!document.querySelector('vscode-text-area[name="type"]'));
  if (!exists) return false;
  await vscodeFill('vscode-text-area[name="type"]', type);
  return true;
};

globalThis.addDeclareVariableNode = async ({name, expr, type} = {}) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    await openNodeFormAfterLastNode('Declare Variable');
    if (name) await fillVariableName(name);
    if (type) await setDeclareVariableType(type);
    if (expr) await fillExpressionAt(expr, 0);
    await saveAndCloseNodeForm();
    await window.waitForTimeout(1200);
    const s = await snapshot().catch(() => '');
    if (!name || s.includes(name)) return;
  }
  throw new Error(`declare variable node was not saved: ${name}`);
};

globalThis.addReturnNode = async (expr) => {
  await openNodeFormAfterLastNode('Return');
  await fillExpressionAt(expr, 0);
  await saveAndCloseNodeForm();
  await window.waitForTimeout(1800);
};

globalThis.setFunctionReturnType = async (functionName, returnType) => {
  await openFunctionFlow(functionName);
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Configure'}));
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const exists = await guestFrame.evaluate(() => !!document.querySelector('vscode-text-area[name="type"], vscode-text-field[name="type"]'));
    if (exists) break;
    await window.waitForTimeout(300);
  }
  await vscodeFillByName('type', returnType);
  await clickVscodeButton('Save');
  await window.waitForTimeout(1500);
  if ((await snapshot().catch(() => '')).includes('Function Configuration')) {
    await navigateBack();
    await window.waitForTimeout(1000);
  }
};

globalThis.selectStandardLibraryFunction = async (functionName) => {
  const clickRow = async (text) => {
    const target = await guestFrame.evaluate((text) => {
      const rows = [...document.querySelectorAll('div, span, p')].map(el => {
        const r = el.getBoundingClientRect();
        return {text: (el.textContent || '').trim(), x: r.x, y: r.y, w: r.width, h: r.height};
      }).filter(r => r.w > 0 && r.h > 0 && (r.text === text || r.text.startsWith(text)))
        .sort((a, b) => (a.text.length - b.text.length) || ((b.w * b.h) - (a.w * a.h)));
      const row = rows[0];
      return row ? {x: row.x + row.w / 2, y: row.y + row.h / 2} : null;
    }, text);
    if (!target) throw new Error(`function picker row not found: ${text}`);
    const off = await window.evaluate(() => { const f = [...document.querySelectorAll('iframe')].find(f => f.getBoundingClientRect().width > 500); const r = f.getBoundingClientRect(); return {x: r.x, y: r.y}; });
    await window.mouse.click(off.x + target.x, off.y + target.y);
    await window.waitForTimeout(1000);
  };

  const hasFunctionVisible = async () => await guestFrame.evaluate((functionName) =>
    [...document.querySelectorAll('*')].some(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (el.textContent || '').trim() === functionName;
    }), functionName);
  if (!(await hasFunctionVisible())) await clickRow('Standard Library').catch(() => {});
  await guestFrame.evaluate((functionName) => {
    const field = [...document.querySelectorAll('vscode-text-field')]
      .find(f => (f.getAttribute('placeholder') || f.shadowRoot?.querySelector('input')?.placeholder || '').includes('Search library'));
    const input = field?.shadowRoot?.querySelector('input');
    if (!field || !input) return;
    field.value = functionName;
    input.value = functionName;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    field.dispatchEvent(new Event('input', {bubbles: true}));
  }, functionName);
  await waitForText(functionName, 30000);
  if (!(await hasFunctionVisible())) await clickRow('Standard Library').catch(() => {});
  await window.waitForTimeout(1500);
  const deadline = Date.now() + 15000;
  while (true) {
    try {
      await clickRow(functionName);
      break;
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await clickRow('Standard Library').catch(() => {});
      await window.waitForTimeout(1000);
    }
  }
};

globalThis.setNodeExpressionByText = async ({nodeText, expr}) => {
  await closeSidePanel().catch(() => {});
  const node = await guestFrame.evaluate((nodeText) => [...document.querySelectorAll('div')]
    .filter(el => (el.textContent || '').includes(nodeText) && el.getBoundingClientRect().width > 100)
    .map(el => { const r = el.getBoundingClientRect(); return {x: r.x + r.width - 20, y: r.y + r.height / 2}; })[0], nodeText);
  if (!node) throw new Error(`node not found: ${nodeText}`);
  const off = await window.evaluate(() => { const f = [...document.querySelectorAll('iframe')].find(f => f.getBoundingClientRect().width > 500); const r = f.getBoundingClientRect(); return {x: r.x, y: r.y}; });
  await window.mouse.click(off.x + node.x, off.y + node.y);
  await window.waitForTimeout(600);
  await guestFrame.getByText('Edit', {exact: true}).last().evaluate(el => el.click());
  await window.waitForTimeout(1000);
  await fillExpressionAt(expr, 0);
  await clickSaveButton();
  await window.waitForTimeout(1500);
  await closeSidePanel().catch(() => {});
};
