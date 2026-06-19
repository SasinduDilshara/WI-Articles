// Create an AI Chat Agent artifact from the integration overview.
// Returns to the agent flow view.
//
// agentName: e.g. "hrAgent"
globalThis.createAiChatAgent = async (agentName) => {
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Add Artifact'}));
  await waitForText('AI Chat Agent', 10000);
  await guestClick(guestFrame.getByText('AI Chat Agent', {exact: true}).first());
  await waitForText('Create AI Chat Agent', 10000);

  await guestFill(guestFrame.getByRole('textbox', {name: /Name/i}), agentName);
  await window.waitForTimeout(500);
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Create'}));

  // Wait for creation (pulls modules — can take 60s+)
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const s = await snapshot();
    if (s.includes('Creating...') || s.includes('Pulling')) {
      await window.waitForTimeout(2000);
      continue;
    }
    break;
  }
  await waitForText('AI Agent', 15000);
};

// Configure the agent node: role, instructions, maxIter.
// Must be in the agent flow view.
//
// opts.role: string — role prompt text
// opts.instructions: string — instructions prompt text
// opts.maxIter: number — maximum iterations (optional)
globalThis.configureAgent = async (opts) => {
  // Open agent config panel
  await guestFrame.getByText('AI Agent', {exact: true}).first().evaluate(el => el.click());
  await window.waitForTimeout(1000);
  await waitForText('Role');

  if (opts.role) {
    await cmFill(opts.role, 0);
    await window.waitForTimeout(300);
    await closeHelperPanel();
  }

  if (opts.instructions) {
    await cmFill(opts.instructions, 1);
    await window.waitForTimeout(300);
    await closeHelperPanel();
  }

  if (opts.maxIter) {
    // Expand Advanced Configurations
    await guestFrame.getByText('Expand', {exact: true}).evaluate(el => el.click());
    await window.waitForTimeout(1000);
    // Maximum Iterations is CM index 3 after expand
    await cmFill(String(opts.maxIter), 3);
    await window.waitForTimeout(300);
    await closeHelperPanel();
  }

  await saveAndCloseNodeForm();
};

// Add Short Term Memory to the agent. Must be in agent flow view.
globalThis.addAgentMemory = async () => {
  const isOpen = async () => {
    const s = await snapshot(/Select Memory|Short Term Memory/).catch(() => '');
    return s.includes('Select Memory') || s.includes('Short Term Memory');
  };
  if (!(await isOpen())) await guestClick(guestFrame.getByText('Add Memory', {exact: true}).last());
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !(await isOpen())) await window.waitForTimeout(300);
  if (!(await isOpen())) throw new Error('Short Term Memory form did not open');
  await saveAndCloseNodeForm();
};

// Open the "Add New Tool" panel and select "Create Custom Tool".
// Must be in agent flow view. Lands on the tool creation form.
globalThis.openCreateToolForm = async () => {
  let target = null;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !target) {
    target = await guestFrame.evaluate(() => {
      const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const hasText = el => (el.textContent || '').trim() === 'Add New Tool / MCP Server';
      const text = [...document.querySelectorAll('foreignObject div')].find(d => visible(d) && hasText(d));
      const icon = [...document.querySelectorAll('svg')].find(s => visible(s) && hasText(s));
      const el = icon || text;
      if (!el) return null;
      el.scrollIntoView?.({block: 'center'});
      const r = el.getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    });
    if (!target) await window.waitForTimeout(500);
  }
  if (!target) throw new Error('Add New Tool / MCP Server not found');
  const off = await window.evaluate(() => {
    const f = [...document.querySelectorAll('iframe')].find(f => f.getBoundingClientRect().width > 500);
    const r = f.getBoundingClientRect();
    return {x: r.x, y: r.y};
  });
  await window.mouse.click(off.x + target.x, off.y + target.y);
  await window.waitForTimeout(2000);
  await waitForText('Create Custom Tool', 15000);
  await guestClick(guestFrame.getByText('Create Custom Tool', {exact: true}).first());
  await window.waitForTimeout(3000);
  await waitForText('Name', 15000);
};

// Create a custom agent tool. Must be in agent flow view.
// After creation, navigates back to the agent flow.
//
// opts.name: tool function name
// opts.description: tool description for the LLM
// opts.params: [{type, name, description}] — parameters (can be empty)
// opts.returnType: return type expression (e.g. "string|error")
// opts.returnDescription: description of return value
globalThis.createAgentTool = async (opts) => {
  await openCreateToolForm();

  await vscodeFillByName('functionName', opts.name);
  await vscodeFillByName('functionNameDescription', opts.description);

  for (const p of (opts.params || [])) {
    const parameterFormOpen = async () => await guestFrame.evaluate(() =>
      [...document.querySelectorAll('vscode-text-field[name="variable"]')]
        .some(el => el.getBoundingClientRect().height > 0));
    if (!(await parameterFormOpen())) {
      await guestClick(guestFrame.getByText('Add Parameter', {exact: true}).first());
      await waitForText('Name of the parameter', 10000);
    }

    await vscodeFillByName('type', p.type, 0);
    await vscodeFillByName('variable', p.name);
    if (p.description) await vscodeFillByName('parameterDescription', p.description);
    await clickExactVscodeButton('Add');

    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const s = await snapshot().catch(() => '');
      if (s.includes(`${p.type} ${p.name}`)) break;
      await window.waitForTimeout(300);
    }
  }

  await vscodeFillByName('type', opts.returnType, 0);
  if (opts.returnDescription) await vscodeFillByName('typeDescription', opts.returnDescription);

  await clickExactVscodeButton('Create');
  await window.waitForTimeout(5000);
  await waitForText('Agent Tool', 15000);

  // Navigate back to agent flow
  await navigateBack();
};

