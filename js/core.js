// Shared state, helpers, storage, sample data, the screen renderer, theme, activity log, modal and toast.
const LS = 'kepokkaw-pos-v1',
  LS_ROLE = 'kepokkaw-pos-role',
  LS_THEME = 'kepokkaw-pos-theme';
const EXP_CATS = [
  'Lekor stock',
  'Frozen stock',
  'Cooking oil',
  'Gas',
  'Packaging',
  'Sauces & toppings',
  'Wages',
  'Rent',
  'Other',
];
const VIEWS = [
  ['cashier', 'Cashier'],
  ['orders', 'Orders'],
  ['dashboard', 'Dashboard'],
  ['expenses', 'Expenses'],
  ['stock', 'Stock'],
  ['settings', 'Settings'],
];
const STAFF_VIEWS = ['cashier', 'orders', 'stock'];
const UNDO_MS = 120000;
let lastOrderId = null,
  undoTimer = null;
const REMARKS = ['Takeaway', 'Extra sauce', 'No sauce', 'Sauce separate', 'Less spicy', 'Extra spicy'];
let cartNote = '',
  remarkOpen = false;
const noteParts = n =>
  n
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
let fx = {},
  renderedView = null,
  prevTotal = 0;
const MOTION = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
let ordPay = 'all';
let S,
  role = 'admin',
  view = 'cashier',
  cart = {},
  dashP = '7d',
  ordDate = null,
  expMonth = null,
  pinRole = 'staff',
  pinBuf = '',
  pending = null;
// Cloud sync is on when firebase-config.js holds a config. Then accounts replace PINs.
const CLOUD = !!window.KEPOKKAW_FIREBASE;
let cloud = null,
  me = null,
  users = [],
  sync = { pending: 0, online: true },
  cloudReady = false;

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// The stall trades 6:30pm to midnight, so a sale before 4am belongs to the night before.
const DAY_ENDS = 4;
const bdate = ts => {
  const d = new Date(ts);
  d.setHours(d.getHours() - DAY_ENDS);
  return dkey(d);
};
const today = () => bdate(Date.now());
const bh = h => (h - DAY_ENDS + 24) % 24;
const parse = k => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (k, n) => {
  const d = parse(k);
  d.setDate(d.getDate() + n);
  return dkey(d);
};
const tsOf = (k, h, m, s) => {
  const d = parse(k);
  d.setHours(h, m || 0, s || 0, 0);
  return d.getTime();
};
const esc = s =>
  String(s).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const rm = n => 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm0 = n => 'RM ' + (Number.isInteger(n) ? n : n.toFixed(2));
const tm = ts => new Date(ts).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' });
const dlabel = k =>
  parse(k).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const item = id => S.items.find(i => i.id === id);
const who = r => (r.name ? esc(r.name) : r.by === 'admin' ? 'Admin' : 'Staff');
// Every flavour sold goes in 1 cup. Add ons and frozen packs use none.
const isCupItem = id => {
  const it = S.items.find(i => i.id === id);
  return !!it && it.cat === 'flavour';
};
const cupsOf = o => o.lines.reduce((s, l) => s + (isCupItem(l.itemId) ? l.qty : 0), 0);
const cupsIn = ords => ords.reduce((s, o) => s + cupsOf(o), 0);
const cupTxt = n => `${n} cup${n === 1 ? '' : 's'}`;
// In sync mode every order, void and log entry carries who made it (checked by the security rules).
const myName = () => (CLOUD && me ? { name: me.name, uid: me.uid } : {});
// Firebase signs in with an email, so a username becomes a hidden email on this project's own domain:
// "aina" signs in as aina@<authDomain>. Nothing is ever sent to that address.
const USER_DOMAIN = CLOUD
  ? '@' + String(window.KEPOKKAW_FIREBASE.authDomain || 'kepokkaw.app').toLowerCase()
  : '';
function toLogin(v) {
  v = String(v || '')
    .trim()
    .toLowerCase();
  if (!v) return '';
  if (v.includes('@')) return v;
  return /^[a-z0-9._]{3,20}$/.test(v) ? v + USER_DOMAIN : null;
}
const shown = e => {
  e = String(e || '');
  return USER_DOMAIN && e.toLowerCase().endsWith(USER_DOMAIN) ? e.slice(0, -USER_DOMAIN.length) : e;
};
const BAD_USER = 'A username has 3 to 20 letters, numbers, dots or underscores, with no spaces.';
function days(a, b) {
  const o = [];
  for (let k = a; k <= b; k = addDays(k, 1)) o.push(k);
  return o;
}

