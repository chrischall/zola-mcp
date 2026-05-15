#!/usr/bin/env node
/**
 * Zola MCP auth setup.
 *
 * Launches the user's system Chrome with a dedicated profile, navigates to
 * zola.com/account/login, waits for them to sign in, then captures the `usr`
 * cookie (a year-long JWT refresh token).
 *
 * Usage:
 *   setup-auth.mjs             -> prints the token to stdout
 *   setup-auth.mjs <ENV_FILE>  -> writes ZOLA_REFRESH_TOKEN=<token> to ENV_FILE
 *
 * The reCAPTCHA v3 token is handled by Google seeing a real browser with a
 * persistent profile — no bypass needed.
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const LOGIN_URL = 'https://www.zola.com/account/login';
const COOKIE_NAME = 'usr';
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes to sign in

/**
 * Returns an absolute path to a runnable Google Chrome binary, or null if
 * none is found in known install locations.
 */
function findChrome() {
  const candidates = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
  }[process.platform] || [];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Updates (or creates) an env file, setting KEY=VALUE for a single key while
 * preserving any other lines in the file. File permissions are set to 0600.
 */
export function writeEnvVar(envPath, key, value) {
  let contents = '';
  if (fs.existsSync(envPath)) {
    contents = fs.readFileSync(envPath, 'utf8');
  }
  const lineRe = new RegExp(`^${key}=.*$`, 'm');
  if (lineRe.test(contents)) {
    contents = contents.replace(lineRe, `${key}=${value}`);
  } else {
    if (contents && !contents.endsWith('\n')) contents += '\n';
    contents += `${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, contents, { mode: 0o600 });
}

async function loadPuppeteer() {
  try {
    return (await import('puppeteer-core')).default;
  } catch {
    console.log('Installing puppeteer-core (~1 MB, one time)...');
    execSync('npm install --no-save puppeteer-core', {
      stdio: 'inherit',
      cwd: projectRoot,
    });
    return (await import('puppeteer-core')).default;
  }
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log('Usage: setup-auth.mjs [ENV_FILE]');
    console.log('');
    console.log('  With no arg, prints ZOLA_REFRESH_TOKEN to stdout.');
    console.log('  With ENV_FILE, writes ZOLA_REFRESH_TOKEN=<token> to that file');
    console.log('  (e.g. .env) at mode 0600 and does not print the secret.');
    return;
  }
  const envFile = args[0] ? path.resolve(args[0]) : null;

  const chromePath = findChrome();
  if (!chromePath) {
    console.error(
      `Could not find Google Chrome. Install from https://chrome.google.com/` +
        ` or run the manual steps in README.md (DevTools → copy usr cookie).`
    );
    process.exit(1);
  }

  const puppeteer = await loadPuppeteer();

  const profileDir = path.join(os.homedir(), '.zola-mcp', 'chrome-profile');
  fs.mkdirSync(profileDir, { recursive: true });

  console.log('');
  console.log('Launching Chrome with a dedicated profile at:');
  console.log(`  ${profileDir}`);
  console.log('');
  console.log('Sign in to Zola when the window opens. The script will detect');
  console.log('the login automatically and close the browser.');
  console.log('');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    userDataDir: profileDir,
    headless: false,
    defaultViewport: null,
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  const [page] = await browser.pages();
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  const token = await waitForUsrCookie(page);

  if (!token) {
    await browser.close().catch(() => {});
    console.error(
      `Timed out after ${TIMEOUT_MS / 60000} minutes without detecting a login.`
    );
    process.exit(1);
  }

  await browser.close().catch(() => {});

  if (envFile) {
    writeEnvVar(envFile, 'ZOLA_REFRESH_TOKEN', token);
    console.log('');
    console.log(`Wrote ZOLA_REFRESH_TOKEN to ${envFile}`);
    console.log(`Token is a ~1-year JWT. Restart Claude to pick it up.`);
  } else {
    console.log('');
    console.log('ZOLA_REFRESH_TOKEN (paste into Claude Desktop / MCPB config):');
    console.log('');
    console.log(token);
    console.log('');
    console.log('Token is a ~1-year JWT. Tip: re-run with a path to write it');
    console.log('directly to an env file, e.g. `npm run auth -- .env`.');
  }
}

/**
 * Polls the page's cookie jar every second until the `usr` cookie appears or
 * the timeout elapses.
 */
async function waitForUsrCookie(page) {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const cookies = await page.cookies('https://www.zola.com').catch(() => []);
    const usr = cookies.find((c) => c.name === COOKIE_NAME);
    if (usr?.value) return usr.value;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// Only run main() when executed directly, not when imported for tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Setup failed:', err?.message ?? err);
    process.exit(1);
  });
}
