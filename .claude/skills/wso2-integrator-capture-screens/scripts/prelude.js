// WSO2 Integrator automation helpers — load into daemon ctx at session start

// Find the WSO2 webview outer frame (index.html), then return its content child (fake.html).
// Matches extensionId=wso2.* first; falls back to any vscode-webview with a child frame
// for versions/states where the extensionId param disappears after navigation.
findGuestOuter = () => {
  let frames
  try { frames = window.frames() } catch { return null }
  return frames.find(f => { try { return /extensionId=wso2\./.test(f.url()) } catch { return false } })
      ?? frames.find(f => { try { return f.url().includes('vscode-webview://') && f.childFrames().length > 0 } catch { return false } })
}

refreshGuest = () => {
  const outer = findGuestOuter()
  guestFrame = outer ? (outer.childFrames()[0] ?? outer) : null
  return guestFrame
}

waitForGuest = async (timeout = 15000) => {
  const deadline = Date.now() + timeout
  let lastReason = 'unknown'
  while (Date.now() < deadline) {
    // Re-acquire window if it went stale (VS Code reload)
    if (typeof ensureWindow === 'function') {
      try { await ensureWindow() } catch (e) { lastReason = `ensureWindow: ${e.message}`; await window.waitForTimeout(500); continue }
    }
    const outer = findGuestOuter()
    if (!outer) { lastReason = 'no webview frame found'; await window.waitForTimeout(200); continue }
    const inner = outer.childFrames()[0] ?? outer
    try { await inner.evaluate(() => document.readyState); guestFrame = inner; return inner }
    catch (e) { lastReason = `frame evaluate failed: ${e.message}` }
    await window.waitForTimeout(200)
  }
  throw new Error(`guest frame not ready (timeout): ${lastReason}`)
}

guestClick = async (locator) => {
  const box = await locator.evaluate(el => {
    el.scrollIntoView({ block: "nearest" })
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  let x = box.x, y = box.y, f = guestFrame
  while (f.parentFrame()) {
    const parent = f.parentFrame(), url = f.url()
    const off = await parent.evaluate(url => {
      for (const fr of document.querySelectorAll("iframe"))
        try {
          if (fr.src === url || fr.contentWindow?.location?.href === url) {
            const r = fr.getBoundingClientRect(); return { x: r.x, y: r.y }
          }
        } catch {}
      const fr = document.querySelector("iframe")
      return fr ? { x: fr.getBoundingClientRect().x, y: fr.getBoundingClientRect().y } : { x: 0, y: 0 }
    }, url)
    x += off.x; y += off.y; f = parent
  }
  await window.mouse.click(x, y)
}

// Fill a vscode-text-field (shadow DOM input) — click to focus, select all, then type.
// Retries if helper panel steals keystrokes (verifies inputValue matches).
guestFill = async (locator, text) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await window.keyboard.press('Escape')
    await window.waitForTimeout(150)
    await guestClick(locator)
    await window.waitForTimeout(100)
    await window.keyboard.press('Escape') // dismiss helper panel triggered by focus
    await window.waitForTimeout(150)
    await guestClick(locator)
    await locator.selectText().catch(async () => {
      await window.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
    })
    await window.keyboard.type(text)
    await window.waitForTimeout(100)
    try {
      const val = await locator.inputValue()
      if (val === text) return
    } catch {}
  }
}

// Fill a CodeMirror 6 editor — do NOT call guestClick before this
// `index` selects which CM instance on the page (0-based, default 0)
cmFill = async (text, index = 0) => {
  await guestFrame.evaluate(({text, index}) => {
    const els = document.querySelectorAll(".cm-content")
    const el = els[index]
    if (!el) throw new Error(`CM view not found at index ${index} (${els.length} on page)`)
    const view = el.cmView?.view
    if (!view) throw new Error("CM view instance not found")
    view.focus()
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    view.requestMeasure()
  }, {text, index})
}

// List all add-button data-testids currently in the DOM (empty-node-add-button-*, link-add-button-*)
listAddButtons = async () => {
  await waitForGuest()
  return guestFrame.locator('[data-testid]').evaluateAll(els =>
    els.filter(el => /^(empty-node|link)-add-button-/.test(el.dataset.testid))
      .map(el => el.dataset.testid)
      .filter(id => !id.includes('undefined'))
  )
}

// Aria snapshot of the guest webview. Optional filter: string or regex keeps matching lines only.
snapshot = async (filter) => {
  await waitForGuest()
  const raw = await guestFrame.locator("body").ariaSnapshot()
  if (!filter) return raw
  const re = filter instanceof RegExp ? filter : new RegExp(filter, 'i')
  return raw.split('\n').filter(l => re.test(l)).join('\n')
}

// Aria snapshot of the host (VS Code chrome) — sees sign-in dialogs, modals, notifications
hostSnapshot = async () => {
  return await window.frames()[0].locator("body").ariaSnapshot()
}

// Read terminal output via clipboard (xterm.js uses canvas, no DOM text)
// Run a shell command and return stdout
exec = (cmd) => execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim()

// Poll an HTTP endpoint until it responds. Returns response body.
// opts: { method, body, headers } for non-GET requests
waitForEndpoint = async (url, timeout = 30000, opts = {}) => {
  const method = opts.method || 'GET'
  const headerArgs = Object.entries(opts.headers || {}).map(([k,v]) => `-H '${k}: ${v}'`).join(' ')
  const bodyArg = opts.bodyFile ? `--data-binary @${opts.bodyFile}` : opts.body ? `--data-raw '${opts.body.replace(/'/g, "'\\''")}'` : ''
  const cmd = `curl -s -o /dev/stdout -w '\n%{http_code}' --max-time 2 -X ${method} ${headerArgs} ${bodyArg ? bodyArg + ' ' : ''}'${url}'`
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const raw = exec(cmd)
      const lines = raw.split('\n')
      const code = parseInt(lines.pop(), 10)
      return { status: code, body: lines.join('\n') }
    } catch {}
    await window.waitForTimeout(1000)
  }
  throw new Error(`waitForEndpoint("${url}") timed out after ${timeout}ms`)
}

// Poll guest snapshot until `text` appears. Returns the matching snapshot.
waitForText = async (text, timeout = 15000) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const s = await snapshot()
      if (s.includes(text)) return s
    } catch {}
    await window.waitForTimeout(500)
  }
  throw new Error(`waitForText("${text}") timed out after ${timeout}ms`)
}
