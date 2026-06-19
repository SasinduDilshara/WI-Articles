// Click Run and wait for an HTTP endpoint to respond.
// Uses dispatchEvent for the Run button (guestClick misses it).
globalThis.runAndWaitForEndpoint = async (url, timeout = 120000, opts = {}) => {
  // Find and click the Run button
  const btns = await guestFrame.locator('button, vscode-button').all();
  for (const btn of btns) {
    const text = await btn.evaluate(el => el.textContent.trim()).catch(() => '');
    if (text === 'Run') {
      await btn.evaluate(el => el.dispatchEvent(new MouseEvent('click', {bubbles: true})));
      break;
    }
  }
  await window.waitForTimeout(2000);

  // Poll endpoint. Window may go stale during build — catch and re-acquire.
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { await window.waitForTimeout(5000); } catch { await ensureWindow(); }
    try {
      const result = await waitForEndpoint(url, 5000, opts);
      if (result.body?.length > 0) return result;
    } catch {}
  }
  throw new Error(`runAndWaitForEndpoint("${url}") timed out after ${timeout}ms`);
};

// Alias for backward compat — delegates to navigateToOverview (navigation.js).
globalThis.navigateToIntegrationOverview = async (integrationName) => {
  await navigateToOverview(integrationName);
};
