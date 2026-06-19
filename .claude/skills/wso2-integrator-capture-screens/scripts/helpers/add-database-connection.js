// Add a database connection via the "Connect to a Database" introspection wizard.
// Must be in flow editor with node panel open or openable.
//
// opts.type: "MySQL" | "MSSQL" | "PostgreSQL"
// opts.host, opts.port, opts.database, opts.user, opts.password
// opts.connectionName: name for the connection
// opts.tables: string[] of table names to select (default: all)
//
// After save, the node panel shows typed operations for the selected tables.
// A Config.toml must be created separately for the password configurable.
globalThis.addDatabaseConnection = async (opts) => {
  await waitForGuest();

  // Open Add Connection panel
  const textBtn = guestFrame.getByText('Add Connection', {exact: true}).first();
  if (await textBtn.isVisible().catch(() => false)) {
    await guestClick(textBtn);
  } else {
    await ensureNodePanelOpen();
    await guestFrame.locator('.codicon-add').first().evaluate(el => el.closest('vscode-button').click());
  }
  await window.waitForTimeout(1000);

  // Click the database type pill under "Connect to a Database"
  await guestFrame.evaluate((dbType) => {
    const ps = [...document.querySelectorAll('p')];
    // Find the pill — it's inside the "Connect to a Database" section
    const dbSection = ps.find(p => p.textContent.includes('Connect to a Database'));
    const pills = document.querySelectorAll('p');
    for (const p of pills) {
      if (p.textContent.trim() === dbType && p.closest('[class*="card"], [class*="item"], div')) {
        p.click();
        return;
      }
    }
    throw new Error(`Database type "${dbType}" pill not found`);
  }, opts.type || 'MySQL');

  await waitForText('Database Credentials', 10000);

  // Step 1: Fill credentials
  await guestFill(guestFrame.getByRole('textbox', {name: 'Host'}), opts.host || '127.0.0.1');
  if (opts.port) {
    await guestFill(guestFrame.getByRole('textbox', {name: 'Port'}), String(opts.port));
  }
  await guestFill(guestFrame.getByRole('textbox', {name: 'Database'}), opts.database);
  await guestFill(guestFrame.getByRole('textbox', {name: 'User'}), opts.user);
  await guestFill(guestFrame.getByRole('textbox', {name: 'Password'}), opts.password);
  await window.waitForTimeout(300);

  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Connect & Introspect Database'}));
  await waitForText('Select Tables', 30000);

  // Step 2: Select tables
  if (opts.tables) {
    for (const table of opts.tables) {
      // Find checkbox next to table name and click it
      const idx = await guestFrame.evaluate((name) => {
        const checkboxes = [...document.querySelectorAll('vscode-checkbox, [role="checkbox"]')];
        return checkboxes.findIndex(cb => {
          const text = cb.parentElement?.textContent || cb.nextElementSibling?.textContent || '';
          return text.includes(name);
        });
      }, table);
      if (idx >= 0) {
        await guestClick(guestFrame.locator('vscode-checkbox, [role="checkbox"]').nth(idx));
        await window.waitForTimeout(200);
      }
    }
  } else {
    // Select all
    await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Select All'}));
    await window.waitForTimeout(300);
  }

  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Continue to Connection Details'}));
  await waitForText('Connection Name', 15000);

  // Step 3: Name and save
  await guestFill(guestFrame.getByRole('textbox', {name: 'Connection Name'}), opts.connectionName);
  await window.waitForTimeout(300);
  await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save Connection'}));

  // Wait for save to complete (can take a while — pulling dependencies)
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const saving = await guestFrame.locator('vscode-button').filter({hasText: /Saving/}).isVisible().catch(() => false);
    const saveBtn = await guestFrame.locator('vscode-button').filter({hasText: 'Save Connection'}).isVisible().catch(() => false);
    if (!saving && !saveBtn) break;
    await window.waitForTimeout(500);
  }
  await window.waitForTimeout(1000);
};

// Write a Config.toml for database password configurables.
// Must be called after addDatabaseConnection and before running.
// configEntries: {key: value} e.g. {mysqlDbPassword: "root"}
globalThis.writeConfigToml = async (integrationName, entries) => {
  const lines = Object.entries(entries).map(([k, v]) => `${k} = "${v}"`).join('\n');
  const home = process.env.HOME || process.env.USERPROFILE;
  const projDirs = fs.readdirSync(home + '/wso2integrator').filter(f => f.startsWith('project')).sort();
  const projDir = home + '/wso2integrator/' + projDirs[projDirs.length - 1];
  const intDirs = fs.readdirSync(projDir).sort();
  const intDir = projDir + '/' + intDirs.find(d =>
    d.toLowerCase().startsWith(integrationName.toLowerCase().substring(0, 6))
  );
  fs.writeFileSync(intDir + '/Config.toml', lines + '\n');
};
