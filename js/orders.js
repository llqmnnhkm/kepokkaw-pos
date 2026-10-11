// Orders screen: list and payment filter, order details, void, delete, and Close day.
function vOrders(m) {
  const t = today();
  if (role !== 'admin' || !ordDate) ordDate = ordDate && role === 'admin' ? ordDate : t;
  const day = S.orders.filter(o => o.date === ordDate).sort((a, b) => b.ts - a.ts);
  // payment filter: all, cash, online, or none (orders saved before payment was recorded)
  const payOf = o => (PAY[o.pay] ? o.pay : 'none'),
    dayLive = day.filter(o => !o.voided);
  const pf = [
    ['all', 'All'],
    ['cash', 'Cash'],
    ['online', 'Online'],
    ['none', 'Not recorded'],
  ]
    .map(([k, l]) => {
      const os = k === 'all' ? dayLive : dayLive.filter(o => payOf(o) === k);
      return { k, l, n: os.length, v: os.reduce((s, o) => s + o.total, 0) };
    })
    .filter(f => f.k !== 'none' || f.n);
  if (!pf.some(f => f.k === ordPay)) ordPay = 'all';
  const list = ordPay === 'all' ? day : day.filter(o => payOf(o) === ordPay);
  const live = list.filter(o => !o.voided),
    sales = live.reduce((s, o) => s + o.total, 0),
    pl = ordPay === 'all' ? '' : PAY[ordPay] ? PAY[ordPay] + ' ' : 'Not recorded ';
  m.innerHTML = `<div class="wrap">
    <div class="bar ordbar"><h1 class="h1">Orders${S.closed && S.closed[ordDate] ? '<span class="pill closed">Closed</span>' : ''}</h1>
      <div class="chips">${role === 'admin' ? `<div class="daynav"><button class="chip" data-act="oday" data-id="-1">‹ Prev</button><input class="inp" type="date" id="ordDate" value="${ordDate}" max="${t}" style="width:auto"><button class="chip" data-act="oday" data-id="1" ${ordDate >= t ? 'disabled' : ''}>Next ›</button></div>` : `<span class="note" style="align-self:center">Today, ${dlabel(t)}</span>`}
      <button class="btn quiet" data-act="report">Day report</button><button class="btn" data-act="closeday">Close day</button></div>
    </div>
    <div class="stats s3">
      <div class="stat"><span>${pl}Orders</span><b>${live.length}</b>${list.length - live.length ? `<small>${list.length - live.length} voided</small>` : ''}</div>
      ${role === 'admin' ? `<div class="stat"><span>${pl}Sales</span><b>${rm(sales)}</b>${ordPay === 'all' && payLine(live, money0) ? `<small>${payLine(live, money0)}</small>` : ''}</div>` : ''}
      <div class="stat"><span>${pl}Cups</span><b>${cupsIn(live)}</b><small>${live.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.qty, 0), 0)} items incl. add ons</small></div>
    </div>
    ${day.length ? `<div class="chips payfilter" role="group" aria-label="Filter by payment">${pf.map(f => `<button class="chip ${f.k === ordPay ? 'on' : ''}" data-act="opay" data-id="${f.k}" aria-pressed="${f.k === ordPay}">${f.k !== 'all' && f.k !== 'none' ? `<i class="pdot ${f.k}"></i>` : ''}${f.l} <span class="cnt">${f.n}${role === 'admin' && f.k !== 'all' ? ' · ' + rm(f.v) : ''}</span></button>`).join('')}</div>` : ''}
    <div class="panel"><div class="list">${
      list.length
        ? list
            .map(
              o => `<button class="row ${o.voided ? 'voided' : ''}" data-act="order" data-id="${esc(o.id)}">
        <span class="no">#${o.no}</span>
        <span class="mid"><div>${o.lines.map(l => `${esc(l.name)} ×${l.qty}`).join(', ')}</div><small>${tm(o.ts)} · ${who(o)}</small> ${PAY[o.pay] ? `<span class="pill pay ${o.pay}">${PAY[o.pay]}</span>` : ''} ${o.voided ? '<span class="pill void">Voided</span>' : ''}${o.note ? `<small class="onote">Remark: ${esc(o.note)}</small>` : ''}</span>
        <span class="r">${rm(o.total)}</span></button>`
            )
            .join('')
        : day.length
          ? `<div class="empty">No ${ordPay === 'none' ? 'orders without a payment' : PAY[ordPay] + ' orders'} on this day.</div>`
          : '<div class="empty">No orders on this day.</div>'
    }</div></div>
  </div>`;
}

