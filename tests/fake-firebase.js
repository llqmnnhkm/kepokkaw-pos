// Test double for firebase.js: same KKFB surface, talks to an in-memory server in the Node test runner.
(function () {
  const subs = new Map(); let nid = 0;
  window.__recv = (id, payload) => { const s = subs.get(id); if (s) s(payload) };
  const srv = op => window.__srv(JSON.stringify(op)).then(r => { r = JSON.parse(r); if (r && r.error) { const e = new Error(r.error); e.code = r.error; throw e } return r });
  const enc = v => {
    if (v && v.__sentinel) return v.__sentinel;
    if (Array.isArray(v)) return v.map(enc);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) if (v[k] !== undefined) o[k] = enc(v[k]); return o }
    return v;
  };
  const snapDoc = (id, exists, data) => ({ id, exists: () => exists, data: () => data ? JSON.parse(JSON.stringify(data)) : undefined, metadata: { fromCache: false, hasPendingWrites: false } });
  const auths = [];
  function emit(a) { a.cbs.forEach(cb => setTimeout(() => cb(a.currentUser), 0)) }
  window.KKFB = {
    initializeApp: (cfg, name) => ({ cfg, name: name || '[DEFAULT]' }),
    deleteApp: () => Promise.resolve(),
    initializeAuth: (app, opts) => {
      const mem = opts && opts.persistence && opts.persistence.mem;
      const a = { app, cbs: [], mem, currentUser: null };
      if (!mem) { try { const u = JSON.parse(localStorage.getItem('__fakeUser')); if (u) a.currentUser = u } catch (e) {} }
      auths.push(a); return a;
    },
    indexedDBLocalPersistence: {}, browserLocalPersistence: {}, inMemoryPersistence: { mem: true },
    onAuthStateChanged: (a, cb) => { a.cbs.push(cb); setTimeout(() => cb(a.currentUser), 0); return () => {} },
    signInWithEmailAndPassword: (a, email, pw) => srv({ t: 'signin', email, pw }).then(u => { a.currentUser = u; if (!a.mem) localStorage.setItem('__fakeUser', JSON.stringify(u)); emit(a); return { user: u } }),
    createUserWithEmailAndPassword: (a, email, pw) => srv({ t: 'signup', email, pw }).then(u => { a.currentUser = u; if (!a.mem) localStorage.setItem('__fakeUser', JSON.stringify(u)); emit(a); window.__authUid = u.uid; return { user: u } }),
    signOut: a => { a.currentUser = null; if (!a.mem) localStorage.removeItem('__fakeUser'); emit(a); return Promise.resolve() },
    sendPasswordResetEmail: () => Promise.resolve(),
    connectAuthEmulator: () => {},
    initializeFirestore: app => ({ app }), persistentLocalCache: () => ({}), persistentSingleTabManager: () => ({}), memoryLocalCache: () => ({}),
    connectFirestoreEmulator: () => {},
    doc: (db, ...p) => ({ kind: 'doc', path: p.join('/'), id: p[p.length - 1] }),
    collection: (db, name) => ({ kind: 'coll', path: name }),
    deleteField: () => ({ __sentinel: { __del: 1 } }),
    increment: n => ({ __sentinel: { __inc: n } }),
    serverTimestamp: () => ({ __sentinel: { __ts: 1 } }),
    onSnapshotsInSync: () => () => {},
    getDoc: ref => srv({ t: 'get', path: ref.path, uid: me() }).then(r => snapDoc(ref.id, r.exists, r.data)),
    getDocs: () => Promise.reject(new Error('unused')),
    setDoc: (ref, data, opts) => srv({ t: 'write', uid: me(), ops: [{ path: ref.path, data: enc(data), opts: opts || null }] }),
    writeBatch: () => { const ops = []; return { set(ref, data, opts) { ops.push({ path: ref.path, data: enc(data), opts: opts || null }) }, commit: () => srv({ t: 'write', uid: me(), ops }) } },
    onSnapshot: (ref, a, b, c) => {
      let next = a, err = b; if (typeof a === 'object' && a && !a.call) { next = b; err = c }
      const id = ++nid;
      subs.set(id, p => {
        if (p.error) { err && err(Object.assign(new Error(p.error), { code: p.error })); return }
        if (ref.kind === 'doc') next(snapDoc(ref.id, p.exists, p.data));
        else next({ docChanges: () => p.changes.map(ch => ({ type: ch.type, doc: snapDoc(ch.id, true, ch.data) })), docs: p.all.map(d => Object.assign(snapDoc(d.id, true, d.data), { id: d.id })) });
      });
      srv({ t: 'listen', id, path: ref.path, kind: ref.kind, uid: me() });
      return () => { subs.delete(id); srv({ t: 'unlisten', id }) };
    }
  };
  // uid of the signed in user of the default app on this page (writes are made as this user)
  function me() { const a = auths.find(x => !x.mem && x.currentUser) || auths.find(x => x.currentUser); return a && a.currentUser ? a.currentUser.uid : null }
  // secondary app writes happen through the default db with the admin's uid, which matches real Firebase
})();
