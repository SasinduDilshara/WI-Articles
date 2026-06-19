// Generic configurable-variable helpers.

globalThis.addConfigurableVariable = async ({name, type = 'string', required = true} = {}) => {
  if (!name) throw new Error('addConfigurableVariable: name is required');
  if (await configVariableVisible(name)) return;

  for (let attempt = 0; attempt < 3; attempt++) {
    await openConfigForm();
    await vscodeFillByName('variable', name);
    if (await hasConfigTypeField()) await vscodeFillByName('type', type);

    if (required === false) {
      const checked = guestFrame.locator('vscode-checkbox[aria-checked="true"]').first();
      if (await checked.isVisible().catch(() => false)) await guestClick(checked);
    }

    await blurConfigFields();
    await clickVisibleSaveButton();
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await configVariableVisible(name)) {
        await window.waitForTimeout(2000);
        return;
      }
      await window.waitForTimeout(300);
    }
    await closeConfigFormIfOpen();
  }
  throw new Error(`configurable variable was not saved: ${name}`);
};

globalThis.addConfigVariable = async (name, type) => addConfigurableVariable({name, type});

globalThis.addConfigurableVariables = async (variables) => {
  for (const v of variables) {
    if (typeof v === 'string') await addConfigurableVariable({name: v});
    else await addConfigurableVariable(v);
  }
};

const configVariableVisible = async (name) => (await snapshot().catch(() => '')).includes(`${name}:`);

const hasConfigTypeField = async () => await guestFrame.evaluate(() =>
  !!document.querySelector('vscode-text-area[name="type"], vscode-text-field[name="type"]'));

const configFormOpen = async () => await guestFrame.evaluate(() => {
  const el = document.querySelector('vscode-text-field[name="variable"]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
});

const openConfigForm = async () => {
  if (await configFormOpen()) return;
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Add Config'}).first());
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !(await configFormOpen())) await window.waitForTimeout(250);
  if (!(await configFormOpen())) throw new Error('Add Config form did not open');
};

const blurConfigFields = async () => {
  await guestFrame.evaluate(() => {
    for (const el of document.querySelectorAll('vscode-text-field[name="variable"], vscode-text-area[name="type"], vscode-text-field[name="type"]')) {
      const inner = el.shadowRoot?.querySelector('input,textarea');
      inner?.focus();
      inner?.blur();
      for (const evt of ['input', 'change', 'focusout', 'blur']) {
        inner?.dispatchEvent(new Event(evt, {bubbles: true}));
        el.dispatchEvent(new Event(evt, {bubbles: true}));
      }
    }
  });
  await window.waitForTimeout(500);
};

const clickVisibleSaveButton = async () => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const state = await guestFrame.evaluate(() => {
      const btn = [...document.querySelectorAll('vscode-button')]
        .find(b => b.textContent?.trim() === 'Save' && b.getBoundingClientRect().height > 0);
      if (!btn) return 'missing';
      if (btn.hasAttribute('disabled') || btn.classList.contains('disabled')) return 'disabled';
      btn.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
      return 'clicked';
    });
    if (state === 'clicked') return;
    await window.waitForTimeout(300);
  }
  throw new Error('Save button did not become enabled');
};

const closeConfigFormIfOpen = async () => {
  if (!(await configFormOpen())) return;
  await window.keyboard.press('Escape');
  await window.waitForTimeout(500);
};
