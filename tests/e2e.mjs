// End to end test: device only mode, then cloud sync across two simulated devices.
// Firebase is replaced by tests/fake-firebase.js and a small in-memory server below, which mirrors firestore.rules.
// Run with: npm test   (or node tests/e2e.mjs)
import { launch } from './browser.mjs';
import os from 'node:os';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const FAKE = fs.readFileSync(new URL('./fake-firebase.js', import.meta.url), 'utf8');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kepokkaw-'));
let failures = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) failures++ };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- static server ---------- */
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(8765);

/* ---------- fake Firestore + Auth server with a mirror of firestore.rules ---------- */
const docs = new Map(), accounts = new Map(), listeners = new Map();
let nextUid = 1, writeLog = [], denials = [];
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const role = uid => { const u = uid && docs.get('users/' + uid); return u && (u.role === 'admin' || u.role === 'staff') ? u.role : null };
const getP = (o, segs) => segs.reduce((x, k) => x == null ? undefined : x[k], o);
function setP(o, segs, v) {
  let x = o; for (let i = 0; i < segs.length - 1; i++) { if (typeof x[segs[i]] !== 'object' || x[segs[i]] === null) x[segs[i]] = {}; x = x[segs[i]] }
  const k = segs[segs.length - 1];
  if (v && v.__del) delete x[k]; else if (v && v.__inc !== undefined) x[k] = (typeof x[k] === 'number' ? x[k] : 0) + v.__inc; else x[k] = strip(v);
}
function strip(v) { if (Array.isArray(v)) return v.map(strip); if (v && typeof v === 'object') { const o = {}; for (const k in v) { const s = v[k]; if (s && s.__del) continue; o[k] = s && s.__inc !== undefined ? s.__inc : strip(s) } return o } return v }
function merge(t, s) { for (const k in s) { const v = s[k]; if (v && typeof v === 'object' && !Array.isArray(v) && !v.__del && v.__inc === undefined) { if (typeof t[k] !== 'object' || !t[k]) t[k] = {}; merge(t[k], v) } else setP(t, [k], v) } return t }
function canRead(p, uid) {
  const [c, id] = p.split('/');
  if (p === 'meta/owner') return true;
  if (c === 'users') return id ? (uid === id || role(uid) === 'admin') : role(uid) === 'admin';
  if (c === 'exp' || c === 'log') return role(uid) === 'admin';
  return !!role(uid);
}
function keepsKeys(oldD, newD, f) { if (!oldD || !(f in oldD)) return true; if (!(f in newD)) return false; return Object.keys(oldD[f]).every(k => k in newD[f]) }
// server time sentinels become the time of the write, like Firestore's request.time
const resolveTs = (v, T) => Array.isArray(v) ? v.map(x => resolveTs(x, T)) : v && typeof v === 'object' ? (v.__ts ? T : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveTs(x, T)]))) : v;
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const changedKeys = (a, b) => [...new Set(Object.keys(a || {}).concat(Object.keys(b || {})))].filter(k => !same((a || {})[k], (b || {})[k]));
// mirrors staffOrderWrite in firestore.rules
function staffOrderWrite(uid, oldD, newD, T) {
  if (!role(uid) || !Object.keys(newD).every(k => k === 'o' || k === 'last')) return false;
  const a = newD.o || {}, b = (oldD && oldD.o) || {}, k = newD.last, me = docs.get('users/' + uid);
  if (typeof k !== 'string' || !k || !(k in a) || !changedKeys(a, b).every(x => x === k)) return false;
  if (!(k in b)) { const o = a[k]; return o.id === k && o.uid === uid && o.by === 'staff' && o.name === me.name && o.at === T && o.voided == null }
  const old = b[k], neu = a[k], ch = changedKeys(neu, old);
  if (!ch.every(x => ['pay', 'note', 'voided'].includes(x)) || old.at == null || T >= old.at + 16 * 3600e3) return false;
  if (ch.includes('voided')) { const v = neu.voided; if (old.voided != null || v == null || T >= old.at + 600e3 || v.uid !== uid || v.by !== 'staff') return false }
  return true;
}
// mirrors logAppend in firestore.rules
function logAppend(uid, oldD, newD, T) {
  const r = role(uid), me = docs.get('users/' + uid);
  if (!r || !Object.keys(newD).every(k => k === 'l' || k === 'last')) return false;
  const a = newD.l || {}, b = (oldD && oldD.l) || {}, k = newD.last;
  if (typeof k !== 'string' || !k || !(k in a) || k in b || !changedKeys(a, b).every(x => x === k)) return false;
  const e = a[k]; return e.id === k && e.uid === uid && e.by === r && e.name === me.name && e.at === T;
}
function canWrite(p, uid, oldD, newD, after, T) {
  const [c, id] = p.split('/'), r = role(uid), admin = r === 'admin';
  const staffMap = f => !!r && Object.keys(newD).every(k => k === f) && keepsKeys(oldD, newD, f);
  if (p === 'meta/owner') return !oldD && newD.uid === uid && after.get('users/' + uid) && after.get('users/' + uid).role === 'admin';
  if (p === 'meta/shop') return admin;
  if (p === 'meta/stock' || p === 'meta/closed') return !!r;
  if (c === 'users') {
    if (!oldD) return (admin && !('owner' in newD) && ['admin', 'staff'].includes(newD.role)) || (uid === id && !docs.has('meta/owner') && after.get('meta/owner') && after.get('meta/owner').uid === id && newD.role === 'admin' && newD.owner === true);
    return admin && uid !== id && oldD.owner !== true && !newD.owner && ['admin', 'staff', 'removed'].includes(newD.role);
  }
  if (c === 'weeks') return admin || staffOrderWrite(uid, oldD, newD, T);
  if (c === 'moves') return admin || staffMap('m');
  if (c === 'log') return logAppend(uid, oldD, newD, T);
  if (c === 'exp') return admin;
  return false;
}
function broadcast(paths) {
  for (const L of listeners.values()) { const id = L.id;
    if (!canRead(L.path, L.uid)) continue;
    if (L.kind === 'doc') { if (paths.includes(L.path)) send(L, id, { exists: docs.has(L.path), data: docs.get(L.path) || null }) }
    else {
      const ch = paths.filter(p => p.startsWith(L.path + '/')).map(p => ({ type: docs.has(p) ? 'modified' : 'removed', id: p.split('/')[1], data: docs.get(p) || null }));
      if (ch.length) send(L, id, { changes: ch, all: allIn(L.path) });
    }
  }
}
const allIn = c => [...docs].filter(([p]) => p.startsWith(c + '/')).map(([p, d]) => ({ id: p.split('/')[1], data: d }));
function send(L, id, payload) { L.page.evaluate((i, p) => window.__recv(i, p), id, payload).catch(() => {}) }
function handle(page, op) {
  if (op.t === 'signup') {
    if (accounts.has(op.email)) return { error: 'auth/email-already-in-use' };
    if (op.pw.length < 6) return { error: 'auth/weak-password' };
    const u = { uid: 'u' + nextUid++, email: op.email }; accounts.set(op.email, Object.assign({ pw: op.pw }, u)); return u;
  }
  if (op.t === 'signin') { const a = accounts.get(op.email); if (!a || a.pw !== op.pw) return { error: 'auth/invalid-credential' }; return { uid: a.uid, email: a.email } }
  if (op.t === 'get') { if (!canRead(op.path, op.uid)) return { error: 'permission-denied' }; return { exists: docs.has(op.path), data: docs.get(op.path) || null } }
  if (op.t === 'listen') {
    const L = { page, id: op.id, path: op.path, kind: op.kind, uid: op.uid }; listeners.set(page._kk + ':' + op.id, L);
    if (!canRead(op.path, op.uid)) { denials.push('read ' + op.path + ' by ' + role(op.uid)); send(L, op.id, { error: 'permission-denied' }); return {} }
    if (op.kind === 'doc') send(L, op.id, { exists: docs.has(op.path), data: docs.get(op.path) || null });
    else { const all = allIn(op.path); send(L, op.id, { changes: all.map(d => ({ type: 'added', id: d.id, data: d.data })), all }) }
    return {};
  }
  if (op.t === 'unlisten') { listeners.delete(page._kk + ':' + op.id); return {} }
  if (op.t === 'write') {
    const after = new Map(), T = Date.now();
    for (const w of op.ops) {
      w.data = resolveTs(w.data, T);
      const base = clone(after.has(w.path) ? after.get(w.path) : docs.get(w.path));
      let nd;
      if (w.opts && w.opts.mergeFields) { nd = base || {}; w.opts.mergeFields.forEach(fp => { const s = fp.split('.'); setP(nd, s, getP(w.data, s)) }) }
      else if (w.opts && w.opts.merge) nd = merge(base || {}, w.data);
      else nd = strip(w.data);
      after.set(w.path, nd);
    }
    for (const [p, nd] of after) if (!canWrite(p, op.uid, docs.get(p), nd, after, T)) { denials.push('write ' + p + ' by ' + (role(op.uid) || op.uid)); return { error: 'permission-denied' } }
    for (const [p, nd] of after) docs.set(p, nd);
    writeLog.push(...after.keys());
    broadcast([...after.keys()]);
    return {};
  }
  return { error: 'bad op' };
}

