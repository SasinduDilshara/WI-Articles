// Fill a vscode-text-field or vscode-text-area via its shadow DOM.
// selector: CSS selector string, or a DOM element reference
// Uses native value setter + input/change events (React-compatible).
globalThis.vscodeFill = async (selector, text) => {
  await guestFrame.evaluate(({selector, text}) => {
    const el = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;
    if (!el) throw new Error(`vscodeFill: element not found: ${selector}`);
    const inner = el.shadowRoot?.querySelector('input') ?? el.shadowRoot?.querySelector('textarea');
    if (!inner) throw new Error(`vscodeFill: no shadow input/textarea in ${el.tagName}`);
    inner.removeAttribute('readonly');
    const proto = inner.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(inner, text);
    inner.dispatchEvent(new Event('input', {bubbles: true}));
    inner.dispatchEvent(new Event('change', {bubbles: true}));
  }, {selector, text});
  await window.waitForTimeout(150);
};

// Fill a vscode-text-field or vscode-text-area by its [name] attribute.
// nth selects among matching fields. Also sets current-value, which WSO2 forms often require.
globalThis.vscodeFillByName = async (nameAttr, text, nth = 0) => {
  await guestFrame.evaluate(({nameAttr, text, nth}) => {
    const els = document.querySelectorAll(`vscode-text-field[name="${nameAttr}"], vscode-text-area[name="${nameAttr}"]`);
    const el = els[nth];
    if (!el) throw new Error(`vscodeFillByName: [name="${nameAttr}"][${nth}] not found (${els.length} total)`);
    el.setAttribute('current-value', text);
    el.value = text;
    const inner = el.shadowRoot?.querySelector('input') ?? el.shadowRoot?.querySelector('textarea');
    if (!inner) throw new Error(`vscodeFillByName: no shadow input/textarea`);
    inner.value = text;
    for (const evt of ['input', 'change', 'keyup']) {
      inner.dispatchEvent(new Event(evt, {bubbles: true}));
      el.dispatchEvent(new Event(evt, {bubbles: true}));
    }
  }, {nameAttr, text, nth});
  await window.waitForTimeout(200);
};

// Fill the Name field in a Declare/Update Variable form (first vscode-text-field).
globalThis.fillVariableName = async (name) => {
  await vscodeFill('vscode-text-field', name);
};
