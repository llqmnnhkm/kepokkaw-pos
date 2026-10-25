// Button, input and form handling, and app start. Loaded last.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) {
    if (e.target === $('modal')) closeModal();
    return;
  }
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'view':
      view = id;
      render();
      $('main').scrollTop = 0;
      break;
    case 'add':
      addToCart(id, b);
      break;
    case 'dec':
      cart[id] = (cart[id] || 0) - 1;
      if (cart[id] <= 0) delete cart[id];
      render();
      break;
    case 'remark':
      remarkOpen = true;
      render();
      setTimeout(() => {
        const i = $('cartNote');
        i && i.focus();
      }, 50);
      break;
    case 'rchip': {
      const p = noteParts(cartNote),
        i = p.indexOf(id);
      if (i >= 0) p.splice(i, 1);
      else p.push(id);
      cartNote = p.join(', ');
      render();
      break;
    }
    case 'clear':
      cart = {};
      cartNote = '';
      remarkOpen = false;
      render();
      break;
    case 'complete':
      paySheet();
      break;
    case 'pay':
      closeModal();
      complete(id);
      break;
    case 'setpay': {
      const o = S.orders.find(x => x.id === id),
        p = b.dataset.pay;
      if (!o || !canNote(o) || o.voided || o.pay === p) break;
      const old = PAY[o.pay] || 'not recorded';
      o.pay = p;
      logA('Changed payment', '#' + o.no + ' (' + dlabel(o.date) + '): ' + old + ' → ' + PAY[p]);
      save();
      render();
      orderSheet(o.id);
      toast('Payment saved');
      break;
    }
    case 'order':
      orderSheet(id);
      break;
    case 'voidask':
      voidSheet(id);
      break;
    case 'void':
      doVoid(id);
      break;
    case 'delask':
      delSheet(id);
      break;
    case 'delstep2':
      delSheet2(id);
      break;
    case 'del':
      doDelete(id);
      break;
    case 'opay':
      ordPay = id;
      render();
      break;
    case 'oday':
      ordDate = addDays(ordDate, +id);
      if (ordDate > today()) ordDate = today();
      render();
      break;
    case 'dash':
      dashP = id;
      calMonth = null;
      fx.enter = true;
      render();
      break;
    case 'close':
      closeModal();
      break;
    case 'yes': {
      const f = pending;
      closeModal();
      f && f();
      break;
    }
    case 'lock':
      if (CLOUD) {
        ask(
          'Sign out?',
          Object.keys(cart).length
            ? 'The order on the cashier screen is not finished and will be cleared.'
            : `Signed in as ${esc(me ? me.name : '')}. Anyone using this device will need an email and password to sign in again.`,
          'Sign out',
          () => {
            cart = {};
            cloud.signOut();
          }
        );
        break;
      }
      pinRole = role === 'admin' ? 'staff' : 'admin';
      showPin();
      break;
    case 'prole':
      pinRole = id;
      pinBuf = '';
      drawPin();
      break;
    case 'pk':
      pinKey(id);
      break;
    case 'pc':
      pinBuf = '';
      drawPin();
      break;
    case 'pb':
      pinBuf = pinBuf.slice(0, -1);
      drawPin();
      break;
    case 'addexp': {
      const amt = parseFloat($('exAmt').value);
      if (!(amt > 0)) {
        toast('Enter an amount above RM 0');
        $('exAmt').focus();
        break;
      }
      const date = $('exDate').value || today();
      S.expenses.push({
        id: uid(),
        date,
        cat: $('exCat').value,
        amount: Math.round(amt * 100) / 100,
        note: $('exNote').value.trim(),
        ts: Date.now(),
      });
      logA('Added expense', $('exCat').value + ' · ' + rm(amt) + ' (' + dlabel(date) + ')');
      expMonth = date.slice(0, 7);
      save();
      render();
      toast(`Expense saved · ${rm(amt)}`);
      break;
    }
    case 'delexp': {
      const x = S.expenses.find(z => z.id === id);
      ask('Delete expense?', `${esc(x.cat)} · ${rm(x.amount)} on ${dlabel(x.date)}.`, 'Delete', () => {
        S.expenses = S.expenses.filter(z => z.id !== id);
        logA('Deleted expense', x.cat + ' · ' + rm(x.amount) + ' (' + dlabel(x.date) + ')');
        save();
        render();
        toast('Expense deleted');
      });
      break;
    }
    case 'receive': {
      const it = item(id),
        q = parseInt($('rq-' + id).value, 10),
        c = parseFloat($('rc-' + id).value);
      if (!(q > 0)) {
        toast('Enter how many packs arrived');
        break;
      }
      const ts = Date.now();
      it.qty += q;
      S.moves.push({ ts, itemId: id, delta: q, reason: 'Received stock' });
      if (c > 0)
        S.expenses.push({
          id: uid(),
          date: today(),
          cat: 'Frozen stock',
          amount: Math.round(c * 100) / 100,
          note: `${q} packs`,
          ts,
        });
      logA('Received stock', it.name + ' +' + q + (c > 0 ? ' · paid ' + rm(c) : ''));
      save();
      render();
      toast(`${q} packs added`);
      break;
    }
    case 'count': {
      const it = item(id),
        q = parseInt($('cq-' + id).value, 10);
      if (!(q >= 0)) {
        toast('Enter the number you counted');
        break;
      }
      const d = q - it.qty;
      if (!d) {
        toast('Count matches, nothing to change');
        break;
      }
      it.qty = q;
      S.moves.push({ ts: Date.now(), itemId: id, delta: d, reason: 'Stock count correction' });
      logA('Corrected stock count', it.name + ': ' + (q - d) + ' → ' + q);
      save();
      render();
      toast('Stock corrected');
      break;
    }
    case 'additem':
      S.items.push({ id: uid(), name: 'New item', price: 0, cat: 'addon', active: false, color: '#8A8A8A' });
      logA('Added item', 'New item');
      save();
      render();
      toast('Item added. Name it, price it, then tick "On menu"');
      break;
    case 'savepins': {
      const a = $('pinA').value.trim(),
        s = $('pinS').value.trim();
      if (!/^\d{4}$/.test(a) || !/^\d{4}$/.test(s)) {
        toast('PINs must be 4 digits');
        break;
      }
      if (a === s) {
        toast('Admin and staff PINs must be different');
        break;
      }
      S.pins = { admin: a, staff: s };
      logA('Changed PINs', '');
      save();
      toast('PINs saved');
      break;
    }
    case 'export': {
      const first = S.orders
        .map(o => o.date)
        .concat(S.expenses.map(e => e.date))
        .sort()[0];
      excel(first && first < today() ? first : today(), today());
      break;
    }
    case 'xlsx': {
      const [a, b] = range(dashP);
      excel(a, b);
      break;
    }
    case 'report':
      reportSheet(role === 'admin' && ordDate ? ordDate : today());
      break;
    case 'sendrep': {
      const t = $('repOut').value;
      if (navigator.share) navigator.share({ text: t }).catch(() => {});
      else {
        navigator.clipboard &&
          navigator.clipboard.writeText(t).then(
            () => toast('Copied. Paste it into WhatsApp'),
            () => {}
          );
      }
      break;
    }
    case 'copyrep': {
      const t = $('repOut');
      const fb = () => {
        t.focus();
        t.select();
        toast('Selected. Copy it from the menu');
      };
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(t.value).then(() => toast('Copied'), fb);
      else fb();
      break;
    }
    case 'backup':
      backup();
      break;
    case 'theme':
      setTheme(isDark() ? 'light' : 'dark');
      if (view === 'settings') render();
      break;
    case 'themeset':
      setTheme(id);
      render();
      break;
    case 'logall':
      logAll = !logAll;
      render();
      break;
    case 'closeday':
      closeSheet(role === 'admin' && ordDate ? ordDate : today());
      break;
    case 'closerep': {
      if (!closing) break;
      const t = dayReport(closing.date);
      if (navigator.share)
        navigator.share({ text: t }).then(
          () => closeStep('rep'),
          () => {}
        );
      else if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(t).then(
          () => {
            toast('Copied. Paste it into WhatsApp');
            closeStep('rep');
          },
          () => textSheet('Day report', t)
        );
      else textSheet('Day report', t);
      break;
    }
    case 'closebak':
      backup().then(ok => {
        if (ok) closeStep('bak');
      });
      break;
    case 'sumshare': {
      const [a, b] = range(dashP);
      textSheet('Sales summary', periodSummary(a, b));
      break;
    }
    case 'pdf': {
      const [a, b] = range(dashP);
      pdfReport(a, b);
      break;
    }
    case 'calnav': {
      const d = parse((calMonth || range(dashP)[1].slice(0, 7)) + '-01');
      d.setMonth(d.getMonth() + +id);
      calMonth = dkey(d).slice(0, 7);
      render();
      break;
    }
    case 'calday':
      dashP = 'custom';
      dashFrom = dashTo = id;
      fx.enter = true;
      render();
      $('main').scrollTo({ top: 0, behavior: MOTION ? 'smooth' : 'auto' });
      break;
    case 'dstep': {
      const [a, b] = range('custom'),
        n = days(a, b).length * +id;
      let na = addDays(a, n),
        nb = addDays(b, n);
      if (nb > today()) {
        nb = today();
        na = addDays(nb, -(days(a, b).length - 1));
      }
      dashFrom = na;
      dashTo = nb;
      calMonth = null;
      fx.enter = true;
      render();
      break;
    }
    case 'dayorders':
      ordDate = range('custom')[0];
      view = 'orders';
      render();
      $('main').scrollTop = 0;
      break;
    case 'reload':
      if (Object.keys(cart).length)
        ask(
          'Reload now?',
          'The order on the cashier screen is not finished and will be cleared.',
          'Reload',
          () => location.reload()
        );
      else location.reload();
      break;
    case 'gsignout':
      cloud && cloud.signOut();
      break;
    case 'gmode':
      loginGate(id);
      break;
    case 'gforgot': {
      const em = $('gEmail').value.trim(),
        msg = $('gMsg');
      if (!em) {
        msg.textContent = 'Type your username or email first, then tap Forgot password.';
        break;
      }
      if (!em.includes('@')) {
        msg.textContent =
          'A username has no inbox for a reset link. Ask an admin to remove this username and add you again with a new password.';
        break;
      }
      cloud.resetPassword(em).then(
        () => (msg.textContent = 'Reset link sent to ' + em + '. Check the inbox and spam folder.'),
        err => (msg.textContent = authMsg(err))
      );
      break;
    }
    case 'gup':
      if (upChoice) upChoice(id === '1');
      break;
    case 'addmember': {
      if (!CLOUD || role !== 'admin') break;
      const nm = $('tName').value.trim(),
        raw = $('tEmail').value.trim(),
        em = toLogin(raw),
        pw = $('tPw').value,
        rl = $('tRole').value;
      if (!nm || !raw) {
        toast('Enter a name and a username');
        break;
      }
      if (em === null) {
        toast(BAD_USER);
        break;
      }
      if (pw.length < 6) {
        toast('Password needs at least 6 characters');
        break;
      }
      b.disabled = true;
      cloud.addMember(em, pw, nm, rl).then(
        () => {
          logA('Added person', `${nm} (${shown(em)}) as ${rl === 'admin' ? 'Admin' : 'Staff'}`);
          save();
          render();
          toast(`${nm} added. Sign in with ${shown(em)} and the password you set.`);
        },
        err => {
          b.disabled = false;
          toast(authMsg(err));
        }
      );
      break;
    }
    case 'restore':
      $('restoreFile').value = '';
      $('restoreFile').dataset.merge = '';
      $('restoreFile').click();
      break;
    case 'mergeask':
      $('restoreFile').value = '';
      $('restoreFile').dataset.merge = '1';
      $('restoreFile').click();
      break;
    case 'clearsample':
      if (CLOUD) break;
      ask(
        'Clear sample data?',
        'All sample orders, expenses and stock history are removed. Your menu, prices and PINs stay. Frozen pack stock goes to 0.',
        'Clear data',
        () => {
          S.orders = [];
          S.expenses = [];
          S.moves = [];
          S.items.forEach(i => {
            if (i.stock) i.qty = 0;
          });
          S.sample = false;
          S.log = [];
          S.closed = {};
          cart = {};
          logA('Cleared sample data', '');
          save();
          render();
          toast('Sample data cleared');
        }
      );
      break;
    case 'restoresample':
      if (CLOUD) break;
      ask(
        'Load sample data?',
        'This replaces everything recorded on this device with 14 days of made-up sales.',
        'Load sample',
        () => {
          S = seed();
          cart = {};
          logA('Loaded sample data', '');
          save();
          render();
          toast('Sample data loaded');
        }
      );
      break;
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'cartNote') {
    cartNote = t.value;
    return;
  }
  if (t.id === 'delConfirm') {
    const b = $('delBtn');
    if (b) b.disabled = t.value.trim() !== t.dataset.no;
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'noteEdit') {
    const o = S.orders.find(x => x.id === t.dataset.id);
    if (!o || !canNote(o)) return;
    const old = o.note || '',
      v = t.value.trim();
    if (v === old) return;
    if (v) o.note = v;
    else delete o.note;
    logA(
      'Edited remark',
      '#' + o.no + ' (' + dlabel(o.date) + '): ' + (old || 'none') + ' → ' + (v || 'none')
    );
    save();
    render();
    toast('Remark saved');
    return;
  }
  if (t.dataset.urole) {
    const u = users.find(x => x.uid === t.dataset.urole);
    if (!u || role !== 'admin') return;
    const nr = t.value,
      label = { admin: 'Admin', staff: 'Staff', removed: 'Removed' };
    cloud.setRole(u.uid, nr).then(
      () => {
        logA('Changed role', `${u.name || shown(u.email)}: ${label[u.role] || u.role} → ${label[nr]}`);
        save();
        toast('Saved');
      },
      err => {
        t.value = u.role;
        toast(authMsg(err));
      }
    );
    return;
  }
  if (t.id === 'restoreFile') {
    if (t.files && t.files[0]) restoreFrom(t.files[0], t.dataset.merge === '1');
    return;
  }

  if (t.id === 'dFrom' || t.id === 'dTo') {
    const tt = today();
    let a = $('dFrom').value || tt,
      b = $('dTo').value || a;
    if (a > tt) a = tt;
    if (b > tt) b = tt;
    if (a > b) {
      if (t.id === 'dFrom') b = a;
      else a = b;
    }
    dashFrom = a;
    dashTo = b;
    calMonth = null;
    fx.enter = true;
    render();
    return;
  }
  if (t.id === 'ordDate') {
    ordDate = t.value && t.value <= today() ? t.value : today();
    render();
    return;
  }
  if (t.id === 'expMonth') {
    expMonth = t.value || today().slice(0, 7);
    render();
    return;
  }
  if (t.id === 'target') {
    const v = parseFloat(t.value),
      old = S.target || 0;
    S.target = v > 0 ? Math.round(v) : 0;
    if (old !== S.target)
      logA('Changed daily target', (old ? rm(old) : 'off') + ' → ' + (S.target ? rm(S.target) : 'off'));
    save();
    toast(S.target ? 'Target saved' : 'Target turned off');
    return;
  }
  if (t.id === 'pcsCup' || t.id === 'pcsPack') {
    const v = parseInt(t.value, 10),
      key = t.id;
    if (!(v >= 1 && v <= 500)) {
      t.value = key === 'pcsCup' ? pcsPerCup() : pcsPerPack();
      toast('Enter a number from 1 to 500');
      return;
    }
    const old = key === 'pcsCup' ? pcsPerCup() : pcsPerPack();
    if (v === old) return;
    S[key] = v;
    logA(
      'Changed frozen pack estimate',
      (key === 'pcsCup' ? 'Pieces in one cup: ' : 'Pieces in one pack: ') + old + ' → ' + v
    );
    save();
    toast('Saved');
    return;
  }
  if (t.id === 'lowAt') {
    const v = parseInt(t.value, 10);
    if (v >= 0) {
      S.lowAt = v;
      save();
      toast('Saved');
    }
    return;
  }
  if (t.dataset.edit) {
    const it = item(t.dataset.edit),
      f = t.dataset.f;
    if (f === 'price') {
      const v = parseFloat(t.value);
      if (!(v >= 0)) {
        toast('Price must be a number');
        t.value = it.price;
        return;
      }
      const old = it.price;
      it.price = Math.round(v * 100) / 100;
      if (old !== it.price) logA('Changed price', `${it.name}: ${rm0(old)} → ${rm0(it.price)}`);
    } else if (f === 'name') {
      const v = t.value.trim();
      if (!v) {
        t.value = it.name;
        return;
      }
      if (v !== it.name) logA('Renamed item', `${it.name} → ${v}`);
      it.name = v;
    } else if (f === 'active') {
      it.active = t.checked;
      logA(t.checked ? 'Added to menu' : 'Removed from menu', it.name);
    } else if (f === 'stock') {
      it.stock = t.checked;
      if (t.checked && typeof it.qty !== 'number') it.qty = 0;
      logA(t.checked ? 'Stock tracking on' : 'Stock tracking off', it.name);
    } else if (f === 'cat') {
      if (it.cat !== t.value) logA('Changed category', `${it.name}: ${it.cat} → ${t.value}`);
      it.cat = t.value;
    } else it[f] = t.value;
    save();
    toast('Saved');
  }
});

applyTheme();
if (CLOUD) startCloud();
else
  load().then(() => {
    try {
      const r = localStorage.getItem(LS_ROLE);
      if (r === 'admin' || r === 'staff') role = r;
    } catch (e) {}
    const h = location.hash.slice(1);
    if (VIEWS.some(v => v[0] === h)) view = h;
    render();
    wake();
    try {
      navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {});
    } catch (e) {}
  });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    wake();
    if (S) render();
    if (swReg) swReg.update().catch(() => {});
  }
});
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdate();
  });
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('sw.js')
      .then(r => {
        swReg = r;
      })
      .catch(() => {})
  );
}
