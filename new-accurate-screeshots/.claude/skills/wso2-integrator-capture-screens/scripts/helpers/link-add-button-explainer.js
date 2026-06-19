// Maps every add-button in the DOM to its branch label.
//
// Strategy:
// - link-add-button-N: walk up DOM ancestry to find the nearest diagram-link ancestor.
//   That element carries the branch label in its direct children.
// - empty-node-add-button-N: no diagram-link ancestor (canvas virtual rendering).
//   Match by x-coordinate to the nearest branch label foreignObject.
//
// Returns [{btnId, diagramLinkId, label}]

globalThis.linkAddButtonExplainer = async () => {
  await waitForGuest();
  return guestFrame.evaluate(() => {
    // Collect branch label positions from foreignObjects
    const branchLabels = [];
    for (const fo of document.querySelectorAll('foreignObject')) {
      const txt = fo.textContent?.trim() ?? '';
      if (/^["']/.test(txt) || txt === '_') {
        const r = fo.getBoundingClientRect();
        branchLabels.push({ label: txt, cx: r.x + r.width / 2 });
      }
    }

    // Extract direct branch label from a diagram-link element
    function labelFromDiagramLink(dlEl) {
      for (const child of dlEl.children) {
        const txt = child.textContent?.trim() ?? '';
        if (/^["']/.test(txt) || txt === '_') return txt;
        for (const gc of child.children) {
          const t = gc.textContent?.trim() ?? '';
          if (/^["']/.test(t) || t === '_') return t;
        }
      }
      return '(trunk)';
    }

    // Nearest branch label by x-coordinate distance
    function nearestBranchLabel(cx) {
      if (!branchLabels.length) return '(unknown)';
      return branchLabels.reduce((best, l) =>
        Math.abs(l.cx - cx) < Math.abs(best.cx - cx) ? l : best
      ).label;
    }

    return Array.from(document.querySelectorAll('[data-testid]'))
      .filter(el => /^(empty-node|link)-add-button-/.test(el.dataset.testid))
      .map(el => {
        const btnId = el.dataset.testid;
        if (btnId.startsWith('link-add-button-')) {
          // Walk up to diagram-link ancestor
          let curr = el.parentElement;
          while (curr && curr !== document.documentElement) {
            if (curr.dataset?.testid?.startsWith('diagram-link-')) {
              return { btnId, diagramLinkId: curr.dataset.testid, label: labelFromDiagramLink(curr) };
            }
            curr = curr.parentElement;
          }
          return { btnId, diagramLinkId: null, label: '(no ancestor diagram-link)' };
        } else {
          // empty-node-add-button: use x-coordinate matching
          const r = el.getBoundingClientRect();
          const cx = r.x + r.width / 2;
          return { btnId, diagramLinkId: null, label: nearestBranchLabel(cx) };
        }
      });
  });
};
