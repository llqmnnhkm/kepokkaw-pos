// Offline test: loads the app online so the service worker caches it, then reloads with the network off.
import { launch } from './browser.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const MODE = process.argv[2] || 'local'; // local or cloud
const ROOT = process.argv[3] || path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (MODE === 'local' && p === '/firebase-config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('window.KEPOKKAW_FIREBASE=null;') }
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(8767);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await launch();
const page = await browser.newPage();
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ };
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++ });
await page.goto('http://localhost:8767/', { waitUntil: 'load' });
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 15000 }).catch(() => {});
await page.reload({ waitUntil: 'load' }); await sleep(800);
ok(await page.evaluate(() => !!navigator.serviceWorker.controller), MODE + ': service worker controls the page');
const failed = [];
page.on('requestfailed', r => { if (r.url().startsWith('http://localhost:8767')) failed.push(r.url()) });
server.close(); server.closeAllConnections && server.closeAllConnections();
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'load' }); await sleep(1500);
ok(failed.length === 0, MODE + ': every app file came from the offline copy' + (failed.length ? ' (missing: ' + failed.join(', ') + ')' : ''));
const fontsOk = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').length });
if (MODE === 'local') {
  ok(await page.evaluate(() => document.querySelectorAll('.tiles .tile').length > 0), 'local: cashier works offline');
  ok(fontsOk >= 2, 'local: brand fonts load offline (' + fontsOk + ')');
} else {
  ok(await page.evaluate(() => !!window.KKFB && !!window.KKCloud), 'cloud: Firebase and sync code load offline');
  ok(await page.evaluate(() => !document.getElementById('pin').hidden && !/Could not load sync/.test(document.getElementById('pin').textContent)), 'cloud: sign in screen shows offline, not a load error');
}
await browser.close();
process.exit(fails ? 1 : 0);
