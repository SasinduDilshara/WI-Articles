// VS Code terminal helpers.
//
// openNewTerminal(name?)   — create and focus a new named terminal
// focusTerminal(name?)     — focus a terminal by name, or the active one
// terminalRun(command)     — type command + Enter in the focused terminal
// readTerminal(name?)      — read all text from a terminal

globalThis._termMod = process.platform === 'darwin' ? 'Meta' : 'Control';

globalThis._termPaletteRun = async (command) => {
  await window.keyboard.press(`${_termMod}+Shift+P`);
  await window.waitForTimeout(300);
  await window.keyboard.type(command);
  await window.waitForTimeout(500);
  await window.keyboard.press('Enter');
  await window.waitForTimeout(500);
};

globalThis.openNewTerminal = async (name) => {
  await _termPaletteRun('Terminal: Create New Terminal');
  await window.waitForTimeout(1500);
  if (name) {
    await _termPaletteRun('Terminal: Rename');
    await window.waitForTimeout(300);
    await window.keyboard.type(name);
    await window.keyboard.press('Enter');
    await window.waitForTimeout(300);
  }
};

globalThis.focusTerminal = async (name) => {
  if (name) {
    // Click the named tab in the terminal tabs list (host frame), then focus input
    const f = window.frames()[0];
    await f.getByRole('listitem', {name: new RegExp(name)}).click();
    await window.waitForTimeout(300);
  }
  await _termPaletteRun('Terminal: Focus on Terminal View');
  await window.waitForTimeout(300);
};

globalThis.terminalRun = async (command, name) => {
  await focusTerminal(name);
  await window.keyboard.type(command);
  await window.waitForTimeout(100);
  await window.keyboard.press('Enter');
  await window.waitForTimeout(500);
};

globalThis.readTerminal = async (name) => {
  await focusTerminal(name);
  await _termPaletteRun('Terminal: Select All');
  await window.keyboard.press(`${_termMod}+c`);
  await window.waitForTimeout(200);
  try {
    return await window.frames()[0].evaluate(() => navigator.clipboard.readText());
  } catch {
    return execSync('pbpaste').toString();
  }
};