/* ---------- storage ---------- */
const DBN = 'kepokkaw-pos',
  ST = 'kv';
let dbp = null,
  saving = Promise.resolve(),
  saveFailed = false;
function db() {
  return (
    dbp ||
    (dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }))
  );
}
function idbGet(k) {
  return db().then(
    d =>
      new Promise((res, rej) => {
        const q = d.transaction(ST).objectStore(ST).get(k);
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      })
  );
}
function idbPut(k, v) {
  return db().then(
    d =>
      new Promise((res, rej) => {
        const tx = d.transaction(ST, 'readwrite');
        tx.objectStore(ST).put(v, k);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
      })
  );
}
function save() {
  if (CLOUD) {
    if (cloud) cloud.push(S);
    return;
  }
  const json = JSON.stringify(S);
  saving = saving
    .then(() => idbPut('state', json))
    .then(
      () => {
        if (saveFailed) {
          saveFailed = false;
          toast('Saving works again');
        }
      },
      () => {
        saveFailed = true;
        toast('Could not save on this device. Back up now in Settings.');
      }
    );
  try {
    localStorage.setItem(LS, json);
  } catch (e) {
    try {
      localStorage.removeItem(LS);
    } catch (e2) {}
  }
}
async function readLocal() {
  let raw = null;
  try {
    raw = await idbGet('state');
  } catch (e) {}
  if (!raw) {
    try {
      raw = localStorage.getItem(LS);
    } catch (e) {}
  }
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {}
  }
  return null;
}
async function load() {
  S = await readLocal();
  if (!S) {
    S = fresh();
    save();
  }
}
function needsBackup() {
  if (CLOUD) return false;
  const last = S.lastBackup || 0;
  return !S.sample && S.orders.some(o => o.ts > last) && Date.now() - last > 20 * 3600e3;
}
function baseItems() {
  return [
    { id: 'ori', name: 'Original', price: 9, cat: 'flavour', active: true, color: '#D9A441' },
    { id: 'hot', name: 'Hot & Spicy', price: 10, cat: 'flavour', active: true, color: '#D2381F' },
    { id: 'egg', name: 'Salted Egg', price: 10, cat: 'flavour', active: true, color: '#EBC12F' },
    { id: 'bbq', name: 'BBQ', price: 10, cat: 'flavour', active: true, color: '#7A3B1E' },
    { id: 'chz', name: 'Cheese', price: 11, cat: 'flavour', active: true, color: '#F59E0B' },
    {
      id: 'frz',
      name: 'Frozen Pack',
      price: 35,
      cat: 'frozen',
      active: true,
      color: '#3B6E8F',
      stock: true,
      qty: 0,
    },
  ];
}

