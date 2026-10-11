// Settings screen: menu, PINs (device only mode), data, appearance, activity log, and the PIN lock screen.
function vSettings(m) {
  m.innerHTML = `<div class="wrap">
    <div class="bar"><h1 class="h1">Settings</h1></div>
    <div class="panel"><h3>Menu</h3>
      <p class="note" style="margin-bottom:8px">Changes save straight away. Old orders keep the price they were sold at.</p>
      <div class="menu-row menu-head" aria-hidden="true"><span>Item name</span><span>Price</span><span>Category</span><span>Cashier</span><span>Stock</span><span>Colour</span></div>
      ${S.items
        .map(
          it => `<div class="menu-row">
        <label class="mf"><span class="mfl">Item name</span><input class="inp" value="${esc(it.name)}" data-edit="${esc(it.id)}" data-f="name" placeholder="Item name" aria-label="Item name"></label>
        <label class="mf"><span class="mfl">Price</span><span class="money"><span class="cur">RM</span><input class="inp" type="number" inputmode="decimal" min="0" step="0.5" value="${it.price}" data-edit="${esc(it.id)}" data-f="price" aria-label="Price in RM"></span></label>
        <label class="mf"><span class="mfl">Category</span><select class="inp" data-edit="${esc(it.id)}" data-f="cat" aria-label="Category">${[
          ['flavour', 'Flavour'],
          ['frozen', 'Frozen'],
          ['addon', 'Add-on'],
          ['other', 'Other'],
        ]
          .map(([v, l]) => `<option value="${v}" ${it.cat === v ? 'selected' : ''}>${l}</option>`)
          .join('')}</select></label>
        <label class="tog"><input type="checkbox" data-edit="${esc(it.id)}" data-f="active" ${it.active ? 'checked' : ''}>On menu</label>
        <label class="tog"><input type="checkbox" data-edit="${esc(it.id)}" data-f="stock" ${it.stock ? 'checked' : ''}>Track stock</label>
        <label class="mf"><span class="mfl">Colour</span><input type="color" value="${esc(it.color || '#999999')}" data-edit="${esc(it.id)}" data-f="color" aria-label="Colour" style="width:44px;height:44px;border:0;background:none;padding:0"></label>
      </div>`
        )
        .join('')}
      <div style="margin-top:12px"><button class="btn quiet" data-act="additem">+ Add item</button></div>
    </div>
    <div class="two">
      ${
        CLOUD
          ? teamPanel()
          : `<div class="panel"><h3>PINs</h3>
        <div class="form">
          <div class="field"><label for="pinA">Admin PIN</label><input class="inp" id="pinA" inputmode="numeric" maxlength="4" value="${esc(S.pins.admin)}"></div>
          <div class="field"><label for="pinS">Staff PIN</label><input class="inp" id="pinS" inputmode="numeric" maxlength="4" value="${esc(S.pins.staff)}"></div>
          <button class="btn dark" data-act="savepins">Save PINs</button>
        </div>
        <p class="note" style="margin-top:10px">Staff can use the cashier, see today's orders and check stock. Only the admin sees money totals, expenses and settings, and only the admin can void an order.</p>
      </div>`
      }
      <div class="panel"><h3>Data</h3>${CLOUD ? `<p class="note" style="margin-bottom:12px">${syncText()}</p>` : ''}
        <div class="form" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
          <button class="btn" data-act="backup">Back up everything</button>
          <button class="btn quiet" data-act="mergeask">Merge from backup</button>
          <button class="btn quiet" data-act="restore">Restore from backup</button>
          <button class="btn dark" data-act="export">Excel report (all data)</button>
          <div class="field"><label for="target">Daily sales target</label><span class="money"><span class="cur">RM</span><input class="inp" type="number" inputmode="decimal" min="0" id="target" value="${S.target || ''}" placeholder="Off"></span></div>
          <div class="field"><label for="lowAt">Warn when stock is at or below</label><input class="inp" type="number" min="0" id="lowAt" value="${S.lowAt}"></div>
        </div>
        <p class="note" style="margin-top:10px">${CLOUD ? 'Sales are saved in the cloud and shared by every signed in device. A backup file is still a good extra copy. ' : ''}<b>Back up everything</b> saves one file with all orders, expenses, stock and settings. Send it to WhatsApp or Google Drive at the end of each day. <b>Merge</b> adds the orders, expenses and stock changes from a backup that aren't saved here yet, and keeps everything already here. <b>Restore</b> replaces everything with the backup, for a new or reset device. The Excel report opens in Excel, Google Sheets or Numbers. For one period only, use Export to Excel on the Dashboard.<br>Last backup: ${S.lastBackup ? dlabel(dkey(new Date(S.lastBackup))) + ', ' + tm(S.lastBackup) : 'never'}</p>
        <input type="file" id="restoreFile" hidden>
        <div class="chips" style="margin-top:12px" ${CLOUD ? 'hidden' : ''}>
          ${S.sample ? '<button class="btn" data-act="clearsample">Clear sample data</button>' : ''}
          ${S.sample || !S.orders.length ? '<button class="btn quiet" data-act="restoresample">Load sample data</button>' : ''}
        </div>
      </div>
    </div>
    <div class="panel"><h3>Appearance</h3>
      <div class="chips">${[
        ['auto', 'Auto'],
        ['light', 'Light'],
        ['dark', 'Dark'],
      ]
        .map(
          ([k, l]) =>
            `<button class="chip ${themePref === k ? 'on' : ''}" data-act="themeset" data-id="${k}">${l}</button>`
        )
        .join('')}</div>
      <p class="note" style="margin-top:10px">Auto follows this device's setting. Light is easier to read under bright lights, dark is gentler at night. You can also tap the sun or moon at the top of the screen.</p>
    </div>
    ${activityPanel()}
  </div>`;
}

