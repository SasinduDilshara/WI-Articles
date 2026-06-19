// Visual highlight overlay + timestamp log for transcripts.
// Logs to /tmp/hightlight-log.jsonl. Name keeps the historical typo.

globalThis.__highlightState ??= { t0: 0, log: [], file: '/tmp/hightlight-log.jsonl' };

globalThis.highlightInit = () => {
  globalThis.__highlightState.t0 = Date.now();
  globalThis.__highlightState.log = [];
  try { fs.writeFileSync(globalThis.__highlightState.file, ''); } catch {}
};

globalThis.highlighted = async (target, opts = {}) => {
  if (!globalThis.__highlightState.t0) globalThis.highlightInit();
  const rect = await globalThis.__highlightRect(target);
  await globalThis.__drawHighlight(rect, opts);
  globalThis.__logHighlight({ action: 'highlight', ...rect });
  return rect;
};

globalThis.resetHighlight = async () => {
  if (!globalThis.__highlightState.t0) globalThis.highlightInit();
  await globalThis.__clearHighlight();
  globalThis.__logHighlight({ action: 'reset' });
};

globalThis.highlightDump = () => JSON.parse(JSON.stringify(globalThis.__highlightState.log));

// Convenient aliases, including common misspellings used in notes/transcripts.
globalThis.highlight = globalThis.highlighted;
globalThis.hightlted = globalThis.highlighted;
globalThis.hightlighted = globalThis.highlighted;
globalThis.resetHightlith = globalThis.resetHighlight;
globalThis.resetHightlight = globalThis.resetHighlight;

globalThis.__highlightRect = async (target) => {
  if (!target) throw new Error('highlighted(target): target is required');

  if (typeof target.scrollIntoViewIfNeeded === 'function') {
    await target.scrollIntoViewIfNeeded().catch(() => {});
  }

  if (typeof target.elementHandle === 'function') {
    const handle = await target.elementHandle();
    if (!handle) throw new Error('highlighted(target): target has no visible element');
    return await globalThis.__highlightHandleRect(handle);
  }

  if (typeof target.ownerFrame === 'function' && typeof target.evaluate === 'function') {
    return await globalThis.__highlightHandleRect(target);
  }

  if (typeof target.evaluate === 'function') {
    const box = await target.evaluate(el => {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    return globalThis.__normalizeRect(box);
  }

  if (typeof target.boundingBox === 'function') {
    const box = await target.boundingBox();
    if (!box) throw new Error('highlighted(target): target has no visible bounding box');
    return globalThis.__normalizeRect(box);
  }

  throw new Error('highlighted(target): expected a Playwright locator or element handle');
};

globalThis.__highlightHandleRect = async (handle) => {
  const box = await handle.evaluate(el => {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const off = await globalThis.__frameOffset(await handle.ownerFrame());
  return globalThis.__normalizeRect({ ...box, x: box.x + off.x, y: box.y + off.y });
};

globalThis.__frameOffset = async (frame) => {
  let x = 0, y = 0, f = frame;
  while (f?.parentFrame()) {
    const parent = f.parentFrame(), url = f.url();
    const off = await parent.evaluate(url => {
      for (const fr of document.querySelectorAll('iframe')) {
        try {
          if (fr.src === url || fr.contentWindow?.location?.href === url) {
            const r = fr.getBoundingClientRect();
            return { x: r.x, y: r.y };
          }
        } catch {}
      }
      const fr = document.querySelector('iframe');
      if (!fr) return { x: 0, y: 0 };
      const r = fr.getBoundingClientRect();
      return { x: r.x, y: r.y };
    }, url);
    x += off.x; y += off.y; f = parent;
  }
  return { x, y };
};

globalThis.__drawHighlight = async (rect, opts) => {
  await window.evaluate(({ rect, opts }) => {
    const id = '__wso2i_demo_highlight';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      document.documentElement.appendChild(el);
    }
    const pad = opts.pad ?? 6;
    Object.assign(el.style, {
      position: 'fixed',
      left: `${rect.x - pad}px`,
      top: `${rect.y - pad}px`,
      width: `${rect.width + pad * 2}px`,
      height: `${rect.height + pad * 2}px`,
      boxSizing: 'border-box',
      border: `${opts.borderWidth ?? 4}px solid ${opts.color ?? '#ffcc00'}`,
      borderRadius: `${opts.radius ?? 8}px`,
      boxShadow: opts.shadow ?? '0 0 0 9999px rgba(0,0,0,0.08), 0 0 18px rgba(255,204,0,0.9)',
      background: 'transparent',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transition: 'left 120ms ease, top 120ms ease, width 120ms ease, height 120ms ease',
    });
  }, { rect, opts });
};

globalThis.__clearHighlight = async () => {
  await window.evaluate(() => document.getElementById('__wso2i_demo_highlight')?.remove());
};

globalThis.__logHighlight = (entry) => {
  const row = { t: Date.now() - globalThis.__highlightState.t0, ...entry };
  globalThis.__highlightState.log.push(row);
  try { fs.appendFileSync(globalThis.__highlightState.file, JSON.stringify(row) + '\n'); } catch {}
};

globalThis.__normalizeRect = (r) => ({
  x: Math.round(r.x),
  y: Math.round(r.y),
  width: Math.round(r.width ?? r.w),
  height: Math.round(r.height ?? r.h),
});
