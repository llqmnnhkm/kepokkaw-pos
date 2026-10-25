// Cloud sync for Kepokkaw Cashier, built on Firebase (free Spark plan).
// The app keeps one state object S in memory, exactly as in device-only mode. This file mirrors it:
//   push(S)    compares S with the last synced copy and writes only the records that changed
//   listeners  rebuild S from Firestore whenever any device changes something, then call hooks.onData()
// Firestore keeps its own copy on the device, so the cashier keeps working with no internet and
// queued changes upload by themselves when the connection comes back.
//
// Firestore layout (one shop per Firebase project):
//   meta/owner  {uid}                       the account that set the shop up
//   meta/shop   {items, target, lowAt}      menu and settings, admin writes
//   meta/stock  {q:{itemId:n}}              pack counts, changed with increment() so two devices never overwrite each other
//   meta/closed {d:{date:{ts,by}}}          closed days
//   users/{uid} {role, name, email}         role is 'admin', 'staff' or 'removed'
//   weeks/{YYYY-MM-DD} {o:{orderId:order}}  orders, one document per week (id is that week's Monday),
//                                            so opening the app reads about 52 small documents per year of sales
//   exp/{YYYY-MM}      {e:{id:expense}}     expenses, one document per month, admin only
//   moves/{YYYY-MM}    {m:{id:move}}        stock history, one document per month
//   log/{YYYY-MM}      {l:{id:entry}}       activity log, one document per month, admin reads
(function (root) {
  const F = root.KKFB;
  const KEYS = ['o', 'e', 'm', 'l'];
  const COLL = { weeks: 'o', exp: 'e', moves: 'm', log: 'l' };
  const pad = n => String(n).padStart(2, '0');
  // Monday of the week a trading day belongs to, as YYYY-MM-DD
  function weekOf(k) {
    const [y, m, d] = k.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
    t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7);
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }

  // JSON with sorted keys, so the same record always compares equal no matter how it was built
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { if (v[k] !== undefined) o[k] = sortKeys(v[k]) }); return o }
    return v;
  }
  const canon = v => JSON.stringify(sortKeys(v));
  // fields the server fills in (upload time) are left out when comparing what changed
  const local = r => { const c = Object.assign({}, r); delete c.at; return c };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const shopOf = S => ({ items: (S.items || []).map(it => { const c = Object.assign({}, it); delete c.qty; return c }), target: S.target || 0, lowAt: S.lowAt == null ? 5 : S.lowAt, pcsCup: +S.pcsCup || 8, pcsPack: +S.pcsPack || 50 });

  function create(cfg, h) {
    const app = F.initializeApp(cfg);
    const auth = F.initializeAuth(app, { persistence: [F.indexedDBLocalPersistence, F.browserLocalPersistence] });
    let db;
    try { db = F.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: F.persistentLocalCache({ tabManager: F.persistentSingleTabManager() }) }) }
    catch (e) { db = F.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: F.memoryLocalCache() }) }
    if (cfg.emulatorHost) {
      F.connectAuthEmulator(auth, 'http://' + cfg.emulatorHost + ':9099', { disableWarnings: true });
      F.connectFirestoreEmulator(db, cfg.emulatorHost, 8080);
    }

    // which S list each kind of record lives in, which collection, and which document it goes to
    const KIND = {
      o: { list: 'orders', coll: 'weeks', doc: r => weekOf(r.date) },
      e: { list: 'expenses', coll: 'exp', doc: r => r.date.slice(0, 7) },
      m: { list: 'moves', coll: 'moves', doc: r => h.bdate(r.ts).slice(0, 7) },
      l: { list: 'log', coll: 'log', doc: r => h.bdate(r.ts).slice(0, 7) }
    };
    const blank = () => ({ o: {}, od: {}, e: {}, ed: {}, m: {}, md: {}, l: {}, ld: {}, shop: null, q: {}, c: {} });
    let coll, shop, shopFromServer, stock, closed, synced, me = null, subs = [], meSub = null, ready = false, buildT = 0, pending = 0, settingUp = false;
    function reset() { coll = { weeks: {}, exp: {}, moves: {}, log: {} }; shop = null; shopFromServer = false; stock = {}; closed = {}; synced = blank(); ready = false }
    reset();

    function status() { h.onStatus && h.onStatus({ pending, online: navigator.onLine }) }
    addEventListener('online', status); addEventListener('offline', status);
    function fail(e) { h.onError && h.onError(e) }

    /* ---------- Firestore -> S ---------- */
    function build() {
      buildT = 0;
      const S = h.getS(), next = blank(), out = {};
      for (const k of KEYS) {
        const K = KIND[k], arr = [];
        for (const [did, map] of Object.entries(coll[K.coll])) for (const [id, r] of Object.entries(map || {})) {
          if (!r || typeof r !== 'object') continue;
          if (!r.id) r.id = id;
          if (r.at && typeof r.at.toMillis === 'function') r.at = r.at.toMillis();
          arr.push(r); next[k][id] = canon(local(r)); next[k + 'd'][id] = did;
        }
        arr.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        out[K.list] = arr;
      }
      const sh = shop || {};
      out.items = (sh.items || []).map(it => Object.assign({}, it, { qty: +(stock[it.id] || 0) }));
      out.target = sh.target || 0;
      out.lowAt = sh.lowAt == null ? 5 : sh.lowAt;
      out.pcsCup = +sh.pcsCup || 8;
      out.pcsPack = +sh.pcsPack || 50;
      out.closed = Object.assign({}, closed);
      next.shop = shop ? canon(shopOf(out)) : null;
      out.items.forEach(it => next.q[it.id] = it.qty);
      for (const [d, v] of Object.entries(out.closed)) next.c[d] = canon(v);
      Object.assign(S, out);
      synced = next;
      h.onData && h.onData();
    }
    function sched() { if (ready && !buildT) buildT = setTimeout(build, 40) }

    function listen() {
      subs.forEach(u => u()); subs = []; ready = false;
      coll = { weeks: {}, exp: {}, moves: {}, log: {} };
      const admin = me.role === 'admin', parts = [];
      const watchColl = cn => parts.push(new Promise(res => {
        let first = true;
        subs.push(F.onSnapshot(F.collection(db, cn), snap => {
          snap.docChanges().forEach(c => { if (c.type === 'removed') delete coll[cn][c.doc.id]; else coll[cn][c.doc.id] = c.doc.data()[COLL[cn]] || {} });
          if (first) { first = false; res() } else sched();
        }, e => { fail(e); if (first) { first = false; res() } }));
      }));
      const watchDoc = (id, set) => parts.push(new Promise(res => {
        let first = true;
        subs.push(F.onSnapshot(F.doc(db, 'meta', id), { includeMetadataChanges: id === 'shop' }, s => {
          set(s.exists() ? s.data() : null, s);
          if (first) { first = false; res() } else sched();
        }, e => { fail(e); if (first) { first = false; res() } }));
      }));
      watchColl('weeks'); watchColl('moves');
      if (admin) { watchColl('exp'); watchColl('log') }
      watchDoc('shop', (d, s) => { shop = d; if (!s.metadata.fromCache) shopFromServer = true });
      watchDoc('stock', d => { stock = (d && d.q) || {} });
      watchDoc('closed', d => { closed = (d && d.d) || {} });
      if (admin) subs.push(F.onSnapshot(F.collection(db, 'users'), s => h.onUsers && h.onUsers(s.docs.map(d => Object.assign({ uid: d.id }, d.data()))), fail));
      Promise.all(parts).then(() => { ready = true; build(); h.onReady && h.onReady({ needsSetup: !shop && shopFromServer && admin, noMenu: !shop }); status() });
    }

    F.onAuthStateChanged(auth, u => {
      subs.forEach(x => x()); subs = []; if (meSub) { meSub(); meSub = null }
      me = null; reset();
      if (!u) { h.onSignedOut && h.onSignedOut(); return }
      meSub = F.onSnapshot(F.doc(db, 'users', u.uid), s => {
        const d = s.exists() ? s.data() : null, role = d && (d.role === 'admin' || d.role === 'staff') ? d.role : null;
        if (!role) {
          if ((s.metadata.fromCache && !d) || settingUp) return; // wait for the server before saying no
          subs.forEach(x => x()); subs = []; me = null; reset();
          h.onNoAccess && h.onNoAccess(u.email); return;
        }
        const changed = !me || me.role !== role;
        me = { uid: u.uid, email: u.email, name: d.name || u.email, role };
        h.onRole && h.onRole(me);
        if (changed) listen();
      }, fail);
    });

    /* ---------- S -> Firestore ---------- */
    function push(S) {
      if (!me || !ready) return false;
      const ops = new Map(), admin = me.role === 'admin';
      // put(cn, did, path, value, one): set one field path inside a document. With "one" (a record id) the write
      // goes in its own commit and names that record in the "last" field, because the security rules check
      // staff order changes and log entries one record at a time.
      const put = (cn, did, path, val, one) => {
        const p = cn + '/' + did + (one ? '#' + one : ''); let op = ops.get(p);
        if (!op) {
          op = { ref: F.doc(db, cn, did), data: {}, fields: [], solo: !!one }; ops.set(p, op);
          if (one) { op.data.last = one; op.fields.push('last') }
        }
        let o = op.data; for (let i = 0; i < path.length - 1; i++) o = o[path[i]] = o[path[i]] || {};
        o[path[path.length - 1]] = val; op.fields.push(path.join('.'));
      };
      for (const k of KEYS) {
        if (k === 'e' && !admin) continue;
        const K = KIND[k], list = S[K.list] || [], seen = new Set();
        for (const r of list) {
          if (!r.id) r.id = uid();
          seen.add(r.id);
          const j = canon(local(r)), prev = synced[k][r.id];
          if (prev === j) continue;
          const did = K.doc(r), old = synced[k + 'd'][r.id], cur = JSON.parse(j);
          if (k === 'l') {
            // the log only grows: an entry is sent once, by the person who wrote it, stamped with server time
            if (!prev && r.uid === me.uid) put(K.coll, did, ['l', r.id], Object.assign(cur, { at: F.serverTimestamp() }), r.id);
            if (!prev && r.uid === me.uid) { synced[k][r.id] = j; synced[k + 'd'][r.id] = did }
            continue;
          }
          if (k === 'o' && prev && old === did) {
            // an existing order: send only the fields that changed (payment, remark, void...), never the whole order
            const before = JSON.parse(prev);
            for (const f of new Set(Object.keys(before).concat(Object.keys(cur)))) {
              if (canon(before[f]) === canon(cur[f])) continue;
              put(K.coll, did, ['o', r.id, f], f in cur ? cur[f] : F.deleteField(), admin ? null : r.id);
            }
          } else {
            if (k === 'o') cur.at = F.serverTimestamp();
            const one = k === 'o' && !admin ? r.id : null;
            put(K.coll, did, [k, r.id], cur, one);
            if (old && old !== did) put(K.coll, old, [k, r.id], F.deleteField(), one);
          }
          synced[k][r.id] = j; synced[k + 'd'][r.id] = did;
        }
        if (k === 'l') continue; // log entries are never removed
        for (const id of Object.keys(synced[k])) if (!seen.has(id)) {
          put(K.coll, synced[k + 'd'][id], [k, id], F.deleteField(), k === 'o' && !admin ? id : null);
          delete synced[k][id]; delete synced[k + 'd'][id];
        }
      }
      if (me.role === 'admin') {
        const j = canon(shopOf(S));
        if (j !== synced.shop) { ops.set('meta/shop', { ref: F.doc(db, 'meta', 'shop'), data: JSON.parse(j), full: true }); synced.shop = j }
      }
      (S.items || []).forEach(it => {
        const q = +it.qty || 0, d = q - (synced.q[it.id] || 0);
        if (d) { put('meta', 'stock', ['q', it.id], F.increment(d)); synced.q[it.id] = q }
      });
      const cl = S.closed || {};
      for (const [d, v] of Object.entries(cl)) { const j = canon(v); if (synced.c[d] !== j) { put('meta', 'closed', ['d', d], JSON.parse(j)); synced.c[d] = j } }
      for (const d of Object.keys(synced.c)) if (!cl[d]) { put('meta', 'closed', ['d', d], F.deleteField()); delete synced.c[d] }

      // send in batches: at most 400 documents or about 4 MB each
      const batches = []; let b = null, n = 0, size = 0;
      for (const op of ops.values()) {
        if (op.solo && b) { batches.push(b); b = null; n = 0; size = 0 }
        if (!b) b = F.writeBatch(db);
        if (op.full) b.set(op.ref, op.data); else b.set(op.ref, op.data, { mergeFields: op.fields });
        n++; size += JSON.stringify(op.data).length;
        if (op.solo || n >= 400 || size > 4e6) { batches.push(b); b = null; n = 0; size = 0 }
      }
      if (b) batches.push(b);
      batches.forEach(x => { pending++; x.commit().then(() => { pending--; status() }, e => { pending--; status(); fail(e) }) });
      status();
      return true;
    }

    /* ---------- accounts ---------- */
    async function ownerExists() {
      try { const s = await F.getDoc(F.doc(db, 'meta', 'owner')); return s.exists() } catch (e) { return null }
    }
    async function setupOwner(email, pw, name) {
      settingUp = true;
      try {
        const c = await F.createUserWithEmailAndPassword(auth, email, pw);
        const b = F.writeBatch(db), ts = Date.now();
        b.set(F.doc(db, 'meta', 'owner'), { uid: c.user.uid, ts });
        b.set(F.doc(db, 'users', c.user.uid), { role: 'admin', owner: true, name, email, ts });
        await b.commit();
      } finally { settingUp = false }
    }
    // A second Firebase app creates the account, so the admin stays signed in on this device.
    async function addMember(email, pw, name, role) {
      const sec = F.initializeApp(cfg, 'add-' + uid());
      try {
        const sa = F.initializeAuth(sec, { persistence: F.inMemoryPersistence });
        if (cfg.emulatorHost) F.connectAuthEmulator(sa, 'http://' + cfg.emulatorHost + ':9099', { disableWarnings: true });
        const c = await F.createUserWithEmailAndPassword(sa, email, pw);
        await F.setDoc(F.doc(db, 'users', c.user.uid), { role, name, email, ts: Date.now() });
        await F.signOut(sa);
      } finally { F.deleteApp(sec).catch(() => {}) }
    }
    function setRole(id, role) { return F.setDoc(F.doc(db, 'users', id), { role }, { merge: true }) }

    return {
      push, ownerExists, setupOwner, addMember, setRole,
      signIn: (e, p) => F.signInWithEmailAndPassword(auth, e, p),
      signOut: () => F.signOut(auth),
      resetPassword: e => F.sendPasswordResetEmail(auth, e),
      me: () => me,
      isReady: () => ready
    };
  }
  root.KKCloud = { create };
})(window);
