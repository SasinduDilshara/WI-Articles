// Fill a node config form (connector operation, etc.) and save.
//
// fields: {label: value} where value is:
//   - string          → Text mode, fills the CM with the plain string
//   - {expr: string}  → Expression mode, toggles to Expression then fills the CM
//
// Example:
//   await fillNodeForm({
//     "Bucket Name": "wso2iqa",
//     "Object Name": {expr: 'string `uploads/${name}`'},
//     "File Content": {expr: 'payload'}
//   })
globalThis.fillNodeForm = async (fields) => {
  const labels = Object.keys(fields);

  // 1. Switch expression fields to Expression mode.
  for (const label of labels) {
    const val = fields[label];
    if (val && typeof val === 'object' && val.expr !== undefined) {
      await _toggleFieldToExpression(label);
    }
  }

  // 2. Fill all CMs by label (expression fields first, then text fields).
  const exprLabels = labels.filter(l => typeof fields[l] === 'object');
  const textLabels = labels.filter(l => typeof fields[l] === 'string');

  for (const label of [...exprLabels, ...textLabels]) {
    let cmIdx;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const cmMap = await _getCMMap([label]);
      cmIdx = cmMap[label];
      if (cmIdx !== undefined) break;
      await window.waitForTimeout(300);
    }
    if (cmIdx === undefined) throw new Error(`fillNodeForm: no CM editor found for "${label}"`);
    const value = typeof fields[label] === 'string' ? fields[label] : fields[label].expr;
    await cmFill(value, cmIdx);
    await window.waitForTimeout(100);
    await closeHelperPanel();
  }

  // 3. Save and close.
  await saveAndCloseNodeForm();
};

// --- internals ---

globalThis._toggleFieldToExpression = async (label) => {
  const idx = await guestFrame.evaluate((label) => {
    const allEls = [...document.querySelectorAll('*')];
    const labelEl = allEls.find(el =>
      el.childElementCount <= 2 &&
      el.textContent.trim().startsWith(label) &&
      el.textContent.includes('*')
    );
    if (!labelEl) return -1;
    const labelY = labelEl.getBoundingClientRect().y;
    const exprEls = allEls.filter(el =>
      el.textContent.trim() === 'Expression' && el.childElementCount === 0
    );
    for (let i = 0; i < exprEls.length; i++) {
      if (Math.abs(exprEls[i].getBoundingClientRect().y - labelY) < 60) return i;
    }
    return -1;
  }, label);
  if (idx >= 0) {
    await guestClick(guestFrame.getByText('Expression', {exact: true}).nth(idx));
    await window.waitForTimeout(300);
  }
};

globalThis._getCMMap = async (labels) => {
  return guestFrame.evaluate((labels) => {
    const cms = [...document.querySelectorAll('.cm-content')];
    const result = {};
    for (const label of labels) {
      const labelEl = [...document.querySelectorAll('*')].find(el =>
        el.childElementCount <= 2 &&
        el.textContent.trim().startsWith(label) &&
        el.textContent.includes('*')
      );
      if (!labelEl) continue;
      const labelY = labelEl.getBoundingClientRect().y;
      let bestIdx = -1, bestDist = Infinity;
      for (let i = 0; i < cms.length; i++) {
        const cmY = cms[i].getBoundingClientRect().y;
        const dist = cmY - labelY;
        if (dist > -10 && dist < 120 && dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) result[label] = bestIdx;
    }
    return result;
  }, labels);
};