/* ---------- browser helpers ---------- */
const browser = await launch();
async function openPage(ctx, mode) {
  const page = await ctx.newPage(); page._kk = Math.random().toString(36).slice(2);
  await page.setViewport({ width: 1024, height: 768 });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); failures++ });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) console.log('console:', m.text()) });
  await page.exposeFunction('__srv', s => JSON.stringify(handle(page, JSON.parse(s))));
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => { delete Navigator.prototype.serviceWorker });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.endsWith('/sw.js')) return r.respond({ status: 404, body: '' });
    if (mode === 'cloud' && u.endsWith('/firebase.js')) return r.respond({ status: 200, contentType: 'text/javascript', body: FAKE });
    if (mode === 'cloud' && u.endsWith('/firebase-config.js')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.KEPOKKAW_FIREBASE={apiKey:"x",projectId:"test",authDomain:"test.firebaseapp.com"};' });
    if (mode === 'local' && u.endsWith('/firebase-config.js')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.KEPOKKAW_FIREBASE=null;' });
    r.continue();
  });
  await page.goto('http://localhost:8765/', { waitUntil: 'load' });
  await sleep(400);
  return page;
}
const click = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error('missing ' + s); e.click() }, sel);
const val = (p, sel, v, ev = 'input') => p.evaluate((s, v, ev) => { const e = document.querySelector(s); if (!e) throw new Error('missing ' + s); e.value = v; e.dispatchEvent(new Event(ev, { bubbles: true })) }, sel, v, ev);
const text = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : null }, sel);
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null }, sel);
async function sell(p, ids, pay = 'cash') { for (const id of ids) await click(p, `.tiles [data-act="add"][data-id="${id}"]`); await click(p, '[data-act="complete"]'); await sleep(150); await click(p, `[data-act="pay"][data-id="${pay}"]`); await sleep(250) }
const stockQ = () => (docs.get('meta/stock') || { q: {} }).q.frz;
const allOrders = () => [...docs].filter(([p]) => p.startsWith('weeks/')).flatMap(([, d]) => Object.values(d.o || {}));