function orderSheet(id) {
  const o = S.orders.find(x => x.id === id);
  if (!o) return;
  openModal(`<h2>Order #${o.no}</h2>
    <p class="note">${dlabel(o.date)}, ${tm(o.ts)} · served by ${who(o)}</p>
    <div>${o.lines.map(l => `<div class="line"><div><div class="lname">${esc(l.name)}</div><div class="lsub">${l.qty} × ${rm0(l.price)}</div></div><b>${rm(l.price * l.qty)}</b></div>`).join('')}</div>
    <div class="sum-row"><span>Total</span><div class="amt" style="font-size:40px">${rm(o.total)}</div></div>
    <div class="field"><label>Payment</label><div class="chips">${canNote(o) && !o.voided ? ['cash', 'online'].map(k => `<button class="chip ${o.pay === k ? 'on' : ''}" data-act="setpay" data-id="${esc(o.id)}" data-pay="${k}">${PAY[k]}</button>`).join('') : `<span class="note">${PAY[o.pay] || 'Not recorded'}</span>`}</div></div>
    <div class="field"><label for="noteEdit">Remark</label><input class="inp" id="noteEdit" data-id="${esc(o.id)}" value="${esc(o.note || '')}" placeholder="${canNote(o) ? 'Add a remark' : 'No remark'}" maxlength="120" autocomplete="off" ${canNote(o) ? '' : 'readonly'}></div>
    ${o.voided ? `<p class="note"><span class="pill void">Voided</span> ${tm(o.voided.ts)} · ${esc(o.voided.reason)}</p>` : ''}
    ${role === 'staff' && !o.voided ? `<p class="note">${canVoid(o) ? 'You can cancel an order for 2 minutes after it is made.' : 'Only the admin can void this order now.'}</p>` : ''}
    <div class="acts">${role === 'admin' ? `<button class="btn danger" data-act="delask" data-id="${esc(o.id)}" style="margin-right:auto">Delete</button>` : ''}<button class="btn quiet" data-act="close">Close</button>${canVoid(o) ? `<button class="btn" data-act="voidask" data-id="${esc(o.id)}">Void order</button>` : ''}</div>`);
}
function delSheet(id) {
  const o = S.orders.find(x => x.id === id);
  if (!o || role !== 'admin') return;
  openModal(`<h2>Delete order #${o.no}?</h2>
    <p class="note">Deleting removes this order completely. It will not show in Orders, the Dashboard, day reports or Excel, and it cannot be undone. To cancel a sale but keep a record of it, use <b>Void order</b> instead.</p>
    <div class="del-list">${o.lines.map(l => `<div class="line"><div><div class="lname">${esc(l.name)}</div><div class="lsub">${l.qty} × ${rm0(l.price)}</div></div><b>${rm(l.price * l.qty)}</b></div>`).join('')}</div>
    <p class="note">${dlabel(o.date)}, ${tm(o.ts)} · total ${rm(o.total)}${o.voided ? ' · already voided' : ''}</p>
    <div class="acts"><button class="btn quiet" data-act="order" data-id="${esc(o.id)}">Back</button><button class="btn danger" data-act="delstep2" data-id="${esc(o.id)}">Continue</button></div>`);
}
function delSheet2(id) {
  const o = S.orders.find(x => x.id === id);
  if (!o || role !== 'admin') return;
  openModal(`<h2>Are you sure?</h2>
    <p class="note">Type <b>${o.no}</b> below to delete order #${o.no} (${rm(o.total)}) forever.</p>
    <div class="field"><label for="delConfirm">Order number</label><input class="inp" id="delConfirm" data-no="${o.no}" inputmode="numeric" autocomplete="off" placeholder="${o.no}"></div>
    <div class="acts"><button class="btn quiet" data-act="close">Cancel</button><button class="btn del" id="delBtn" data-act="del" data-id="${esc(o.id)}" disabled>Delete forever</button></div>`);
  setTimeout(() => {
    const i = $('delConfirm');
    i && i.focus();
  }, 350);
}
function doDelete(id) {
  const o = S.orders.find(x => x.id === id),
    i = $('delConfirm');
  if (!o || role !== 'admin' || !i || i.value.trim() !== String(o.no)) return;
  const ts = Date.now();
  if (!o.voided)
    o.lines.forEach(l => {
      const it = item(l.itemId);
      if (it && it.stock) {
        it.qty += l.qty;
        S.moves.push({ ts, itemId: it.id, delta: l.qty, reason: `Deleted order #${o.no}` });
      }
    });
  logA('Deleted order', '#' + o.no + ' (' + dlabel(o.date) + ', ' + tm(o.ts) + ') · ' + rm(o.total));
  S.orders = S.orders.filter(x => x.id !== id);
  save();
  closeModal();
  render();
  toast(`Order #${o.no} deleted`);
}
function voidSheet(id) {
  const o = S.orders.find(x => x.id === id);
  openModal(`<h2>Void order #${o.no}?</h2><p class="note">The order stays in the history, crossed out, and is left out of sales. Frozen packs go back into stock.</p>
    <div class="field"><label for="vReason">Reason</label><select class="inp" id="vReason"><option>Wrong flavour keyed in</option><option>Wrong quantity</option><option>Customer cancelled</option><option>Test order</option><option>Other</option></select></div>
    <div class="acts"><button class="btn quiet" data-act="order" data-id="${esc(o.id)}">Back</button><button class="btn" data-act="void" data-id="${esc(o.id)}">Void order</button></div>`);
}
function doVoid(id) {
  const o = S.orders.find(x => x.id === id),
    ts = Date.now();
  if (!canVoid(o)) {
    closeModal();
    render();
    toast('Only the admin can void orders older than 2 minutes');
    return;
  }
  o.voided = Object.assign({ ts, reason: $('vReason').value, by: role }, myName());
  logA('Voided order', '#' + o.no + ' (' + dlabel(o.date) + ') · ' + rm(o.total) + ' · ' + o.voided.reason);
  o.lines.forEach(l => {
    const it = item(l.itemId);
    if (it && it.stock) {
      it.qty += l.qty;
      S.moves.push({ ts, itemId: it.id, delta: l.qty, reason: `Void · order #${o.no}` });
    }
  });
  save();
  closeModal();
  render();
  toast(`Order #${o.no} voided`);
}