/* sample data: 14 days, seeded so it is the same every time */
function mulberry(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fresh() {
  return {
    v: 1,
    sample: false,
    items: baseItems(),
    orders: [],
    expenses: [],
    moves: [],
    pins: { admin: '1234', staff: '0000' },
    lowAt: 5,
  };
}
function seed() {
  const r = mulberry(7),
    pick = (arr, w) => {
      let x = r() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < arr.length; i++) {
        x -= w[i];
        if (x < 0) return arr[i];
      }
      return arr[arr.length - 1];
    };
  const s = {
    v: 1,
    sample: true,
    items: baseItems(),
    orders: [],
    expenses: [],
    moves: [],
    pins: { admin: '1234', staff: '0000' },
    lowAt: 5,
  };
  const frz = s.items.find(i => i.id === 'frz'),
    now = Date.now(),
    start = addDays(today(), -13);
  const flav = ['ori', 'hot', 'egg', 'bbq', 'chz'],
    fw = [30, 22, 18, 12, 18];
  const hrs = [18, 19, 20, 21, 22, 23, 24],
    hw = [2, 6, 9, 10, 9, 6, 2];
  const exp = (date, cat, amount, note) =>
    s.expenses.push({ id: uid() + s.expenses.length, date, cat, amount, note, ts: tsOf(date, 9) });
  frz.qty = 24;
  s.moves.push({ ts: tsOf(start, 9), itemId: 'frz', delta: 24, reason: 'Opening stock' });
  exp(start, 'Frozen stock', 528, '24 packs');
  s.target = 800;
  days(start, today()).forEach((day, i) => {
    const dow = parse(day).getDay();
    if (dow === 1) return;
    if (i > 0 && frz.qty < 8) {
      frz.qty += 20;
      s.moves.push({ ts: tsOf(day, 9), itemId: 'frz', delta: 20, reason: 'Received stock' });
      exp(day, 'Frozen stock', 440, '20 packs');
    }
    if (i % 2 === 0) exp(day, 'Lekor stock', 260 + Math.round(r() * 60), 'Keropok lekor');
    if (i % 3 === 0) exp(day, 'Cooking oil', 42, '2 bottles');
    if (i % 6 === 0) exp(day, 'Gas', 28, 'Gas refill');
    if (i % 7 === 0) exp(day, 'Packaging', 65, 'Cups & paper');
    if (i % 4 === 1) exp(day, 'Sauces & toppings', 48 + Math.round(r() * 20), 'Cheese sauce, seasoning');
    exp(day, 'Wages', 70, 'Staff');
    const wk = dow === 0 || dow === 6,
      n = Math.round(26 + r() * 22 + (wk ? 14 : 0)),
      list = [];
    for (let k = 0; k < n; k++) {
      const ts = tsOf(day, pick(hrs, hw), Math.floor(r() * 60), Math.floor(r() * 60));
      const nl = pick([1, 2, 3], [60, 30, 10]),
        q = {};
      for (let j = 0; j < nl; j++) {
        const f = pick(flav, fw);
        q[f] = (q[f] || 0) + (r() < 0.8 ? 1 : 2);
      }
      if (r() < 0.07) q.frz = 1;
      if (ts <= now) list.push({ ts, q });
    }
    list.sort((a, b) => a.ts - b.ts);
    let no = 0;
    list.forEach(o => {
      if (o.q.frz && frz.qty < 1) delete o.q.frz;
      const lines = Object.entries(o.q).map(([id, qty]) => {
        const it = s.items.find(x => x.id === id);
        return { itemId: id, name: it.name, price: it.price, qty };
      });
      no++;
      const ord = {
        id: uid() + no + day,
        no,
        ts: o.ts,
        date: day,
        lines,
        total: lines.reduce((a, l) => a + l.price * l.qty, 0),
        by: r() < 0.7 ? 'staff' : 'admin',
        voided: null,
      };
      if (r() < 0.12) ord.note = pick(REMARKS, [5, 3, 3, 2, 2, 1]);
      if (o.q.frz) {
        frz.qty -= 1;
        s.moves.push({ ts: o.ts, itemId: 'frz', delta: -1, reason: `Sold · order #${no}` });
      }
      s.orders.push(ord);
    });
  });
  const y = addDays(today(), -1),
    v = s.orders.find(o => o.date === y && o.no >= 5 && !o.lines.some(l => l.itemId === 'frz'));
  if (v) v.voided = { ts: v.ts + 120000, reason: 'Wrong flavour keyed in', by: 'admin' };
  return s;
}

/* ---------- bottom tab icons (phones) ---------- */
const TAB_ICON = {
  cashier:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
  orders:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M6 17v-6M11 17V5M16 17V9"/></svg>',
  expenses:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M15.5 15h2.5"/></svg>',
  stock:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
};