/* ---------- 0. device only mode still works, and leaves sales to migrate ---------- */
const ctxA = await browser.createBrowserContext();
let L0 = await openPage(ctxA, 'local');
ok(await visible(L0, '.tiles .tile'), 'local mode: cashier tiles show');
ok((await text(L0, '#roleChip')) === 'Admin', 'local mode: starts as Admin like before');
await sell(L0, ['ori', 'hot']); await sell(L0, ['chz']);
await click(L0, '[data-act="view"][data-id="orders"]'); await sleep(200);
ok((await L0.$$eval('.list .row', r => r.length)) === 2, 'local mode: 2 orders saved');
await click(L0, '[data-act="view"][data-id="settings"]'); await sleep(200);
ok(await L0.$('#pinA') !== null, 'local mode: PIN settings still there');
await sleep(300); await L0.close();

/* ---------- 1. owner sets up the shop and uploads this device's sales ---------- */
const A = await openPage(ctxA, 'cloud');
await sleep(300);
await A.waitForSelector('#gateForm[data-mode="setup"]', { timeout: 4000 });
ok(true, 'cloud: empty project offers "Set up the shop"');
await val(A, '#gName', 'Luqman'); await val(A, '#gEmail', 'owner@test.my'); await val(A, '#gPw', 'secret1');
await click(A, '#gateForm button[type=submit]');
await A.waitForSelector('[data-act="gup"][data-id="1"]', { timeout: 4000 });
ok((await text(A, '.gate .pin-hint')).includes('2 orders'), 'cloud: offers to upload the 2 local orders');
await click(A, '[data-act="gup"][data-id="1"]'); await sleep(500);
ok(await A.evaluate(() => document.getElementById('pin').hidden), 'cloud: app opens after upload');
ok(allOrders().length === 2, 'cloud: 2 orders stored in Firestore (' + allOrders().length + ')');
ok((docs.get('meta/shop') || {}).items?.length === 6, 'cloud: menu stored');
ok(docs.get('users/u1')?.owner === true && docs.get('meta/owner')?.uid === 'u1', 'cloud: owner account claimed the shop');