/* ---------- close day: report + backup ---------- */
let closing = null;
const TICK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function closeSheet(date) {
  closing = { date, rep: false, bak: false };
  drawClose();
}
function drawClose() {
  const { date, rep, bak } = closing,
    live = S.orders.filter(o => o.date === date && !o.voided),
    sales = live.reduce((s, o) => s + o.total, 0),
    done = S.closed && S.closed[date];
  openModal(`<h2>Close day</h2>
    <p class="note">${parse(date).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })} · ${live.length} orders · ${cupTxt(cupsIn(live))} · ${rm(sales)}${payLine(live, rm) ? `<br><b>Cash to count: ${rm(payTotals(live).cash)}</b> · Online ${rm(payTotals(live).online)}` : ''}${done ? ` · closed at ${tm(done.ts)}` : ''}</p>
    <div class="csteps">
      <div class="cstep ${rep ? 'done' : ''}"><span class="cnum">${rep ? TICK : '1'}</span><div class="ctext"><b>Send day report</b><small>${rep ? 'Sent' : 'Choose WhatsApp to send it to the owner'}</small></div><button class="btn ${rep ? 'quiet' : ''}" data-act="closerep">${rep ? 'Again' : 'Send'}</button></div>
      <div class="cstep ${bak ? 'done' : ''}"><span class="cnum">${bak ? TICK : '2'}</span><div class="ctext"><b>Save backup</b><small>${bak ? 'Saved' : 'Keep the file in WhatsApp or Google Drive'}</small></div><button class="btn ${bak ? 'quiet' : ''}" data-act="closebak">${bak ? 'Again' : 'Save'}</button></div>
    </div>
    <div class="acts"><button class="btn ${rep && bak ? '' : 'quiet'}" data-act="close">${rep && bak ? 'Done' : 'Later'}</button></div>`);
}
function closeStep(k) {
  if (!closing) return;
  closing[k] = true;
  const d = closing.date;
  if (closing.rep && closing.bak) {
    S.closed = S.closed || {};
    if (!S.closed[d]) {
      const live = S.orders.filter(o => o.date === d && !o.voided);
      S.closed[d] = { ts: Date.now(), by: role };
      logA(
        'Closed day',
        `${dlabel(d)} · ${live.length} orders · ${rm(live.reduce((s, o) => s + o.total, 0))}`
      );
      save();
      render();
    }
  }
  if (!$('modal').hidden) drawClose();
}
