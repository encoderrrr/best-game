// Local verification for STARSHARD — Salvage Run. Drives build/game/ in headless
// Chromium (playwright-core) and checks the real game:
//   1. the four ?shot= scenes render, set window.__shotReady and screenshot cleanly
//      (1280x720 JPEG, each <= 256 KiB) into build/screenshots/
//   2. the live game starts on Space, scores and kills with mouse+keyboard play,
//      pauses on P, reaches game over, and restarts on R
// The game files are served to the browser by route interception from disk (no local
// HTTP server: this Chromium build blocks local-network navigations).
// Usage: node test.mjs   (run from this directory)
import { chromium } from '/usr/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const GAME_DIR = join(ROOT, 'game');
const SHOTS_DIR = join(ROOT, 'screenshots');
const SEED = 7;
const BASE = 'http://127.0.0.1:8123';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// The VM's own Chromium (/opt/meta-chromium/chrome) needs its WebGL domain policy flags
// to start; Playwright's own browser is not installed, so drive this one instead.
const POLICY = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const SHA = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';
const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: [
    '--no-sandbox',
    // The test server is on localhost; Chrome 157's Local Network Access check would
    // otherwise refuse the navigation from the browser's own context.
    '--disable-features=LocalNetworkAccessChecks',
    `--hatch-webgl-allowed-domains-file=${POLICY}`,
    `--hatch-webgl-allowed-domains-sha256=${SHA}`,
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Serve the game files from disk: every request to the test origin is answered here,
// so no local-network socket is ever opened (this Chromium build blocks those).
await page.route(`${BASE}/**`, async (route) => {
  const url = new URL(route.request().url());
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = join(GAME_DIR, rel);
  if (!file.startsWith(GAME_DIR)) return route.abort();
  try {
    const body = readFileSync(file);
    await route.fulfill({ status: 200, contentType: MIME[extname(file)] ?? 'application/octet-stream', body });
  } catch {
    await route.fulfill({ status: 404, body: 'not found' });
  }
});
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

// 1. The four screenshot scenes.
mkdirSync(SHOTS_DIR, { recursive: true });
const shots = [
  ['play', '01-play.jpg'],
  ['title', '02-title.jpg'],
  ['wave', '03-wave.jpg'],
  ['over', '04-over.jpg'],
];
for (const [name, file] of shots) {
  consoleErrors.length = 0;
  await page.goto(`${BASE}/index.html?shot=${name}&seed=${SEED}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 120000 });
  await page.screenshot({ path: join(SHOTS_DIR, file), type: 'jpeg', quality: 82 });
  const bytes = statSync(join(SHOTS_DIR, file)).size;
  const state = await page.evaluate(() => {
    const s = window.__starshard.state;
    return { score: s.score, wave: s.wave, kills: s.kills, hearts: s.player.hearts, enemies: s.enemies.filter((e) => e.active).length };
  });
  check(`shot ${name} renders`, true, `score=${state.score} wave=${state.wave} kills=${state.kills} hearts=${state.hearts} enemies=${state.enemies} ${file} ${bytes} bytes`);
  check(`shot ${name} jpeg <= 256 KiB`, bytes <= 262144, `${bytes} bytes`);
  check(`shot ${name} no console errors`, consoleErrors.length === 0, consoleErrors.join(' | '));
}

// 2. The live game, played with keyboard and mouse.
consoleErrors.length = 0;
await page.goto(`${BASE}/index.html?seed=${SEED}`, { waitUntil: 'load' });
await page.waitForTimeout(500);
const status = () => page.evaluate(() => document.getElementById('status').textContent);
check('title screen announces', (await status()).includes('Starshard'), await status());

await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('Space starts the game', (await status()).includes('Playing'), await status());

// Fly and shoot for 20 s: strafe with keys, aim across the field, hold fire.
await page.mouse.move(900, 300);
await page.mouse.down();
const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
for (let i = 0; i < 20; i += 1) {
  await page.mouse.move(400 + Math.random() * 500, 150 + Math.random() * 400);
  await page.keyboard.down(keys[i % 4]);
  await page.waitForTimeout(500);
  await page.keyboard.up(keys[i % 4]);
}
await page.mouse.up();
const mid = await page.evaluate(() => {
  const s = window.__starshard.state;
  return { score: s.score, wave: s.wave, kills: s.kills, hearts: s.player.hearts, shards: s.shards };
});
check('live play scores', mid.score > 0 && mid.kills > 0, `score=${mid.score} kills=${mid.kills} wave=${mid.wave} hearts=${mid.hearts} shards=${mid.shards}`);
await page.screenshot({ path: join(SHOTS_DIR, 'live-play.jpg'), type: 'jpeg', quality: 82 });

await page.keyboard.press('KeyP');
await page.waitForTimeout(200);
check('P pauses', (await status()).includes('Paused'), await status());
await page.keyboard.press('KeyP');
await page.waitForTimeout(200);
check('P resumes', (await status()).includes('Playing'), await status());

// One hull left, no firing, no dodging: the drones should finish the ship.
await page.evaluate(() => { window.__starshard.state.player.hearts = 1; });
let over = false;
for (let i = 0; i < 120; i += 1) {
  await page.waitForTimeout(500);
  if ((await status()).includes('Ship lost')) { over = true; break; }
}
const end = await page.evaluate(() => {
  const s = window.__starshard.state;
  return { score: s.score, wave: s.wave, hearts: s.player.hearts };
});
check('game over is reachable', over, `score=${end.score} wave=${end.wave} hearts=${end.hearts}`);
check('no console errors in live play', consoleErrors.length === 0, consoleErrors.join(' | '));

if (over) {
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(300);
  check('R restarts after game over', (await status()).includes('Playing'), await status());
  const after = await page.evaluate(() => window.__starshard.state.score);
  check('restart resets the score', after === 0, `score=${after}`);
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? `\nALL ${results.length} CHECKS PASSED` : `\n${failed} OF ${results.length} CHECKS FAILED`);
process.exit(failed === 0 ? 0 : 1);