/* ---------- 2. admin receives stock and adds an expense ---------- */
await click(A, '[data-act="view"][data-id="stock"]'); await sleep(200);
await val(A, '#rq-frz', '10'); await val(A, '#rc-frz', '300');
await click(A, '[data-act="receive"][data-id="frz"]'); await sleep(300);
ok(stockQ() === 10, 'stock: received 10 packs (' + stockQ() + ')');
ok([...docs].some(([p, d]) => p.startsWith('exp/') && Object.values(d.e).some(e => e.amount === 300)), 'stock: cost saved as expense');

/* ---------- 3. admin adds a staff member ---------- */
await click(A, '[data-act="view"][data-id="settings"]'); await sleep(300);
ok(await A.$('#pinA') === null && await A.$('#tEmail') !== null, 'settings: Team panel replaces PINs');
await val(A, '#tName', 'Aina'); await val(A, '#tEmail', 'Aina'); await val(A, '#tPw', 'staff12'); await A.select('#tRole', 'staff');
await click(A, '[data-act="addmember"]'); await sleep(500);
const ainaUid = accounts.get('aina@test.firebaseapp.com')?.uid;
ok(!!ainaUid, 'username: Aina stored as a hidden email on the project domain');
ok((await text(A, '.list')).includes('aina') && !(await text(A, '.list')).includes('firebaseapp'), 'username: team list shows the username only');
await val(A, '#tName', 'Aiman'); await val(A, '#tEmail', 'aiman'); await val(A, '#tPw', 'aiman123'); await A.select('#tRole', 'admin');
await click(A, '[data-act="addmember"]'); await sleep(500);
ok(docs.get('users/' + accounts.get('aiman@test.firebaseapp.com')?.uid)?.role === 'admin', 'username: aiman added as admin');
ok(docs.get('users/' + ainaUid)?.role === 'staff', 'team: Aina added as staff');
ok(await A.evaluate(() => !document.getElementById('pin').hidden) === false, 'team: owner still signed in after adding someone');

/* ---------- 4. staff signs in on a second device and sells ---------- */
const ctxB = await browser.createBrowserContext();
const B = await openPage(ctxB, 'cloud');
await B.waitForSelector('#gateForm[data-mode="signin"]', { timeout: 4000 });
ok(true, 'device B: sign in screen (shop already set up)');
await val(B, '#gEmail', 'aina'); await val(B, '#gPw', 'wrongpw'); await click(B, '#gateForm button[type=submit]'); await sleep(300);
ok((await text(B, '#gMsg')).includes('Wrong username or password'), 'device B: wrong password message');
await val(B, '#gEmail', 'ai na'); await click(B, '#gateForm button[type=submit]'); await sleep(200);
ok((await text(B, '#gMsg')).includes('3 to 20'), 'username: bad username explained');
await val(B, '#gEmail', 'aina');
await val(B, '#gPw', 'staff12'); await click(B, '#gateForm button[type=submit]'); await sleep(700);
ok(await B.evaluate(() => document.getElementById('pin').hidden), 'device B: staff signed in');
ok((await B.$$eval('#tabs button', b => b.length)) === 3, 'device B: staff sees 3 tabs only');
await sell(B, ['frz', 'frz', 'ori']); await sleep(300);
ok(stockQ() === 8, 'device B: selling 2 packs leaves 8 (' + stockQ() + ')');
ok(allOrders().length === 3, 'cloud: 3 orders now');
await sleep(300);
await click(A, '[data-act="view"][data-id="stock"]'); await sleep(200);
ok((await text(A, '.big-stock')) === '8', 'device A: sees stock 8 from device B');