function activityPanel() {
  const L = (S.log || []).slice().reverse(),
    shown = logAll ? L : L.slice(0, 40);
  return `<div class="panel"><h3>Activity log · ${L.length} entr${L.length === 1 ? 'y' : 'ies'}</h3>
    ${
      L.length
        ? `<div class="list">${shown.map(x => `<div class="row logrow" style="grid-template-columns:84px minmax(0,1fr) auto"><span class="lsub">${parse(dkey(new Date(x.ts))).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}<br>${tm(x.ts)}</span><span class="mid"><div><b>${esc(x.action)}</b></div><small>${esc(x.detail)}</small></span><span class="pill ${x.by === 'admin' ? 'adm' : 'stf'}">${who(x)}</span></div>`).join('')}</div>
      ${L.length > 40 ? `<button class="btn quiet" data-act="logall" style="margin-top:10px">${logAll ? 'Show less' : 'Show all ' + L.length}</button>` : ''}`
        : '<div class="empty">Nothing yet. Voids, deletes, price changes, stock changes and sign-ins show up here.</div>'
    }
  </div>`;
}

function showPin() {
  pinBuf = '';
  const p = $('pin');
  p.classList.remove('out');
  p.hidden = false;
  drawPin();
  restart(p, 'show');
}
function drawPin(pop) {
  $('pin').innerHTML = `<div class="pin-box">
    <div class="brand">Kepok<br>Kaw</div>
    <div class="pin-roles"><button class="${pinRole === 'staff' ? 'on' : ''}" data-act="prole" data-id="staff">Staff</button><button class="${pinRole === 'admin' ? 'on' : ''}" data-act="prole" data-id="admin">Admin</button></div>
    <div class="dots" id="dots">${[0, 1, 2, 3].map(i => `<i class="${i < pinBuf.length ? 'f' : ''} ${pop && i === pinBuf.length - 1 ? 'pop' : ''}"></i>`).join('')}</div>
    <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-act="pk" data-id="${n}">${n}</button>`).join('')}<button class="t" data-act="pc">Clear</button><button data-act="pk" data-id="0">0</button><button class="t" data-act="pb">Delete</button></div>
  </div>`;
}
function pinKey(d) {
  if (pinBuf.length >= 4) return;
  pinBuf += d;
  drawPin(true);
  if (pinBuf.length === 4) {
    if (pinBuf === S.pins[pinRole]) {
      role = pinRole;
      try {
        localStorage.setItem(LS_ROLE, role);
      } catch (e) {}
      logA('Signed in', 'as ' + (role === 'admin' ? 'Admin' : 'Staff'));
      save();
      const p = $('pin');
      if (MOTION) {
        p.classList.add('out');
        setTimeout(() => {
          p.hidden = true;
          p.classList.remove('out');
        }, 220);
      } else p.hidden = true;
      cart = {};
      view = 'cashier';
      render();
      toast(`Signed in as ${role === 'admin' ? 'Admin' : 'Staff'}`);
    } else {
      const d = $('dots');
      d.classList.add('shake');
      setTimeout(() => {
        pinBuf = '';
        drawPin();
      }, 350);
    }
  }
}
