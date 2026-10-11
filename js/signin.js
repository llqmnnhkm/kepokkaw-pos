// Cloud sync screens: sign in, shop setup, first upload, team list and sync status. Only used when firebase-config.js has a config.
/* ---------- cloud: sign in, first upload, team, sync status ---------- */
let gateT = 0,
  localCopy = null,
  renderLater = false,
  waitMenu = false,
  upChoice = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}
function showGate(html) {
  clearTimeout(gateT);
  const p = $('pin');
  p.classList.remove('out');
  p.hidden = false;
  p.innerHTML = `<div class="pin-box gate"><div class="brand">Kepok<br>Kaw</div>${html}</div>`;
}
function hideGate() {
  const p = $('pin');
  if (p.hidden) return;
  if (MOTION) {
    p.classList.add('out');
    gateT = setTimeout(() => {
      p.hidden = true;
      p.classList.remove('out');
    }, 220);
  } else p.hidden = true;
}
function loginGate(mode) {
  const setup = mode === 'setup';
  showGate(`<form class="gate-form" id="gateForm" data-mode="${mode}" novalidate>
    <h2>${setup ? 'Set up the shop' : 'Sign in'}</h2>
    ${setup ? '<p class="pin-hint">This creates the owner account. The owner can add staff and other admins in Settings. Use an email instead of a username if you want to be able to reset a forgotten password.</p><input class="inp" id="gName" placeholder="Your name" autocomplete="name">' : ''}

    <input class="inp" id="gEmail" type="text" placeholder="Username or email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false">
    <input class="inp" id="gPw" type="password" placeholder="${setup ? 'Password, at least 6 characters' : 'Password'}" autocomplete="${setup ? 'new-password' : 'current-password'}">
    <p class="gate-msg" id="gMsg" role="status"></p>
    <button class="btn" type="submit">${setup ? 'Create owner account' : 'Sign in'}</button>
    ${setup ? '<button class="linkbtn" type="button" data-act="gmode" data-id="signin">I already have an account</button>' : '<button class="linkbtn" type="button" data-act="gforgot">Forgot password?</button><button class="linkbtn" type="button" data-act="gmode" data-id="setup">First time? Set up the shop</button>'}
  </form>`);
}
function authMsg(e) {
  const c = (e && e.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c))
    return 'Wrong username or password.';
  if (c === 'auth/invalid-email') return 'That email does not look right.';
  if (c === 'auth/missing-password') return 'Enter the password.';
  if (c === 'auth/weak-password') return 'Use at least 6 characters for the password.';
  if (c === 'auth/email-already-in-use')
    return 'That username or email is already taken. If the person was removed, change their role in the Team list instead.';
  if (c === 'auth/network-request-failed')
    return 'No internet. Signing in needs a connection the first time.';
  if (c === 'auth/too-many-requests') return 'Too many tries. Wait a few minutes and try again.';
  if (c === 'permission-denied') return 'This shop is already set up. Sign in instead.';
  return 'Something went wrong (' + (c || (e && e.message) || 'unknown') + ').';
}
function safeRender() {
  const a = document.activeElement;
  if (
    a &&
    a.matches &&
    a.matches('input,select,textarea') &&
    ($('main').contains(a) || $('sheet').contains(a))
  ) {
    renderLater = true;
    return;
  }
  render();
}
document.addEventListener('focusout', () => {
  if (renderLater)
    setTimeout(() => {
      const a = document.activeElement;
      if (renderLater && !(a && a.matches && a.matches('input,select,textarea') && $('main').contains(a))) {
        renderLater = false;
        render();
      }
    }, 0);
});
function syncText() {
  if (!sync.online)
    return '<b>Offline.</b> Changes are kept on this device and upload by themselves when the internet is back.';
  return sync.pending ? '<b>Uploading changes…</b>' : '<b>All changes are saved in the cloud.</b>';
}
function updateSyncBar() {
  const b = $('syncBar'),
    show = CLOUD && cloudReady && !sync.online;
  b.hidden = !show;
  if (show)
    b.innerHTML =
      '<b>Offline.</b> <span class="long">Keep selling. Orders are saved on this device and upload when the internet is back.</span><span class="short">Orders upload when back online.</span>';
}
function openApp() {
  cloudReady = true;
  waitMenu = false;
  hideGate();
  const h = location.hash.slice(1);
  if (VIEWS.some(v => v[0] === h)) view = h;
  if (!allowed(view)) view = 'cashier';
  fx.enter = true;
  render();
  updateSyncBar();
  wake();
  try {
    navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {});
  } catch (e) {}
}
// First admin sign in on an empty shop: send this device's menu, and its sales if the owner wants.
function firstUpload() {
  const L = localCopy && Array.isArray(localCopy.items) ? localCopy : null,
    real = L && !L.sample,
    n = real && Array.isArray(L.orders) ? L.orders.length : 0;
  upChoice = all => {
    upChoice = null;
    const base = L || fresh();
    S.items = base.items.map(it => Object.assign({}, it, { qty: real ? +it.qty || 0 : 0 }));
    S.target = real ? base.target || 0 : 0;
    S.lowAt = base.lowAt == null ? 5 : base.lowAt;
    if (all) {
      S.orders = L.orders || [];
      S.expenses = L.expenses || [];
      S.moves = L.moves || [];
      S.log = L.log || [];
      S.closed = L.closed || {};
    }
    logA('Set up cloud sync', all ? `Uploaded ${n} orders from this device` : '');
    save();
    openApp();
    toast(all ? `Uploading ${n} orders` : 'Shop is ready');
  };
  if (n)
    showGate(
      `<p class="pin-hint">This device already has <b>${n} orders</b> saved. Upload them so every device can see them?</p><button class="btn" data-act="gup" data-id="1">Upload sales</button><button class="linkbtn" data-act="gup" data-id="0">Start empty, keep the menu</button>`
    );
  else upChoice(false);
}
async function startCloud() {
  S = fresh();
  S.items = [];
  showGate('<p class="pin-hint">Loading…</p>');
  $('lockBtn').setAttribute('aria-label', 'Sign out');
  {
    const lb = $('lockBtn').querySelector('.lbl');
    if (lb) lb.textContent = 'Sign out';
  }
  try {
    localCopy = await readLocal();
  } catch (e) {}
  try {
    await loadScript('firebase.js');
    await loadScript('cloud.js');
  } catch (e) {
    showGate(
      '<p class="pin-hint">Could not load sync. Open the app once with internet, then try again.</p><button class="btn" data-act="reload">Try again</button>'
    );
    return;
  }
  cloud = KKCloud.create(window.KEPOKKAW_FIREBASE, {
    getS: () => S,
    bdate,
    onSignedOut: () => {
      me = null;
      cloudReady = false;
      waitMenu = false;
      users = [];
      S = fresh();
      S.items = [];
      cart = {};
      cartNote = '';
      closeModal();
      updateSyncBar();
      showGate('<p class="pin-hint">Loading…</p>');
      cloud.ownerExists().then(x => {
        loginGate(x === false ? 'setup' : 'signin');
        if (x === null)
          $('gMsg').textContent =
            'Could not reach the shop database. Check the internet, and that the Firestore rules are published.';
      });
    },

    onNoAccess: email => {
      cloudReady = false;
      closeModal();
      showGate(
        `<p class="pin-hint"><b>${esc(shown(email))}</b> is not on this shop's team, or was removed. Ask an admin to add you in Settings.</p><button class="btn" data-act="gsignout">Sign out</button>`
      );
    },
    onRole: m => {
      const was = me;
      me = m;
      role = m.role;
      if (!was || was.role !== m.role) {
        cloudReady = false;
        closeModal();
        showGate('<p class="pin-hint">Loading sales…</p>');
      } else if (cloudReady) safeRender();
    },
    onReady: r => {
      if (r.needsSetup) return firstUpload();
      if (r.noMenu) {
        waitMenu = true;
        return showGate(
          `<p class="pin-hint">The menu has not downloaded yet. Connect this device to the internet${role === 'staff' ? ', and check that the admin has set up the shop' : ''}.</p><button class="btn" data-act="gsignout">Sign out</button>`
        );
      }
      openApp();
    },
    onData: () => {
      if (cloudReady) safeRender();
      else if (waitMenu && S.items.length) openApp();
    },
    onUsers: list => {
      users = list;
      if (cloudReady && view === 'settings') safeRender();
    },
    onStatus: s => {
      const was = sync.online;
      sync = s;
      updateSyncBar();
      if (cloudReady && view === 'settings' && was !== s.online) safeRender();
    },
    onError: e => {
      const c = (e && e.code) || '';
      toast(
        c === 'permission-denied'
          ? 'Not allowed for this account'
          : 'Sync problem: ' + (c || (e && e.message) || e)
      );
    },
  });
}
function teamPanel() {
  const list = users
    .slice()
    .sort(
      (a, b) =>
        (a.role === 'removed') - (b.role === 'removed') ||
        String(a.name || '').localeCompare(String(b.name || ''))
    );
  return `<div class="panel"><h3>Team</h3>
    <div class="list">${
      list.length
        ? list
            .map(
              u => `<div class="row" style="grid-template-columns:minmax(0,1fr) 130px">
      <span class="mid"><div><b>${esc(u.name || shown(u.email))}</b>${me && u.uid === me.uid ? ' <span class="lsub">(you)</span>' : ''}</div><small>${esc(shown(u.email))}${u.owner ? ' · owner' : ''}</small></span>
      ${
        u.owner || (me && u.uid === me.uid)
          ? '<span class="pill adm" style="justify-self:end">Admin</span>'
          : `<select class="inp" data-urole="${esc(u.uid)}" aria-label="Role for ${esc(u.name || u.email || '')}">${[
              ['admin', 'Admin'],
              ['staff', 'Staff'],
              ['removed', 'Removed'],
            ]
              .map(([v, l]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${l}</option>`)
              .join('')}</select>`
      }
    </div>`
            )
            .join('')
        : '<div class="empty">Loading team…</div>'
    }</div>
    <h3 style="margin-top:18px">Add a person</h3>
    <div class="form">
      <div class="field"><label for="tName">Name</label><input class="inp" id="tName" autocomplete="off"></div>
      <div class="field"><label for="tEmail">Username or email</label><input class="inp" id="tEmail" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="e.g. aina"></div>
      <div class="field"><label for="tPw">Password</label><input class="inp" id="tPw" autocapitalize="off" spellcheck="false" autocomplete="off" placeholder="At least 6 characters"></div>
      <div class="field"><label for="tRole">Role</label><select class="inp" id="tRole"><option value="staff">Staff</option><option value="admin">Admin</option></select></div>
      <button class="btn dark" data-act="addmember">Add person</button>
    </div>
    <p class="note" style="margin-top:10px">Each person signs in on their own device with this username (or email) and password. A username can't get a password reset email, so to change a forgotten password, set the old username to Removed and add the person again with a new one. Staff can use the cashier, see orders and check stock. Only admins see money totals, expenses and settings. Choose Removed to block someone straight away.</p>
  </div>`;
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'gateForm') return;
  e.preventDefault();
  const f = e.target,
    setup = f.dataset.mode === 'setup',
    raw = $('gEmail').value.trim(),
    email = toLogin(raw),
    pw = $('gPw').value,
    name = setup ? $('gName').value.trim() : '',
    btn = f.querySelector('button[type=submit]'),
    msg = $('gMsg');
  if (!raw || !pw || (setup && !name)) {
    msg.textContent = 'Fill in every box.';
    return;
  }
  if (email === null) {
    msg.textContent = BAD_USER;
    return;
  }
  btn.disabled = true;
  msg.textContent = setup ? 'Creating the account…' : 'Signing in…';
  (setup ? cloud.setupOwner(email, pw, name) : cloud.signIn(email, pw)).catch(err => {
    btn.disabled = false;
    msg.textContent = authMsg(err);
  });
});