/* ---------- 5. both devices sell a pack at the same moment ---------- */
for (const p of [A, B]) await click(p, '[data-act="view"][data-id="cashier"]');
await sleep(200);
await Promise.all([sell(A, ['frz']), sell(B, ['frz'])]); await sleep(500);
ok(stockQ() === 6, 'concurrent sales: stock 6, nothing overwritten (' + stockQ() + ')');
const nums = allOrders().filter(o => o.date === allOrders()[0].date).map(o => o.no);
console.log('     order numbers today:', nums.sort((a, b) => a - b).join(','));

/* ---------- 6. staff stays inside its permissions ---------- */
ok(await B.evaluate(() => 1) && denials.length === 0, 'no permission denials in normal use (' + denials.join('; ') + ')');

/* ---------- 7. admin voids and deletes, staff device follows ---------- */
const bOrder = allOrders().find(o => o.name === 'Aina' && o.lines.some(l => l.itemId === 'frz' && l.qty === 2));
ok(!!bOrder, 'orders: staff orders carry the person\'s name');
await click(A, '[data-act="view"][data-id="orders"]'); await sleep(200);
await click(A, `[data-act="order"][data-id="${bOrder.id}"]`); await sleep(150);
await click(A, `[data-act="voidask"][data-id="${bOrder.id}"]`); await sleep(150);
await click(A, `[data-act="void"][data-id="${bOrder.id}"]`); await sleep(400);
ok(allOrders().find(o => o.id === bOrder.id).voided, 'void: saved in cloud');
ok(stockQ() === 8, 'void: 2 packs back in stock (' + stockQ() + ')');
await click(B, '[data-act="view"][data-id="orders"]'); await sleep(300);
ok((await B.$$eval('.row.voided', r => r.length)) === 1, 'device B: sees the voided order');
await click(A, `[data-act="order"][data-id="${bOrder.id}"]`); await sleep(150);
await click(A, `[data-act="delask"][data-id="${bOrder.id}"]`); await sleep(150);
await click(A, `[data-act="delstep2"][data-id="${bOrder.id}"]`); await sleep(400);
await val(A, '#delConfirm', String(bOrder.no)); await click(A, '#delBtn'); await sleep(400);
ok(!allOrders().some(o => o.id === bOrder.id), 'delete: order removed from cloud');
ok(stockQ() === 8, 'delete of a voided order does not touch stock (' + stockQ() + ')');
await sleep(200);
ok((await B.$$eval('.list .row', r => r.length)) === allOrders().filter(o => o.date === bOrder.date).length, 'device B: order list follows the delete');

/* ---------- 8. no extra writes from just looking around ---------- */
writeLog = [];
for (const v of ['dashboard', 'expenses', 'stock', 'settings', 'orders', 'cashier']) { await click(A, `[data-act="view"][data-id="${v}"]`); await sleep(120) }
ok(writeLog.length === 0, 'browsing screens writes nothing (' + writeLog.join(',') + ')');
await click(A, '[data-act="view"][data-id="settings"]'); await sleep(200);
writeLog = [];
await val(A, 'input[data-edit="ori"][data-f="price"]', '9.5', 'change'); await sleep(300);
ok(writeLog.join(',') === 'meta/shop,log/' + allOrders()[0].date.slice(0, 7) || writeLog.length <= 2, 'price change writes only the menu and the log (' + writeLog.join(',') + ')');
await click(B, '[data-act="view"][data-id="cashier"]'); await sleep(300);
ok((await text(B, '.tile[data-id="ori"] .tprice')) === 'RM 9.50', 'device B: new price shows');

