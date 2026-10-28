import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const desktopRoot = path.resolve(import.meta.dirname, '..');
const packagedExe = process.env.GURUJI_DESKTOP_EXE;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'guruji-desktop-'));
const artifacts = path.join(desktopRoot, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const screenshotName = packagedExe ? 'desktop-packaged.png' : 'desktop-home.png';

const launchEnv = { ...process.env };
delete launchEnv.ELECTRON_RUN_AS_NODE;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

let app;
try {
  app = await electron.launch({
    executablePath: packagedExe || electronPath,
    args: packagedExe ? [] : [desktopRoot],
    cwd: packagedExe ? path.dirname(packagedExe) : desktopRoot,
    env: {
      ...launchEnv,
      GURUJI_USER_DATA: userData,
      GURUJI_PYTHON: process.env.GURUJI_PYTHON || 'python',
    },
    timeout: 120_000,
  });

  const window = await app.firstWindow({ timeout: 120_000 });
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(() => document.body.innerText.trim().length > 0, null, {
    timeout: 120_000,
  });

  const url = window.url();
  const origin = url.split('/').slice(0, 3).join('/');
  const title = await window.title();
  const text = (await window.textContent('body')) || '';
  const externalRequests = await window.evaluate((base) => {
    return performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /^https?:/i.test(name) && !name.startsWith(base));
  }, origin);
  await window.bringToFront();
  const clipboardWorks = await window.evaluate(() =>
    navigator.clipboard
      .writeText('guruji-smoke')
      .then(() => true)
      .catch(() => false),
  );
  await window.screenshot({ path: path.join(artifacts, screenshotName) });
  await window.waitForTimeout(1_000);

  const logFile = path.join(userData, 'backend.log');
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
  await app.close();
  app = null;

  if (!/^http:\/\/127\.0\.0\.1:\d+/.test(url)) fail(`unexpected window origin: ${url}`);
  if (!/guruji/i.test(`${title} ${text}`)) fail('GURUJI BOX interface did not render');
  if (!log.includes('startup app=GURUJI BOX')) fail('backend did not report startup');
  if (!fs.existsSync(path.join(userData, 'guruji.db'))) fail('local database was not created');
  if (externalRequests.length) fail(`unexpected external requests: ${externalRequests.join(', ')}`);
  if (!clipboardWorks) fail('clipboard access is blocked');

  console.log(
    JSON.stringify({ status: 'ok', packaged: Boolean(packagedExe), url, title, userData, screenshot: `desktop/artifacts/${screenshotName}` }),
  );
} catch (error) {
  if (app) await app.close().catch(() => {});
  fail(error.stack || error.message);
}