/* ---------- render ---------- */
function allowed(v) {
  return role === 'admin' || STAFF_VIEWS.includes(v);
}
function render() {
  if (CLOUD && !cloudReady) return;
  if (!allowed(view)) view = 'cashier';
  $('tabs').innerHTML = VIEWS.filter(([v]) => allowed(v))
    .map(([v, l]) => `<button class="${v === view ? 'on' : ''}" data-act="view" data-id="${v}">${l}</button>`)
    .join('');
  const tv = VIEWS.filter(([v]) => allowed(v)),
    bt = $('btabs');
  bt.style.setProperty('--n', tv.length);
  bt.innerHTML = tv
    .map(
      ([v, l]) =>
        `<button class="${v === view ? 'on' : ''}" data-act="view" data-id="${v}" aria-label="${l}" ${v === view ? 'aria-current="page"' : ''}>${TAB_ICON[v]}<span>${l}</span></button>`
    )
    .join('');
  $('roleChip').textContent = role === 'admin' ? 'Admin' : 'Staff';
  if (CLOUD && me) $('roleChip').title = me.name + ' · ' + shown(me.email);
  $('sampleBar').hidden = !S.sample;
  const nb = role === 'admin' && needsBackup();
  $('backupBar').hidden = !nb;
  if (nb)
    $('backupBar').innerHTML =
      `<b>${S.lastBackup ? 'Last backup ' + dlabel(dkey(new Date(S.lastBackup))) + '.' : 'No backup yet.'}</b> Save a copy of your sales in case this device is lost. <button class="ghost" data-act="backup" style="padding:4px 10px;margin-left:6px">Back up now</button>`;
  const m = $('main'),
    entering = view !== renderedView || fx.enter;
  renderedView = view;
  ({
    cashier: vCashier,
    orders: vOrders,
    dashboard: vDash,
    expenses: vExpenses,
    stock: vStock,
    settings: vSettings,
  })[view](m);
  const per = m.querySelector('.periods'),
    pon = per && per.querySelector('.chip.on');
  if (pon && per.scrollWidth > per.clientWidth)
    per.scrollLeft = pon.offsetLeft - per.clientWidth / 2 + pon.offsetWidth / 2;
  if (entering && m.firstElementChild) {
    m.firstElementChild.classList.add('enter');
    if (MOTION) countUp(m);
  }
  fx = {};
}
function countUp(root) {
  root.querySelectorAll('[data-n]').forEach(el => {
    const n = +el.dataset.n,
      f = el.dataset.fmt,
      fmt = v => (f === 'int' ? String(Math.round(v)) : (v < 0 ? '−' : '') + rm(Math.abs(v))),
      t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / 900),
        e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(n * e);
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = fmt(0);
    requestAnimationFrame(step);
  });
}
function fly(r, color) {
  const to = document.querySelector('.ticket .amt');
  if (!MOTION || !to || !r || !document.body.animate) return;
  const t = to.getBoundingClientRect(),
    d = document.createElement('div');
  const x0 = r.left + r.width / 2 - 9,
    y0 = r.top + r.height / 2 - 9,
    dx = t.left + t.width / 2 - 9 - x0,
    dy = t.top + t.height / 2 - 9 - y0;
  d.className = 'fly';
  d.style.background = color;
  d.style.left = x0 + 'px';
  d.style.top = y0 + 'px';
  document.body.appendChild(d);
  d.animate(
    [
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 90}px) scale(1.2)`, offset: 0.45 },
      { transform: `translate(${dx}px,${dy}px) scale(.35)`, opacity: 0.25 },
    ],
    { duration: 540, easing: 'cubic-bezier(.45,0,.25,1)' }
  ).onfinish = () => d.remove();
}

/* ---------- theme ---------- */
const SUN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
const MOON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
let themePref = 'auto';
try {
  const t = localStorage.getItem(LS_THEME);
  if (t === 'light' || t === 'dark') themePref = t;
} catch (e) {}
const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function isDark() {
  return themePref === 'dark' || (themePref === 'auto' && !!(darkMQ && darkMQ.matches));
}
function applyTheme() {
  const r = document.documentElement;
  if (themePref === 'auto') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', themePref);
  const b = $('themeBtn');
  if (b) {
    b.innerHTML = isDark() ? SUN : MOON;
    b.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
  }
}
function setTheme(p) {
  themePref = p;
  try {
    localStorage.setItem(LS_THEME, p);
  } catch (e) {}
  applyTheme();
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', applyTheme);

/* ---------- activity log ---------- */
let logAll = false;
function logA(action, detail) {
  S.log = S.log || [];
  S.log.push(Object.assign({ id: uid(), ts: Date.now(), by: role, action, detail: detail || '' }, myName()));
  if (S.log.length > 3000) S.log.splice(0, S.log.length - 3000);
}

/* ---------- update banner ---------- */
let swReg = null;
function showUpdate() {
  $('updateBar').hidden = false;
}

/* ---------- modal / toast / pin ---------- */
function restart(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
function openModal(html) {
  const md = $('modal'),
    was = md.hidden;
  $('sheet').innerHTML = html;
  md.hidden = false;
  if (was) restart(md, 'show');
}
function closeModal() {
  $('modal').hidden = true;
  pending = null;
}
function ask(title, body, yes, fn) {
  pending = fn;
  openModal(
    `<h2>${title}</h2><p class="note">${body}</p><div class="acts"><button class="btn quiet" data-act="close">Cancel</button><button class="btn" data-act="yes">${yes}</button></div>`
  );
}
let tt;
function toast(t) {
  const e = $('toast');
  e.textContent = t;
  e.hidden = false;
  restart(e, 'in');
  clearTimeout(tt);
  tt = setTimeout(() => (e.hidden = true), 2400);
}

function wake() {
  try {
    navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {});
  } catch (e) {}
}