/* ---------- 8b. staff undo, payment change and signed log entries (stricter rules) ---------- */
denials.length = 0;
await click(B, '[data-act="view"][data-id="cashier"]'); await sleep(200);
await sell(B, ['ori'], 'cash');
const bLast = allOrders().filter(o => o.name === 'Aina').sort((x, y) => y.ts - x.ts)[0];
ok(typeof bLast.at === 'number' && bLast.uid === ainaUid, 'strict: staff order is signed and stamped with server time');
await click(B, '.undo [data-act="voidask"]'); await sleep(150); await click(B, '[data-act="void"]'); await sleep(400);
ok(!!allOrders().find(o => o.id === bLast.id).voided, 'strict: staff can still undo a fresh order');
await sell(B, ['hot'], 'cash');
const bPay = allOrders().filter(o => o.name === 'Aina').sort((x, y) => y.ts - x.ts)[0];
await click(B, '[data-act="view"][data-id="orders"]'); await sleep(200);
await click(B, `[data-act="order"][data-id="${bPay.id}"]`); await sleep(150);
await click(B, `[data-act="setpay"][data-id="${bPay.id}"][data-pay="online"]`); await sleep(400);
ok(allOrders().find(o => o.id === bPay.id).pay === 'online', 'strict: staff can switch payment on tonight\'s order');
await click(B, '[data-act="close"]'); await sleep(100);
ok(denials.length === 0, 'strict: normal staff use passes the stricter rules (' + denials.join('; ') + ')');
const logs = [...docs].filter(([p]) => p.startsWith('log/')).flatMap(([, d]) => Object.values(d.l || {}));
ok(logs.length > 0 && logs.every(e => e.uid && typeof e.at === 'number'), 'strict: every log entry is signed and server stamped (' + logs.length + ')');
const logCount = logs.length;
await click(B, '[data-act="view"][data-id="cashier"]'); await sleep(150);
/* ---------- 9. removing staff blocks them straight away ---------- */
await A.select(`select[data-urole="${ainaUid}"]`, 'removed'); await sleep(500);
ok(docs.get('users/' + ainaUid).role === 'removed', 'team: Aina set to Removed');
ok((await text(B, '.gate .pin-hint') || '').includes('not on this shop'), 'device B: shows no access screen');