// Add a configurable variable from the Configurable Variables view.
// Must already be on the Configurable Variables page.
//
// name: variable name
// type: Ballerina type (e.g. "string")
globalThis.addConfigVariable = async (name, type) => {
  // Click Add Config if the form isn't already open
  const addBtn = guestFrame.locator('vscode-button').filter({hasText: 'Add Config'});
  if (await addBtn.isVisible().catch(() => false)) {
    await guestClick(addBtn.first());
    await window.waitForTimeout(1000);
  }

  await guestFill(guestFrame.getByRole('textbox', {name: /Variable Name/i}), name);
  await window.waitForTimeout(200);

  // Fill type textarea
  await guestFrame.evaluate(({type}) => {
    const tas = document.querySelectorAll('vscode-text-area');
    for (const ta of tas) {
      if (ta.getAttribute('arialabel')?.includes('Type') || ta.getAttribute('name') === 'type') {
        ta.setAttribute('current-value', type);
        const inner = ta.shadowRoot?.querySelector('textarea');
        if (inner) {
          inner.value = type;
          for (const evt of ['input', 'change']) {
            inner.dispatchEvent(new Event(evt, {bubbles: true}));
            ta.dispatchEvent(new Event(evt, {bubbles: true}));
          }
        }
        return;
      }
    }
  }, {type});
  await window.waitForTimeout(200);

  await clickVscodeButton('Save');
  await window.waitForTimeout(2000);
};

// Add a pre-built connector connection from the Artifacts > Connection page.
// Must be on the Artifacts page (or just clicked Connection from it).
//
// opts.connectorName: display name in connector list (e.g. "Gcalendar", "S3")
// opts.connectionName: name for the connection (e.g. "calendarClient")
// opts.configExpr: Ballerina expression for the Config field (Expression mode)
// opts.useExpressionMode: true to switch Config to Expression mode (default: false)
globalThis.addPrebuiltConnection = async (opts) => {
  // Search for connector
  await guestFill(guestFrame.getByPlaceholder('Search connectors...').first(), opts.connectorName);
  await window.waitForTimeout(1000);

  // Click the connector card
  await guestFrame.evaluate((name) => {
    const ps = [...document.querySelectorAll('p')];
    const match = ps.find(p => p.textContent.trim() === name);
    if (!match) throw new Error(`Connector "${name}" not found`);
    // Click 3 levels up from <p> to reach the card container
    match.parentElement?.parentElement?.parentElement?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true})) || match.click();
  }, opts.connectorName);
  await waitForText('Connection Name', 30000);

  // Fill connection name
  await guestFill(guestFrame.getByRole('textbox', {name: /Connection Name/i}), opts.connectionName);
  await window.waitForTimeout(300);

  // Fill config expression if provided
  if (opts.configExpr) {
    if (opts.useExpressionMode) {
      await guestClick(guestFrame.getByText('Expression', {exact: true}).first());
      await window.waitForTimeout(1000);
    }
    const cmCount = await guestFrame.evaluate(() => document.querySelectorAll('.cm-content').length);
    if (cmCount > 0) {
      await cmFill(opts.configExpr, 0);
      await window.waitForTimeout(300);
      await closeHelperPanel();
    }
  }

  // Fill record fields if provided (for connectors like S3 that use Record mode)
  if (opts.recordFields) {
    const hasCm = await guestFrame.evaluate(() => document.querySelectorAll('.cm-content').length);
    if (hasCm > 0) {
      await guestFrame.locator('.cm-content').first().click();
    } else {
      await guestFrame.locator('textarea').first().click();
    }
    await window.waitForTimeout(2000);
    await waitForText('Record Configuration', 10000);
    await checkRecordFields(Object.keys(opts.recordFields));
    await window.waitForTimeout(1000);

    const recordValue = '{\n' + Object.entries(opts.recordFields).map(([f, v]) => `    ${f}: ${v}`).join(',\n') + '\n}';
    await cmFill(recordValue, 0);
    await window.waitForTimeout(300);
    await closeHelperPanel();

    // Minimize record config panel
    await guestFrame.evaluate(() => {
      const icon = document.querySelector('.fw-bi-minimize-modal');
      if (icon) icon.closest('button')?.click() || icon.click();
    });
    await window.waitForTimeout(500);
  }

  // Save connection
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save Connection'}));
  await waitForButtonGone('Save Connection');
  await window.waitForTimeout(2000);

  // Close lingering "Edit Connection" panel that often appears after save
  await guestFrame.evaluate(() => {
    const h2s = [...document.querySelectorAll('h2')];
    const edit = h2s.find(h => h.textContent.trim() === 'Edit Connection');
    if (!edit) return;
    let panel = edit.parentElement;
    while (panel && !panel.className?.includes('css-mwlwv7')) panel = panel.parentElement;
    if (!panel) return;
    const btns = [...panel.querySelectorAll('[aria-label="Icon Button"]')];
    if (btns[0]) btns[0].dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
  }).catch(() => {});
  await window.waitForTimeout(1000);
};
