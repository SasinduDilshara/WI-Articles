#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';

if (process.env.WSO2_INTEGRATOR_PATH) {
  process.stdout.write(process.env.WSO2_INTEGRATOR_PATH);
  process.exit(0);
}

const candidates = process.platform === 'win32' ? [
  path.join(process.env.APPDATA     || '', 'WSO2', 'Integrator', 'WSO2 Integrator.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'WSO2 Integrator', 'WSO2 Integrator.exe'),
] : [
  path.join(os.homedir(), 'Applications/WSO2 Integrator.app/Contents/MacOS/Electron'),
  '/Applications/WSO2 Integrator.app/Contents/MacOS/Electron',
  '/usr/share/wso2-integrator/wso2-integrator',
];

for (const p of candidates) {
  if (fs.existsSync(p)) { process.stdout.write(p); process.exit(0); }
}

process.stderr.write('WSO2 Integrator not found. Set WSO2_INTEGRATOR_PATH.\n');
process.exit(1);
