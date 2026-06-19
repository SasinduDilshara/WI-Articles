// Generic catalog/artifact navigation helpers.

const visibleText = (text, exact = true) => {
  const trim = s => (s || '').trim();
  return [...document.querySelectorAll('*')].find(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const t = trim(el.textContent);
    return exact ? t === text : t.includes(text);
  });
};

globalThis.openAddArtifact = async () => {
  await waitForGuest();
  for (let i = 0; i < 3; i++) {
    await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Add Artifact'}).first());
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const s = await snapshot().catch(() => '');
      if (s.includes('Other Artifacts')) return;
      await window.waitForTimeout(300);
    }
  }
  throw new Error('openAddArtifact: Other Artifacts did not open');
};

globalThis.selectArtifactKind = async (name, {exact = true} = {}) => {
  await waitForGuest();

  // guestClick scrolls the item into view and sends a real mouse event, which
  // React card handlers need. DOM click is not reliable here.
  const locator = guestFrame.getByText(name, {exact}).last();
  if (!(await locator.isVisible().catch(() => false))) {
    await guestFrame.evaluate((name) => {
      const el = [...document.querySelectorAll('p, div, span')]
        .find(el => el.textContent?.trim() === name);
      el?.scrollIntoView({block: 'center'});
    }, name).catch(() => {});
    await window.waitForTimeout(300);
  }
  await guestClick(locator);
  await window.waitForTimeout(2000);
};

globalThis.openArtifactKind = async (name, opts = {}) => {
  await openAddArtifact();
  await selectArtifactKind(name, opts);
};

// Backwards-compatible name used by existing examples.
globalThis.addArtifact = async (name) => openArtifactKind(name, {exact: false});

globalThis.openConfigurationArtifact = async (integrationName) => {
  await navigateToOverview(integrationName);
  await openArtifactKind('Configuration');
  await window.waitForTimeout(1500);
};

globalThis.openConnectionCatalog = async (integrationName) => {
  await navigateToOverview(integrationName);
  await openArtifactKind('Connection');
  await waitForText('Search connectors', 15000);
};

globalThis.setCatalogSearch = async (placeholder, value) => {
  await guestFrame.evaluate(({placeholder, value}) => {
    const fields = [...document.querySelectorAll('vscode-text-field')];
    const field = fields.find(f => f.getAttribute('placeholder') === placeholder || f.shadowRoot?.querySelector('input')?.placeholder === placeholder);
    if (!field) throw new Error(`search field not found: ${placeholder}`);
    const input = field.shadowRoot?.querySelector('input');
    if (!input) throw new Error(`search input not found: ${placeholder}`);
    input.focus();
    input.value = value;
    field.value = value;
    field.setAttribute('current-value', value);
    for (const evt of ['input', 'change', 'keyup']) {
      input.dispatchEvent(new Event(evt, {bubbles: true}));
      field.dispatchEvent(new Event(evt, {bubbles: true}));
    }
  }, {placeholder, value});
  await window.waitForTimeout(1000);
};

globalThis.clickCatalogCard = async ({title, subtitle, exactTitle = true}) => {
  const clicked = await guestFrame.evaluate(({title, subtitle, exactTitle}) => {
    const trim = s => (s || '').trim();
    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const matchesTitle = el => {
      const t = trim(el.textContent);
      return exactTitle ? t === title : t.includes(title);
    };
    const titles = [...document.querySelectorAll('p, div, span')].filter(el => visible(el) && matchesTitle(el));

    for (const el of titles) {
      let cur = el;
      for (let i = 0; i < 8 && cur; i++, cur = cur.parentElement) {
        const text = cur.textContent || '';
        if (!subtitle || text.includes(subtitle)) {
          cur.click();
          return true;
        }
      }
    }

    // Connector cards sometimes keep title and package in adjacent <p>s under
    // a small card. If ancestry text is clipped by React wrappers, match a
    // nearby package paragraph and click the known card ancestor from title.
    if (subtitle) {
      const ps = [...document.querySelectorAll('p')].filter(visible);
      for (let i = 0; i < ps.length; i++) {
        if (!matchesTitle(ps[i])) continue;
        const nearby = ps.slice(i, i + 4).some(p => (p.textContent || '').includes(subtitle));
        if (!nearby) continue;
        const card = ps[i].parentElement?.parentElement?.parentElement || ps[i];
        card.click();
        return true;
      }
    }
    return false;
  }, {title, subtitle, exactTitle});
  if (!clicked) throw new Error(`catalog card not found: ${title}${subtitle ? ` / ${subtitle}` : ''}`);
  await window.waitForTimeout(2500);
};

globalThis.waitForCatalogLoad = async (timeout = 120000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const s = await snapshot().catch(() => '');
    if (s.includes('Pulling') || s.includes('Please wait') || s.includes('Loading')) {
      await window.waitForTimeout(2500);
      continue;
    }
    return;
  }
};