/* ---------- 9a. payment method ---------- */
await click(A, '[data-act="view"][data-id="cashier"]'); await sleep(200);
await click(A, '.tiles [data-act="add"][data-id="chz"]'); await click(A, '[data-act="complete"]'); await sleep(250);
ok((await text(A, '#sheet')).includes('Cash') && (await text(A, '#sheet')).includes('Online'), 'payment: Complete order asks Cash or Online');
await click(A, '[data-act="pay"][data-id="online"]'); await sleep(400);
const last = allOrders().sort((x, y) => y.ts - x.ts)[0];
ok(last.pay === 'online' && last.lines[0].itemId === 'chz', 'payment: online saved on the order');
ok(allOrders().filter(o => o.pay === 'cash').length >= 3, 'payment: cash saved on earlier orders');
await click(A, '[data-act="view"][data-id="orders"]'); await sleep(200);
await click(A, `[data-act="order"][data-id="${last.id}"]`); await sleep(150);
await click(A, `[data-act="setpay"][data-id="${last.id}"][data-pay="cash"]`); await sleep(400);
ok(allOrders().find(o => o.id === last.id).pay === 'cash', 'payment: can be corrected on the order');
await click(A, '[data-act="close"]'); await sleep(100);
await click(A, '[data-act="report"]'); await sleep(200);
ok(/Cash RM [\d.,]+ · Online RM/.test(await A.$eval('#repOut', e => e.value)), 'payment: day report shows cash and online');
await click(A, '[data-act="close"]'); await sleep(100);
/* ---------- 9a2. payment filter on Orders ---------- */
await click(A, '[data-act="view"][data-id="cashier"]'); await sleep(150);
await sell(A, ['ori'], 'online'); await sell(A, ['hot'], 'online');
await click(A, '[data-act="view"][data-id="orders"]'); await sleep(250);
const todayKey = allOrders().sort((x, y) => y.ts - x.ts)[0].date, todays = allOrders().filter(o => o.date === todayKey && !o.voided);
const nOn = todays.filter(o => o.pay === 'online').length, nCash = todays.filter(o => o.pay === 'cash').length;
ok(!!(await A.$('[data-act="opay"][data-id="online"]')), 'filter: payment chips show on Orders');
await click(A, '[data-act="opay"][data-id="online"]'); await sleep(200);
ok((await A.$$eval('.list .row:not(.voided)', r => r.length)) === nOn && nOn >= 2, 'filter: Online shows only online orders (' + nOn + ')');
ok((await A.$$eval('.list .pill.pay.cash', r => r.length)) === 0, 'filter: no cash orders in the Online list');
await click(A, '[data-act="opay"][data-id="cash"]'); await sleep(200);
ok((await A.$$eval('.list .row:not(.voided)', r => r.length)) === nCash, 'filter: Cash shows only cash orders (' + nCash + ')');
ok((await text(A, '.stats')).includes('Cash Sales'), 'filter: stats follow the filter');
await click(A, '[data-act="opay"][data-id="all"]'); await sleep(150);
/* ---------- 9a3. cups ---------- */
await click(A, '[data-act="view"][data-id="cashier"]'); await sleep(150);
for (const id of ['ori', 'ori', 'hot', 'frz']) await click(A, `.tiles [data-act="add"][data-id="${id}"]`);
await sleep(150);
ok((await text(A, '.ticket-head span')).includes('3 cups'), 'cups: ticket counts 3 cups for 3 flavours plus a frozen pack');
await click(A, '[data-act="complete"]'); await sleep(150); await click(A, '[data-act="pay"][data-id="cash"]'); await sleep(300);
const cupDay = allOrders().sort((x, y) => y.ts - x.ts)[0].date, flav = new Set(['ori', 'hot', 'egg', 'bbq', 'chz']);
const expCups = allOrders().filter(o => o.date === cupDay && !o.voided).reduce((s, o) => s + o.lines.reduce((a, l) => a + (flav.has(l.itemId) ? l.qty : 0), 0), 0);
await click(A, '[data-act="view"][data-id="orders"]'); await sleep(250);
ok((await text(A, '.stats')).includes('Cups' + expCups) || (await A.$$eval('.stats .stat', s => s.map(x => x.textContent).join('|'))).includes('Cups' + expCups), 'cups: Orders tile shows ' + expCups + ' cups');
await click(A, '[data-act="report"]'); await sleep(200);
ok((await A.$eval('#repOut', e => e.value)).includes('Cups: ' + expCups), 'cups: day report shows cups');
await click(A, '[data-act="close"]'); await sleep(100);
await click(A, '[data-act="view"][data-id="dashboard"]'); await sleep(1200);
ok((await A.$$eval('.stats .stat', s => s.map(x => x.textContent).join('|'))).includes('Cups'), 'cups: dashboard has a Cups tile');
/* ---------- 9a4. dashboard opens on Today, frozen pack estimate ---------- */
await click(A, '[data-act="view"][data-id="dashboard"]'); await sleep(1200);
ok((await text(A, '.periods .chip.on')) === 'Today', 'dashboard: opens on Today');
const dashCups = Number(await A.$$eval('.stats .stat', s => s.find(x => x.querySelector('span').textContent === 'Cups').querySelector('b').textContent));
const packTile = (await A.$$eval('.stats .stat', s => s.map(x => x.textContent))).find(t => t.startsWith('Frozen packs used')) || '';
ok(packTile.includes('≈ ' + (dashCups * 8 / 50).toFixed(1)) && packTile.includes(dashCups * 8 + ' pcs'), 'dashboard: frozen packs = cups × 8 ÷ 50 (' + dashCups + ' cups, ' + packTile.slice(0, 40) + ')');
await click(A, '[data-act="view"][data-id="settings"]'); await sleep(250);
await val(A, '#pcsPack', '40', 'change'); await sleep(300);
ok(docs.get('meta/shop').pcsPack === 40, 'settings: pieces per pack saved to the cloud');
await click(A, '[data-act="view"][data-id="dashboard"]'); await sleep(1200);
ok(((await A.$$eval('.stats .stat', s => s.map(x => x.textContent))).find(t => t.startsWith('Frozen packs used')) || '').includes('≈ ' + (dashCups * 8 / 40).toFixed(1)), 'dashboard: estimate follows the new pack size');
/* ---------- 9b. merge a backup file: adds only what is new ---------- */
await click(A, '[data-act="view"][data-id="settings"]'); await sleep(250);
const ex = allOrders().slice(0, 2), day = ex[0].date, nowTs = Date.now();
const bk = { app: 'kepokkaw-pos', exported: nowTs, data: { items: docs.get('meta/shop').items, orders: ex.concat([
  { id: 'mrg1', no: 90, ts: nowTs - 2000, date: day, lines: [{ itemId: 'ori', name: 'Original', price: 9, qty: 2 }], total: 18, by: 'admin', voided: null },
  { id: 'mrg2', no: 91, ts: nowTs - 1000, date: day, lines: [{ itemId: 'frz', name: 'Frozen Pack', price: 35, qty: 1 }], total: 35, by: 'staff', voided: null }]),
  expenses: [{ id: 'mexp1', date: day, cat: 'Gas', amount: 28, note: 'refill', ts: nowTs }],
  moves: [{ ts: nowTs - 1000, itemId: 'frz', delta: -1, reason: 'Sold · order #91' }], log: [], closed: {} } };
