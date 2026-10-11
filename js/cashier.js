// Cashier screen: flavour tiles, the order panel, payment (Cash or Online), cups and saving an order.
function vCashier(m) {
  const items = S.items
      .filter(i => i.active && i.cat !== 'addon')
      .concat(S.items.filter(i => i.active && i.cat === 'addon')),
    t = today();
  const nToday = S.orders.filter(o => o.date === t && !o.voided).length;
  const tiles = items
    .map((it, ti) => {
      const q = cart[it.id] || 0,
        out = it.stock && it.qty <= 0,
        low = it.stock && it.qty <= S.lowAt;
      return `<button class="tile ${it.cat === 'addon' ? 'addon' : ''} ${q ? 'in' : ''} ${out ? 'out' : ''}" data-act="add" data-id="${esc(it.id)}" style="--sw:${esc(it.color || '#999')};--i:${ti}" aria-label="Add ${esc(it.name)}">
      ${q ? `<span class="badge ${fx.pop === it.id ? 'pop' : ''}">${q}</span>` : ''}
      <span class="sw"></span>
      <span class="tname">${esc(it.name)}</span>
      <span class="tmeta"><span class="tprice">${rm0(it.price)}</span>${it.stock ? `<span class="tstock ${low ? 'low' : ''}">${it.qty} left</span>` : ''}</span>
    </button>`;
    })
    .join('');
  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  const total = lines.reduce((s, [id, q]) => s + item(id).price * q, 0);
  const count = lines.reduce((s, [, q]) => s + q, 0);
  const lo = lastOrderId && S.orders.find(o => o.id === lastOrderId),
    showUndo = lo && !lo.voided && Date.now() - lo.ts <= UNDO_MS;
  const bump = total !== prevTotal && !fx.saved;
  prevTotal = total;
  const stamp =
    fx.saved && MOTION
      ? `<div class="stamp"><div class="stamp-in"><span class="tick"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><b>Order #${fx.saved.no} saved</b><small>${rm(fx.saved.total)}${PAY[fx.saved.pay] ? ' · ' + PAY[fx.saved.pay] : ''}</small></div></div>`
      : '';
  m.innerHTML = `<div class="pos">
    <div class="tiles">${tiles}</div>
    <aside class="ticket ${lines.length && (remarkOpen || cartNote) ? 'has-remark' : ''}">${stamp}
      <div class="ticket-head"><h2>Order #${nextNo(t)}</h2><span>${count ? `${cupTxt(lines.reduce((s, [id, q]) => s + (isCupItem(id) ? q : 0), 0))}<button class="ghost sm" data-act="clear">Clear</button>` : `${nToday} orders today`}</span></div>
      ${showUndo ? `<div class="undo ${fx.saved ? 'slide' : ''}"><span>Order #${lo.no} saved · ${rm(lo.total)}</span><button class="ghost" data-act="voidask" data-id="${esc(lo.id)}">Undo</button></div>` : ''}
      <div class="lines">${
        lines.length
          ? lines
              .map(([id, q]) => {
                const it = item(id);
                return `<div class="line ${fx.pop === id && fx.newLine ? 'slide' : ''}">
          <div><div class="lname">${esc(it.name)}</div><div class="lsub">${q} × ${rm0(it.price)} = ${rm(it.price * q)}</div></div>
          <div class="step"><button data-act="dec" data-id="${esc(id)}" aria-label="One less">−</button><b class="${fx.pop === id && !fx.newLine ? 'pop' : ''}">${q}</b><button data-act="add" data-id="${esc(id)}" aria-label="One more">+</button></div>
        </div>`;
              })
              .join('')
          : '<div class="empty">Tap a flavour to start the order.</div>'
      }</div>
      ${
        lines.length
          ? `<div class="remark">${
              remarkOpen || cartNote
                ? `<input class="inp" id="cartNote" placeholder="Remark, e.g. no sauce" value="${esc(cartNote)}" maxlength="120" autocomplete="off" aria-label="Remark for this order">
        <div class="rchips">${REMARKS.map(r => `<button class="chip sm ${noteParts(cartNote).includes(r) ? 'on' : ''}" data-act="rchip" data-id="${r}">${r}</button>`).join('')}</div>`
                : '<button class="linkbtn" data-act="remark">+ Add remark</button>'
            }</div>`
          : ''
      }
      <div class="sum">
        <div class="sum-row"><span>Total</span><div class="amt ${bump ? 'bump' : ''}">${rm(total)}</div></div>
        <button class="go" data-act="complete" ${lines.length ? '' : 'disabled'}>Complete order</button>
      </div>
    </aside>
  </div>`;
}

/* ---------- actions ---------- */
function addToCart(id, src) {
  const it = item(id),
    q = (cart[id] || 0) + 1;
  if (it.stock && q > it.qty) {
    toast(it.qty ? `Only ${it.qty} ${it.name} left` : `${it.name} is out of stock`);
    return;
  }
  const from =
    src && src.classList.contains('tile') ? src.querySelector('.sw').getBoundingClientRect() : null;
  fx.pop = id;
  fx.newLine = !cart[id];
  cart[id] = q;
  render();
  if (from) fly(from, it.color || '#999');
}
// Ask Cash or Online before saving the order
const PAY = { cash: 'Cash', online: 'Online' };
const PAY_ICON = {
  cash: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>',
  online:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5"/></svg>',
};
function payTotals(ords) {
  const t = { cash: 0, online: 0, none: 0 };
  ords.forEach(o => {
    t[PAY[o.pay] ? o.pay : 'none'] += o.total;
  });
  return t;
}
function payLine(ords, fmt) {
  const t = payTotals(ords);
  if (!t.cash && !t.online) return '';
  return `Cash ${fmt(t.cash)} · Online ${fmt(t.online)}${t.none ? ` · not recorded ${fmt(t.none)}` : ''}`;
}
function paySheet() {
  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  if (!lines.length) return;
  for (const [id, q] of lines) {
    const it = item(id);
    if (it.stock && it.qty < q) {
      toast(`Only ${it.qty} ${it.name} left`);
      return;
    }
  }
  const total = lines.reduce((s, [id, q]) => s + item(id).price * q, 0);
  openModal(`<h2>Payment</h2><p class="note">Order #${nextNo(today())} · <b>${rm(total)}</b></p>
    <div class="paygrid">${['cash', 'online'].map(k => `<button class="paybtn ${k}" data-act="pay" data-id="${k}">${PAY_ICON[k]}<b>${PAY[k]}</b><small>${k === 'cash' ? 'Notes and coins' : 'QR, DuitNow, e-wallet, transfer'}</small></button>`).join('')}</div>
    <div class="acts"><button class="btn quiet" data-act="close">Back</button></div>`);
}
function complete(pay) {
  const lines = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => {
      const it = item(id);
      return { itemId: id, name: it.name, price: it.price, qty };
    });
  if (!lines.length) return;
  for (const l of lines) {
    const it = item(l.itemId);
    if (it.stock && it.qty < l.qty) {
      toast(`Only ${it.qty} ${it.name} left`);
      return;
    }
  }
  const ts = Date.now(),
    date = bdate(ts),
    no = nextNo(date),
    total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const oid = uid();
  const note = cartNote.trim();
  S.orders.push(
    Object.assign(
      { id: oid, no, ts, date, lines, total, by: role, voided: null },
      PAY[pay] ? { pay } : {},
      myName(),
      note ? { note } : {}
    )
  );
  lines.forEach(l => {
    const it = item(l.itemId);
    if (it.stock) {
      it.qty -= l.qty;
      S.moves.push({ ts, itemId: it.id, delta: -l.qty, reason: `Sold · order #${no}` });
    }
  });
  cart = {};
  cartNote = '';
  remarkOpen = false;
  lastOrderId = oid;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    if (view === 'cashier' && $('modal').hidden) render();
  }, UNDO_MS + 500);
  fx.saved = { no, total, pay };
  save();
  render();
}
function nextNo(d) {
  return S.orders.reduce((m, o) => (o.date === d && o.no > m ? o.no : m), 0) + 1;
}
function canVoid(o) {
  return !o.voided && (role === 'admin' || Date.now() - o.ts <= UNDO_MS);
}
function canNote(o) {
  return role === 'admin' || o.date === today();
}
