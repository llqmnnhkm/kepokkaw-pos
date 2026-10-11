// Reports and files: WhatsApp day report and summary, PDF, Excel, backup, restore and merge.
/* ---------- share text: day report, period summary ---------- */
function textSheet(title, text) {
  openModal(`<h2>${esc(title)}</h2><p class="note">Check it, then tap Send and choose WhatsApp.</p>
    <textarea id="repOut" readonly style="font-family:var(--body);font-size:14px;min-height:300px">${esc(text)}</textarea>
    <div class="acts"><button class="btn quiet" data-act="close">Close</button><button class="btn quiet" data-act="copyrep">Copy</button><button class="btn" data-act="sendrep">Send</button></div>`);
}
function pctTxt(cur, prev) {
  if (!prev) return '';
  const p = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  return ` (${p >= 0 ? '+' : ''}${p}% vs ${prevLabel()})`;
}
function periodSummary(a, b) {
  const T = totals(a, b),
    [pa, pb] = prevRange(dashP, a, b),
    P = totals(pa, pb),
    prods = itemTotals(T.ords),
    n = days(a, b).length,
    items = prods.reduce((s, p) => s + p.qty, 0);
  const L = [
    '*KEPOKKAW* · Sales summary',
    a === b
      ? parse(a).toLocaleDateString('en-MY', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : `${dlong(a)} – ${dlong(b)} (${n} days)`,
    '',
  ];
  L.push(`*Sales: ${rm(T.sales)}*${pctTxt(T.sales, P.sales)}`);
  if (payLine(T.ords, rm)) L.push(payLine(T.ords, rm));
  L.push(`Expenses: ${rm(T.cost)}${pctTxt(T.cost, P.cost)}`);
  L.push(
    `*Profit: ${T.profit < 0 ? '-' : ''}${rm(Math.abs(T.profit))}*${T.sales ? ` (${Math.round((T.profit / T.sales) * 100)}% of sales)` : ''}`
  );
  L.push(
    `Orders: ${T.ords.length}${T.ords.length ? ` · avg ${rm(T.sales / T.ords.length)}` : ''}`,
    `Cups: ${cupsIn(T.ords)}`,
    `Items sold: ${items}`
  );
  if (prods.length) {
    L.push('', '*By flavour*');
    prods.forEach(p => L.push(`• ${p.name} ×${p.qty} = ${rm(p.rev)}`));
  }
  const extra = [];
  if (n > 1) {
    const by = {};
    T.ords.forEach(o => (by[o.date] = (by[o.date] || 0) + o.total));
    const bd = Object.entries(by).sort((x, y) => y[1] - x[1])[0];
    if (bd) extra.push(`Best day: ${dlabel(bd[0])} (${rm(bd[1])})`);
    if (S.target && bd) {
      const vals = Object.values(by);
      extra.push(
        `Daily target ${money0(S.target)} hit on ${vals.filter(v => v >= S.target).length} of ${vals.length} open days`
      );
    }
  }
  if (T.ords.length) {
    const c = {};
    T.ords.forEach(o => {
      const h = new Date(o.ts).getHours();
      c[h] = (c[h] || 0) + 1;
    });
    const [h] = Object.entries(c).sort((x, y) => y[1] - x[1])[0];
    extra.push(`Busiest hour: ${hl(+h)}–${hl(+h + 1)}`);
  }
  if (extra.length) L.push('', ...extra);
  L.push('', `Sent by ${role === 'admin' ? 'Admin' : 'Staff'} at ${tm(Date.now())}`);
  return L.join('\n');
}

/* ---------- PDF report ---------- */
function pdfReport(a, b) {
  if (!window.KKPDF) {
    toast('PDF export is not available');
    return;
  }
  const d = KKPDF.create(),
    T = totals(a, b),
    prods = itemTotals(T.ords),
    ds = days(a, b);
  const RED = '#E1251B',
    INK = '#1B1413',
    MUTED = '#6E6361',
    LINE = '#E3DBD9',
    SOFT = '#F6F2F1',
    GOOD = '#1D8048',
    BAD = '#C62828',
    EXPC = '#8A7F7C',
    WHITE = '#FFFFFF';
  const items = prods.reduce((s, p) => s + p.qty, 0),
    voided = S.orders.filter(o => o.voided && o.date >= a && o.date <= b).length;
  const money = v => (v < 0 ? '-' : '') + rm(Math.abs(v));
  let y = 0;
  const ensure = h => {
    if (y + h > 790) {
      d.page();
      y = 56;
    }
  };
  const heading = t => {
    ensure(46);
    d.text(40, y, t.toUpperCase(), { size: 10, bold: true, color: RED });
    d.line(40, y + 7, 555, y + 7, LINE, 0.8);
    y += 26;
  };
  // header band + checker
  d.page();
  d.rect(0, 0, 595, 92, RED);
  d.text(40, 50, 'KEPOK KAW', { size: 28, bold: true, color: WHITE });
  d.text(40, 72, 'Sales report', { size: 11, color: WHITE });
  d.text(555, 50, a === b ? dlong(a) : dlong(a) + ' – ' + dlong(b), {
    size: 12,
    bold: true,
    color: WHITE,
    align: 'right',
  });
  d.text(555, 70, 'Generated ' + dlong(today()) + ', ' + tm(Date.now()), {
    size: 9,
    color: WHITE,
    align: 'right',
  });
  for (let i = 0; i * 7 < 595; i++) {
    d.rect(i * 7, 92 + (i % 2 ? 7 : 0), 7, 7, RED);
  }
  y = 132;
  // summary tiles
  [
    ['Sales', money(T.sales), INK],
    ['Expenses', money(T.cost), INK],
    ['Profit', money(T.profit), T.profit >= 0 ? GOOD : BAD],
    ['Orders', String(T.ords.length), INK],
    ['Average order', T.ords.length ? rm(T.sales / T.ords.length) : '-', INK],
    ['Cups', String(cupsIn(T.ords)), INK],
  ].forEach((t, i) => {
    const cx = 40 + (i % 3) * 175,
      cy = y + Math.floor(i / 3) * 66;
    d.rect(cx, cy, 165, 56, SOFT);
    d.text(cx + 12, cy + 20, t[0].toUpperCase(), { size: 8, bold: true, color: MUTED });
    d.text(cx + 12, cy + 43, t[1], { size: 17, bold: true, color: t[2] });
  });
  y += 146;
  d.text(
    40,
    y,
    (T.sales
      ? `Profit is ${Math.round((T.profit / T.sales) * 100)}% of sales.${payLine(T.ords, rm) ? ' ' + payLine(T.ords, rm) + '.' : ''}`
      : 'No sales in this period.') +
      (voided ? ` ${voided} voided order${voided === 1 ? ' is' : 's are'} not counted.` : ''),
    { size: 9, color: MUTED }
  );
  y += 30;
  // sales by flavour
  const table = (title, rows, total, barCol) => {
    heading(title);
    d.text(40, y, 'ITEM', { size: 8, bold: true, color: MUTED });
    if (rows.some(r => r.q != null))
      d.text(410, y, 'QTY', { size: 8, bold: true, color: MUTED, align: 'right' });
    d.text(490, y, 'AMOUNT', { size: 8, bold: true, color: MUTED, align: 'right' });
    d.text(555, y, 'SHARE', { size: 8, bold: true, color: MUTED, align: 'right' });
    y += 16;
    const mx = Math.max(1, ...rows.map(r => r.v));
    rows.forEach(r => {
      ensure(20);
      d.text(40, y, d.fit(r.name, 112, 10), { size: 10 });
      d.rect(160, y - 8, (210 * r.v) / mx, 8, r.c || barCol);
      if (r.q != null) d.text(410, y, String(r.q), { size: 10, align: 'right' });
      d.text(490, y, rm(r.v), { size: 10, align: 'right' });
      d.text(555, y, (total ? Math.round((r.v / total) * 100) : 0) + '%', {
        size: 10,
        color: MUTED,
        align: 'right',
      });
      y += 20;
    });
    if (!rows.length) {
      d.text(40, y, 'Nothing recorded.', { size: 10, color: MUTED });
      y += 20;
    }
    y += 14;
  };
  table(
    'Sales by flavour',
    prods.map(p => {
      const it = item(p.id);
      return { name: p.name, q: p.qty, v: p.rev, c: it ? it.color : RED };
    }),
    T.sales,
    RED
  );
  const byCat = {};
  T.exps.forEach(e => (byCat[e.cat] = (byCat[e.cat] || 0) + e.amount));
  table(
    'Expenses by category',
    Object.entries(byCat)
      .sort((x, y) => y[1] - x[1])
      .map(([c, v]) => ({ name: c, q: null, v })),
    T.cost,
    EXPC
  );
  // daily breakdown
  if (ds.length > 1) {
    heading('Daily breakdown');
    const cols = [
      [40, 'DATE', 'left'],
      [118, 'DAY', 'left'],
      [250, 'ORDERS', 'right'],
      [310, 'ITEMS', 'right'],
      [405, 'SALES', 'right'],
      [480, 'EXPENSES', 'right'],
      [555, 'PROFIT', 'right'],
    ];
    const head = () => {
      cols.forEach(([x, t, al]) => d.text(x, y, t, { size: 8, bold: true, color: MUTED, align: al }));
      y += 14;
    };
    head();
    let tq = 0;
    ds.forEach((k, i) => {
      if (y + 16 > 790) {
        d.page();
        y = 56;
        head();
      }
      const o = T.ords.filter(x => x.date === k),
        sv = o.reduce((s, x) => s + x.total, 0),
        ev = T.exps.filter(x => x.date === k).reduce((s, x) => s + x.amount, 0),
        q = o.reduce((s, x) => s + x.lines.reduce((a2, l) => a2 + l.qty, 0), 0);
      tq += q;
      if (i % 2 === 0) d.rect(36, y - 11, 523, 16, SOFT);
      d.text(40, y, dlong(k), { size: 9 });
      d.text(118, y, DOW[parse(k).getDay()], { size: 9, color: MUTED });
      d.text(250, y, String(o.length), { size: 9, align: 'right' });
      d.text(310, y, String(q), { size: 9, align: 'right' });
      d.text(405, y, rm(sv), { size: 9, align: 'right' });
      d.text(480, y, rm(ev), { size: 9, align: 'right' });
      d.text(555, y, money(sv - ev), { size: 9, align: 'right', color: sv - ev < 0 ? BAD : INK });
      y += 16;
    });
    ensure(22);
    d.line(40, y - 8, 555, y - 8, INK, 0.8);
    y += 4;
    d.text(40, y, 'Total', { size: 9, bold: true });
    d.text(250, y, String(T.ords.length), { size: 9, bold: true, align: 'right' });
    d.text(310, y, String(tq), { size: 9, bold: true, align: 'right' });
    d.text(405, y, rm(T.sales), { size: 9, bold: true, align: 'right' });
    d.text(480, y, rm(T.cost), { size: 9, bold: true, align: 'right' });
    d.text(555, y, money(T.profit), {
      size: 9,
      bold: true,
      align: 'right',
      color: T.profit < 0 ? BAD : GOOD,
    });
  }
  const n = d.pageCount;
  for (let i = 0; i < n; i++) {
    d.onPage(i);
    d.text(40, 815, 'Kepokkaw Cashier', { size: 8, color: MUTED });
    d.text(555, 815, `Page ${i + 1} of ${n}`, { size: 8, color: MUTED, align: 'right' });
  }
  saveFile(`kepokkaw-report-${a === b ? a : a + '-to-' + b}.pdf`, d.bytes(), 'application/pdf');
}

function saveFile(name, text, type) {
  const blob = new Blob([text], { type });
  let file = null;
  try {
    file = new File([blob], name, { type });
  } catch (e) {}
  if (file && navigator.canShare && navigator.canShare({ files: [file] }))
    return navigator.share({ files: [file] }).then(
      () => true,
      e => {
        if (e && e.name === 'AbortError') return false;
        return download();
      }
    );
  return Promise.resolve(download());
  function download() {
    const u = URL.createObjectURL(blob),
      el = document.createElement('a');
    el.href = u;
    el.download = name;
    document.body.appendChild(el);
    el.click();
    setTimeout(() => {
      URL.revokeObjectURL(u);
      el.remove();
    }, 3000);
    return true;
  }
}
function excel(a, b) {
  if (!window.KKXLSX) {
    toast('Excel export is not available');
    return;
  }
  const ds = days(a, b),
    T = totals(a, b),
    allO = S.orders.filter(o => o.date >= a && o.date <= b).sort((x, y) => x.ts - y.ts);
  const qty = o => o.lines.reduce((x, l) => x + l.qty, 0),
    portions = T.ords.reduce((s, o) => s + qty(o), 0),
    prods = itemTotals(T.ords);
  const byCat = {};
  T.exps.forEach(e => (byCat[e.cat] = (byCat[e.cat] || 0) + e.amount));
  const H = v => ({ v, t: 'h' }),
    M = v => ({ v, t: 'money' }),
    D = v => ({ v, t: 'date' }),
    B = v => ({ v, t: 'b' }),
    BM = v => ({ v, t: 'bm' }),
    BI = v => ({ v, t: 'bi' });
  const summary = [
    [{ v: 'Kepokkaw sales report', t: 'title' }],
    ['Period', a === b ? dlong(a) : dlong(a) + ' – ' + dlong(b)],
    ['Exported', dlong(today()) + ', ' + tm(Date.now())],
    [],
    [B('Sales'), BM(T.sales)],
    ['Cash sales', M(payTotals(T.ords).cash)],
    ['Online sales', M(payTotals(T.ords).online)],
    [B('Expenses'), BM(T.cost)],
    [B('Profit'), BM(T.profit)],
    ['Orders', T.ords.length],
    ['Voided orders', allO.length - T.ords.length],
    ['Average order', M(T.ords.length ? T.sales / T.ords.length : 0)],
    ['Cups', cupsIn(T.ords)],
    ['Items sold', portions],
    [],
    [H('Item'), H('Qty sold'), H('Sales'), H('Share of sales')],
    ...prods.map(p => [p.name, p.qty, M(p.rev), { v: T.sales ? p.rev / T.sales : 0, t: 'pct' }]),
    [],
    [H('Expense category'), H('Amount')],
    ...Object.entries(byCat)
      .sort((x, y) => y[1] - x[1])
      .map(([c, v]) => [c, M(v)]),
  ];
  const daily = [
    [H('Date'), H('Day'), H('Orders'), H('Cups'), H('Items'), H('Sales'), H('Expenses'), H('Profit')],
  ];
  ds.forEach(d => {
    const o = T.ords.filter(x => x.date === d),
      sv = o.reduce((s, x) => s + x.total, 0),
      ev = T.exps.filter(x => x.date === d).reduce((s, x) => s + x.amount, 0);
    daily.push([
      D(d),
      DOW[parse(d).getDay()],
      o.length,
      cupsIn(o),
      o.reduce((s, x) => s + qty(x), 0),
      M(sv),
      M(ev),
      M(sv - ev),
    ]);
  });
  daily.push([
    B('Total'),
    '',
    BI(T.ords.length),
    BI(cupsIn(T.ords)),
    BI(portions),
    BM(T.sales),
    BM(T.cost),
    BM(T.profit),
  ]);
  const orders = [
    [
      H('Date'),
      H('Time'),
      H('Order'),
      H('Item'),
      H('Qty'),
      H('Unit price'),
      H('Line total'),
      H('Payment'),
      H('Served by'),
      H('Status'),
      H('Void reason'),
      H('Remark'),
    ],
  ];
  allO.forEach(o =>
    o.lines.forEach(l =>
      orders.push([
        D(o.date),
        { v: o.ts, t: 'time' },
        o.no,
        l.name,
        l.qty,
        M(l.price),
        M(l.price * l.qty),
        PAY[o.pay] || '',
        o.name || (o.by === 'admin' ? 'Admin' : 'Staff'),
        o.voided ? 'Voided' : 'Sold',
        o.voided ? o.voided.reason : '',
        o.note || '',
      ])
    )
  );
  const expenses = [[H('Date'), H('Category'), H('Amount'), H('Note')]];
  T.exps
    .slice()
    .sort((x, y) => x.date.localeCompare(y.date) || x.ts - y.ts)
    .forEach(e => expenses.push([D(e.date), e.cat, M(e.amount), e.note || '']));
  const stock = [[H('Date'), H('Time'), H('Item'), H('Change'), H('Reason')]];
  S.moves
    .filter(x => {
      const d = bdate(x.ts);
      return d >= a && d <= b;
    })
    .sort((x, y) => x.ts - y.ts)
    .forEach(x => {
      const it = item(x.itemId);
      stock.push([D(bdate(x.ts)), { v: x.ts, t: 'time' }, it ? it.name : x.itemId, x.delta, x.reason]);
    });
  const act = [[H('Date'), H('Time'), H('By'), H('Action'), H('Details')]];
  (S.log || [])
    .filter(x => {
      const k = bdate(x.ts);
      return k >= a && k <= b;
    })
    .forEach(x =>
      act.push([
        D(bdate(x.ts)),
        { v: x.ts, t: 'time' },
        x.name || (x.by === 'admin' ? 'Admin' : 'Staff'),
        x.action,
        x.detail,
      ])
    );
  const bytes = KKXLSX.build([
    { name: 'Summary', cols: [26, 30, 14, 16], rows: summary },
    { name: 'Daily', cols: [14, 8, 10, 8, 10, 14, 14, 14], freeze: true, rows: daily },
    { name: 'Orders', cols: [14, 11, 8, 18, 6, 12, 12, 10, 11, 9, 24, 28], freeze: true, rows: orders },
    { name: 'Expenses', cols: [14, 20, 14, 32], freeze: true, rows: expenses },
    { name: 'Stock', cols: [14, 11, 16, 9, 28], freeze: true, rows: stock },
    { name: 'Activity', cols: [14, 11, 9, 22, 52], freeze: true, rows: act },
  ]);
  saveFile(
    `kepokkaw-${a === b ? a : a + '-to-' + b}.xlsx`,
    bytes,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}
function dayReport(date) {
  const all = S.orders.filter(o => o.date === date),
    live = all.filter(o => !o.voided),
    sales = live.reduce((s, o) => s + o.total, 0);
  const menu = S.items.map(i => i.id),
    prods = itemTotals(live).sort((x, y) => (menu.indexOf(x.id) + 1 || 99) - (menu.indexOf(y.id) + 1 || 99));
  const L = [
    `*KEPOKKAW* · ${parse(date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`,
    '',
  ];
  L.push(
    `Orders: ${live.length}${all.length - live.length ? ` (${all.length - live.length} voided)` : ''}`,
    `*Sales: ${rm(sales)}*`
  );
  if (payLine(live, rm)) L.push(payLine(live, rm));
  if (prods.length) {
    L.push('', '*Sold*');
    prods.forEach(p => L.push(`• ${p.name} ×${p.qty} = ${rm(p.rev)}`));
    L.push(`Total items: ${prods.reduce((s, p) => s + p.qty, 0)}`);
  }
  L.push(`Cups: ${cupsIn(live)}`);

  if (role === 'admin') {
    const ex = S.expenses.filter(e => e.date === date),
      cost = ex.reduce((s, e) => s + e.amount, 0);
    L.push('', `*Expenses: ${rm(cost)}*`);
    ex.forEach(e => L.push(`• ${e.cat}${e.note ? ' (' + e.note + ')' : ''} = ${rm(e.amount)}`));
    L.push(`*Profit: ${rm(sales - cost)}*`);
    if (S.target) L.push(`Target: ${rm(S.target)} (${Math.round((sales / S.target) * 100)}%)`);
  }
  const extra = [];
  if (live.length) {
    const c = {};
    live.forEach(o => {
      const h = new Date(o.ts).getHours();
      c[h] = (c[h] || 0) + 1;
    });
    const [h, n] = Object.entries(c).sort((x, y) => y[1] - x[1])[0];
    extra.push(`Busiest hour: ${hl(+h)}–${hl(+h + 1)} (${n} orders)`);
  }
  if (date === today())
    S.items.filter(i => i.stock && i.active).forEach(i => extra.push(`${i.name} left: ${i.qty}`));
  if (extra.length) L.push('', ...extra);
  L.push('', `Sent by ${role === 'admin' ? 'Admin' : 'Staff'} at ${tm(Date.now())}`);
  return L.join('\n');
}
function reportSheet(date) {
  textSheet('Day report', dayReport(date));
}
function backup() {
  const ts = Date.now(),
    body = JSON.stringify({
      app: 'kepokkaw-pos',
      exported: ts,
      data: Object.assign({}, S, { lastBackup: ts }),
    });
  return saveFile(`kepokkaw-backup-${today()}.json`, body, 'application/json').then(ok => {
    if (ok) {
      S.lastBackup = ts;
      logA('Saved backup', '');
      save();
      render();
      toast('Backup saved');
    }
    return ok;
  });
}
function restoreFrom(file, merge) {
  const rd = new FileReader();
  rd.onload = () => {
    let b;
    try {
      b = JSON.parse(rd.result);
    } catch (e) {
      toast('That file is not a Kepokkaw backup');
      return;
    }
    const d = b && b.app === 'kepokkaw-pos' && b.data;
    if (!d || !Array.isArray(d.items) || !Array.isArray(d.orders) || !Array.isArray(d.expenses)) {
      toast('That file is not a Kepokkaw backup');
      return;
    }
    if (merge) return mergeFrom(d, b);
    ask(
      'Restore this backup?',
      `Backup from ${dlabel(dkey(new Date(b.exported)))}, ${tm(b.exported)} with ${d.orders.length} orders and ${d.expenses.length} expenses. ${CLOUD ? 'Everything in the cloud is replaced, on every device.' : 'Everything on this device is replaced.'}`,
      'Restore',
      () => {
        S = CLOUD ? Object.assign(d, { sample: false }) : d;
        S.moves = S.moves || [];
        S.log = S.log || [];
        S.closed = S.closed || {};
        if (!S.pins) S.pins = { admin: '1234', staff: '0000' };
        cart = {};
        logA('Restored backup', 'from ' + dlabel(dkey(new Date(b.exported))) + ', ' + tm(b.exported));
        save();
        render();
        toast('Backup restored');
      }
    );
  };
  rd.readAsText(file);
}
// Merge: add only what this device or the cloud doesn't have yet. Nothing already here is changed or removed.
function mergeFrom(d, b) {
  if (d.sample) {
    toast('That backup only has sample data');
    return;
  }
  const ids = a => new Set((a || []).map(x => x.id));
  const mk = m => [m.ts, m.itemId, m.delta, m.reason].join('|'),
    lk = x => [x.ts, x.action, x.detail].join('|');
  const ho = ids(S.orders),
    he = ids(S.expenses),
    hi = ids(S.items),
    hm = new Set((S.moves || []).map(mk)),
    hl = new Set((S.log || []).map(lk)),
    hc = S.closed || {};
  const newO = d.orders.filter(o => o && o.id && o.date && !ho.has(o.id)),
    newE = d.expenses.filter(e => e && e.id && e.date && !he.has(e.id));
  const newI = d.items.filter(i => i && i.id && !hi.has(i.id)),
    newM = (d.moves || []).filter(m => m && m.itemId && !hm.has(mk(m)));
  const newL = (d.log || []).filter(x => x && x.ts && !hl.has(lk(x))),
    newC = Object.entries(d.closed || {}).filter(([k]) => !hc[k]);
  if (!newO.length && !newE.length && !newI.length && !newM.length) {
    toast('Nothing new in this file');
    return;
  }
  const clash = newO.filter(o => S.orders.some(x => x.date === o.date && x.no === o.no)).length;
  const parts = [
    `${newO.length} order${newO.length === 1 ? '' : 's'}`,
    `${newE.length} expense${newE.length === 1 ? '' : 's'}`,
  ];
  if (newM.length) parts.push(`${newM.length} stock change${newM.length === 1 ? '' : 's'}`);
  if (newI.length) parts.push(`${newI.length} menu item${newI.length === 1 ? '' : 's'}`);
  ask(
    'Merge this backup?',
    `Backup from ${dlabel(dkey(new Date(b.exported)))}, ${tm(b.exported)}. Adds ${parts.join(', ')}${CLOUD ? ' to the cloud, for every device' : ''}. Nothing already saved is changed or removed.${clash ? ` ${clash} of the new orders use an order number already taken that day; both are kept.` : ''}`,
    'Merge',
    () => {
      S.orders.push(...newO);
      S.expenses.push(...newE);
      newI.forEach(i => S.items.push(Object.assign({}, i, { qty: 0 })));
      S.moves = S.moves || [];
      newM.forEach(m => {
        S.moves.push(m);
        const it = item(m.itemId);
        if (it) it.qty = (+it.qty || 0) + (+m.delta || 0);
      });
      S.log = S.log || [];
      S.log.push(...newL);
      S.log.sort((x, y) => x.ts - y.ts);
      S.closed = S.closed || {};
      newC.forEach(([k, v]) => (S.closed[k] = v));
      logA('Merged backup', `from ${dlabel(dkey(new Date(b.exported)))}: ${parts.join(', ')}`);
      save();
      render();
      toast(`Merged ${parts.join(', ')}`);
    }
  );
}