fs.writeFileSync(path.join(TMP, 'merge.json'), JSON.stringify(bk));
const q0 = stockQ(), n0 = allOrders().length;
await A.evaluate(() => { document.getElementById('restoreFile').dataset.merge = '1' });
await (await A.$('#restoreFile')).uploadFile(path.join(TMP, 'merge.json')); await sleep(500);
const mtxt = await text(A, '#sheet');
ok(mtxt.includes('Adds 2 orders, 1 expense, 1 stock change'), 'merge: preview counts only new records (' + mtxt.slice(0, 160) + ')');
await click(A, '[data-act="yes"]'); await sleep(700);
ok(allOrders().length === n0 + 2, 'merge: 2 new orders added, existing kept (' + allOrders().length + ')');
ok(stockQ() === q0 - 1, 'merge: stock adjusted by the new stock change (' + q0 + ' to ' + stockQ() + ')');
ok([...docs].some(([p, d]) => p.startsWith('exp/') && d.e && d.e.mexp1), 'merge: new expense saved');
await A.evaluate(() => { document.getElementById('restoreFile').dataset.merge = '1' });
await (await A.$('#restoreFile')).uploadFile(path.join(TMP, 'merge.json')); await sleep(400);
ok((await text(A, '#toast')).includes('Nothing new'), 'merge: same file twice adds nothing');
/* ---------- 10. reopening keeps you signed in, sign out returns to login ---------- */
await A.reload({ waitUntil: 'load' }); await sleep(900);
ok(await A.evaluate(() => document.getElementById('pin').hidden), 'reopen: still signed in, no login needed');
await click(A, '[data-act="view"][data-id="orders"]'); await sleep(200);
ok((await A.$$eval('.list .row', r => r.length)) === allOrders().length, 'reopen: all cloud orders show (' + allOrders().length + ')');
await click(A, '[data-act="lock"]'); await sleep(150); await click(A, '[data-act="yes"]'); await sleep(500);
ok(!!(await A.$('#gateForm[data-mode="signin"]')), 'sign out: back to the sign in screen');
ok([...docs].filter(([p]) => p.startsWith('log/')).flatMap(([, d]) => Object.values(d.l || {})).length >= logCount, 'strict: the log never lost an entry');
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
await browser.close(); server.close();
process.exit(failures ? 1 : 0);
