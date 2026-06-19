#!/usr/bin/env node
import fs from 'fs';
import http from 'http';
import path from 'path';
import vm from 'vm';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { _electron as electron } from 'playwright';

const dir = path.dirname(fileURLToPath(import.meta.url));

const sessionName = process.argv[2];
const appPath = process.argv[3];
if (!sessionName || !appPath) { console.error('Usage: daemon.mjs <session-name> <app-path> [electron-args...]'); process.exit(1); }
if (!/^[a-zA-Z0-9_-]+$/.test(sessionName)) { console.error(`invalid session name: "${sessionName}" (allowed: a-z A-Z 0-9 _ -)`); process.exit(1); }

const sessionDir = `/tmp/wso2i-${sessionName}`;
const portFile = path.join(sessionDir, 'daemon.port');
const pidFile = path.join(sessionDir, 'daemon.pid');
const execScript = path.join(sessionDir, 'exec.sh');

// Refuse to start if another daemon with this name is alive
if (fs.existsSync(portFile)) {
  const existingPort = fs.readFileSync(portFile, 'utf8').trim();
  try {
    execSync(`curl -sf --max-time 2 http://127.0.0.1:${existingPort} --data-binary '"ping"'`, {stdio: 'ignore'});
    console.error(`daemon "${sessionName}" already running on :${existingPort} (port file: ${portFile})`);
    process.exit(1);
  } catch { /* stale port file, continue */ }
}
fs.rmSync(sessionDir, {recursive: true, force: true});
fs.mkdirSync(sessionDir);

const logPath = path.join(sessionDir, 'daemon.log');
const log = msg => fs.appendFileSync(logPath, `[${new Date().toISOString().slice(11,23)}] ${msg}\n`);

const userDataDir = path.join(sessionDir, 'user-data');
fs.mkdirSync(userDataDir);
log(`launching ${appPath}`);
const app = await electron.launch({ executablePath: appPath, args: [`--user-data-dir=${userDataDir}`, ...process.argv.slice(4)] });
let window = await app.firstWindow();
await window.waitForLoadState('domcontentloaded');
log('window ready');

// Re-acquire window if VS Code reloads/reopens it
const ensureWindow = async () => {
  try { await window.evaluate(() => true); return; } catch {}
  log('window stale, re-acquiring...');
  for (const candidate of app.windows()) {
    try {
      await candidate.evaluate(() => true);
      window = candidate;
      await window.waitForLoadState('domcontentloaded').catch(() => {});
      ctx.window = window;
      log('window re-acquired');
      return;
    } catch {}
  }
  window = await app.waitForEvent('window', { timeout: 30000 });
  await window.waitForLoadState('domcontentloaded').catch(() => {});
  ctx.window = window;
  log('window re-acquired');
};

const ctx = vm.createContext({ app, window, electron, fs, execSync, spawn, process, ensureWindow });

function load(f) { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx); log(`loaded ${path.relative(dir, f)}`); }

load(path.join(dir, 'prelude.js'));
const helpersDir = path.join(dir, 'helpers');
for (const f of fs.readdirSync(helpersDir).sort()) if (f.endsWith('.js')) load(path.join(helpersDir, f));
fs.watch(helpersDir, (_, f) => {
  if (!f?.endsWith('.js')) return;
  try { load(path.join(helpersDir, f)); } catch (e) { log(`reload error ${f}: ${e.message}`); }
});

let tail = Promise.resolve();
http.createServer((req, res) => {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    const preview = body.trim().slice(0, 80).replace(/\n/g, ' ');
    const run = async () => {
      log(`run: ${preview}`);
      await ensureWindow();
      ctx.console = { log: (...a) => res.write(a.map(String).join(' ') + '\n') };
      const wrapped = `(async()=>{return(${body})})()`;
      let code;
      try { new vm.Script(wrapped); code = wrapped; } catch { code = `(async()=>{${body}})()` }
      const r = vm.runInContext(code, ctx);
      return r instanceof Promise ? r : Promise.resolve(r);
    };
    const next = tail.then(run);
    tail = next.then(() => {}, () => {});
    next.then(
      r => {
        if (r instanceof Buffer || r instanceof Uint8Array) { res.end('Binary result\n'); return; }
        log(`ok:  ${preview}`);
        const out = typeof r === 'string' ? r : JSON.stringify(r) ?? '';
        res.end(out || (r === undefined ? 'ok' : String(r)));
      },
      e => { log(`err: ${e.message}`); res.end((e.stack ?? e.message) + '\n'); },
    );
  });
}).listen(0, '127.0.0.1', function() {
  const { port } = this.address();
  fs.writeFileSync(portFile, String(port));
  fs.writeFileSync(pidFile, String(process.pid));
  fs.writeFileSync(execScript, `#!/bin/bash\nexec curl -s --max-time \${TIMEOUT:-600} -X POST http://127.0.0.1:${port} --data-binary @-\n`, {mode: 0o755});
  log(`ready on :${port}`);
});

// Don't clean up port/exec files — they live in /tmp and serve as a
// tombstone so that run-steps.sh / daemon.mjs can detect a dead daemon
// via a failed curl rather than a missing file (avoids start-up races).
app.on('close', () => { log('electron closed — daemon stays alive for debugging'); });
process.on('SIGTERM', () => { app.close().catch(() => {}); process.exit(0); });
process.on('SIGINT', () => { app.close().catch(() => {}); process.exit(0); });
