// Dashboard: periods, totals, charts, calendar heatmap and flavour trends.
const PERIODS = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['7d', '7 days'],
  ['30d', '30 days'],
  ['month', 'This month'],
  ['lastmonth', 'Last month'],
];
const PREV_LABEL = {
  today: 'yesterday',
  yesterday: 'day before',
  '7d': 'prev 7 days',
  '30d': 'prev 30 days',
  month: 'last month',
  lastmonth: 'month before',
};
function prevLabel() {
  if (dashP !== 'custom') return PREV_LABEL[dashP];
  const [a, b] = range('custom'),
    n = days(a, b).length;
  return n === 1 ? 'day before' : `prev ${n} days`;
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hl = h => (h === 0 || h === 24 ? '12am' : h < 12 ? h + 'am' : h === 12 ? '12pm' : h - 12 + 'pm');
const money0 = n => 'RM ' + Math.round(n).toLocaleString('en-MY');
const dlong = k => parse(k).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
let dashFrom = null,
  dashTo = null;
function range(p) {
  const t = today(),
    ms = t.slice(0, 8) + '01';
  if (p === 'custom') {
    if (!dashFrom || !dashTo) {
      dashFrom = dashTo = t;
    }
    return [dashFrom, dashTo];
  }
  if (p === 'today') return [t, t];
  if (p === 'yesterday') {
    const y = addDays(t, -1);
    return [y, y];
  }
  if (p === '7d') return [addDays(t, -6), t];
  if (p === '30d') return [addDays(t, -29), t];
  if (p === 'month') return [ms, t];
  const e = addDays(ms, -1);
  return [e.slice(0, 8) + '01', e];
}
function prevRange(p, a, b) {
  if (p === 'month') {
    const pe = addDays(a, -1),
      ps = pe.slice(0, 8) + '01',
      end = addDays(ps, days(a, b).length - 1);
    return [ps, end < pe ? end : pe];
  }
  if (p === 'lastmonth') {
    const pe = addDays(a, -1);
    return [pe.slice(0, 8) + '01', pe];
  }
  const n = days(a, b).length;
  return [addDays(a, -n), addDays(a, -1)];
}
function totals(a, b) {
  const ords = S.orders.filter(o => !o.voided && o.date >= a && o.date <= b),
    exps = S.expenses.filter(e => e.date >= a && e.date <= b);
  const sales = ords.reduce((s, o) => s + o.total, 0),
    cost = exps.reduce((s, e) => s + e.amount, 0);
  return { ords, exps, sales, cost, profit: sales - cost };
}
function trend(cur, prev, goodUp) {
  if (!prev) return '';
  const p = ((cur - prev) / Math.abs(prev)) * 100,
    up = cur >= prev,
    good = goodUp ? up : !up;
  return `<small class="trend ${good ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(p))}% vs ${prevLabel()}</small>`;
}
function itemTotals(ords) {
  const per = {};
  ords.forEach(o =>
    o.lines.forEach(l => {
      const p = per[l.itemId] || (per[l.itemId] = { id: l.itemId, name: l.name, qty: 0, rev: 0 });
      p.qty += l.qty;
      p.rev += l.price * l.qty;
    })
  );
  return Object.values(per).sort((x, y) => y.rev - x.rev);
}
function vDash(m) {
  const [a, b] = range(dashP),
    ds = days(a, b),
    T = totals(a, b),
    [pa, pb] = prevRange(dashP, a, b),
    P = totals(pa, pb);
  const { ords, exps, sales, cost, profit } = T,
    target = S.target || 0;
  const prods = itemTotals(ords),
    maxRev = Math.max(1, ...prods.map(p => p.rev));

  // busy hours in trading order: 6pm to midnight by default, stretched to any hour that has sales
  const hs = ords.map(o => bh(new Date(o.ts).getHours())),
    b0 = Math.min(bh(18), ...hs),
    b1 = Math.max(bh(23), ...hs),
    hours = [];
  for (let x = b0; x <= b1; x++) hours.push((x + DAY_ENDS) % 24);
  const hc = hours.map(h => ords.filter(o => new Date(o.ts).getHours() === h).length),
    maxH = Math.max(1, ...hc),
    hstep = hours.length > 12 ? 2 : 1;

  // sales vs expenses by day, with the target line
  let daily = '';
  if (ds.length > 1) {
    const sd = ds.map(d => ords.filter(o => o.date === d).reduce((s, o) => s + o.total, 0)),
      ed = ds.map(d => exps.filter(e => e.date === d).reduce((s, e) => s + e.amount, 0));
    const mx = Math.max(1, ...sd, ...ed, target * 1.08),
      step = ds.length > 14 ? 5 : 1,
      hit = target ? sd.filter(v => v >= target).length : 0,
      open = sd.filter(v => v > 0).length;
    daily = `<div class="panel"><h3>Sales vs expenses by day${target ? ` · target hit on ${hit} of ${open} open days` : ''}</h3>
      <div class="legend"><span><i style="background:var(--red)"></i>Sales</span><span><i style="background:var(--exp)"></i>Expenses</span>${target ? '<span><i style="background:transparent;border-top:2px dashed var(--ink);border-radius:0;height:0;vertical-align:3px"></i>Daily target</span>' : ''}</div>
      <div class="chart"><span class="max">${money0(mx)}</span>
      <div class="bars">${target ? `<div class="tline" style="bottom:${(target / mx) * 100}%"><span>${money0(target)}</span></div>` : ''}${ds.map((d, i) => `<div class="bcol" style="--i:${i}" title="${dlabel(d)}: sales ${rm(sd[i])}, expenses ${rm(ed[i])}"><i class="s" style="height:${(sd[i] / mx) * 100}%"></i><i class="e" style="height:${(ed[i] / mx) * 100}%"></i></div>`).join('')}</div>
      <div class="xl">${ds.map((d, i) => `<span>${(ds.length - 1 - i) % step === 0 ? parse(d).getDate() : ''}</span>`).join('')}</div></div></div>`;
  }

  // daily target progress for a single day
  let goal = '';
  if (target && a === b) {
    const pct = (sales / target) * 100;
    goal = `<div class="panel"><h3>Daily target</h3><div class="prog"><i style="width:${Math.min(100, pct)}%"></i></div>
      <p class="note" style="margin-top:8px"><b>${rm(sales)}</b> of ${rm(target)} · ${Math.round(pct)}% · ${pct >= 100 ? 'Target reached' : rm(target - sales) + ' to go'}</p></div>`;
  }

  // best day of the week: average sales per open day
  const [wa, wb] = ds.length >= 14 ? [a, b] : [addDays(today(), -55), today()],
    byDate = {};
  S.orders.forEach(o => {
    if (!o.voided && o.date >= wa && o.date <= wb) byDate[o.date] = (byDate[o.date] || 0) + o.total;
  });
  const wsum = [0, 0, 0, 0, 0, 0, 0],
    wcnt = [0, 0, 0, 0, 0, 0, 0];
  Object.entries(byDate).forEach(([d, v]) => {
    const w = parse(d).getDay();
    wsum[w] += v;
    wcnt[w]++;
  });
  const worder = [1, 2, 3, 4, 5, 6, 0],
    wavg = worder.map(w => (wcnt[w] ? wsum[w] / wcnt[w] : 0)),
    wmax = Math.max(1, ...wavg),
    wbest = wavg.indexOf(Math.max(...wavg));
  const week = `<div class="panel"><h3>Best day of the week · avg sales, ${ds.length >= 14 ? 'this period' : 'last 8 weeks'}</h3>
    ${
      Object.keys(byDate).length
        ? `<div class="chart"><span class="max">${money0(wmax)}</span>
      <div class="bars" style="height:150px">${wavg.map((v, i) => `<div class="bcol" style="--i:${i}" title="${DOW_LONG[worder[i]]}: avg ${rm(v)}"><i class="s" style="height:${(v / wmax) * 100}%;${i === wbest ? '' : 'opacity:.45'}"></i></div>`).join('')}</div>
      <div class="xl">${worder.map(w => `<span>${DOW[w]}</span>`).join('')}</div></div>
      <p class="note" style="margin-top:8px">Best: <b>${DOW_LONG[worder[wbest]]}</b>, about ${money0(wavg[wbest])} a night.</p>`
        : '<div class="empty">Not enough sales yet.</div>'
    }
  </div>`;

  // last 6 months
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = parse(today());
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(d);
  }
  let mrows = months.map(d => {
    const k = dkey(d).slice(0, 7),
      ms = k + '-01',
      me = k + '-31',
      t = totals(ms, me);
    return { d, k, ...t };
  });
  while (mrows.length > 1 && !mrows[0].sales && !mrows[0].cost) mrows.shift();
  const monthly = `<div class="panel"><h3>Monthly profit</h3><div class="tablewrap"><table class="mt">
    <thead><tr><th>Month</th><th>Sales</th><th>Expenses</th><th>Profit</th></tr></thead>
    <tbody>${mrows.map((r, i) => `<tr><td>${r.d.toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })}${i === mrows.length - 1 ? ' <span class="lsub">so far</span>' : ''}</td><td>${money0(r.sales)}</td><td>${money0(r.cost)}</td><td class="${r.profit >= 0 ? 'pos-v' : 'neg-v'}"><b>${r.profit < 0 ? '−' : ''}${money0(Math.abs(r.profit))}</b></td></tr>`).join('')}</tbody>
  </table></div></div>`;

  const best = prods[0];
  m.innerHTML = `<div class="wrap dash">
    <div class="bar"><h1 class="h1">Dashboard</h1><div class="chips dashact">
      <button class="btn quiet" data-act="sumshare"><span class="ll">Share summary</span><span class="sl">Share</span></button>
      <button class="btn quiet" data-act="pdf">PDF</button>
      <button class="btn dark" data-act="xlsx">Excel</button></div></div>
    <div class="chips periods">${PERIODS.map(([k, l]) => `<button class="chip ${k === dashP ? 'on' : ''}" data-act="dash" data-id="${k}">${l}</button>`).join('')}<button class="chip ${dashP === 'custom' ? 'on' : ''}" data-act="dash" data-id="custom">Pick date</button></div>
    ${
      dashP === 'custom'
        ? `<div class="daterow">
      <button class="chip" data-act="dstep" data-id="-1" aria-label="Earlier">‹</button>
      <div class="field"><label for="dFrom">From</label><input class="inp" type="date" id="dFrom" value="${a}" max="${today()}"></div>
      <div class="field"><label for="dTo">To</label><input class="inp" type="date" id="dTo" value="${b}" max="${today()}"></div>
      <button class="chip" data-act="dstep" data-id="1" aria-label="Later" ${b >= today() ? 'disabled' : ''}>›</button>
      ${a === b ? `<button class="btn quiet" data-act="dayorders">View orders for ${dlabel(a)}</button>` : ''}
    </div>`
        : ''
    }
    <div class="stats">
      <div class="stat" style="--i:0"><span>Sales</span><b data-n="${sales}" data-fmt="rm">${rm(sales)}</b><small>${a === b ? dlabel(a) : dlabel(a) + ' – ' + dlabel(b)}</small>${payLine(ords, money0) ? `<small class="paysplit">${payLine(ords, money0)}</small>` : ''}${trend(sales, P.sales, true)}</div>
      <div class="stat" style="--i:1"><span>Expenses</span><b data-n="${cost}" data-fmt="rm">${rm(cost)}</b><small>${exps.length} entries</small>${trend(cost, P.cost, false)}</div>
      <div class="stat" style="--i:2"><span>Profit</span><b class="${profit >= 0 ? 'pos-v' : 'neg-v'}" data-n="${profit}" data-fmt="rm">${profit < 0 ? '−' : ''}${rm(Math.abs(profit))}</b><small>${sales ? Math.round((profit / sales) * 100) + '% of sales' : '—'}</small>${trend(profit, P.profit, true)}</div>
      <div class="stat" style="--i:3"><span>Orders</span><b data-n="${ords.length}" data-fmt="int">${ords.length}</b><small>avg ${ords.length ? rm(sales / ords.length) : '—'}</small>${trend(ords.length, P.ords.length, true)}</div>
      <div class="stat" style="--i:4"><span>Cups</span><b data-n="${cupsIn(ords)}" data-fmt="int">${cupsIn(ords)}</b><small>${ords.length ? (cupsIn(ords) / ords.length).toFixed(1) + ' per order' : '—'}</small>${trend(cupsIn(ords), cupsIn(P.ords), true)}</div>
    </div>
    ${goal}
    ${daily}
    <div class="two">
      <div class="panel"><h3>By flavour${best ? ` · best seller: ${esc(best.name)}` : ''}</h3>
        ${
          prods.length
            ? prods
                .map((p, pi) => {
                  const it = item(p.id);
                  return `<div class="hrow" style="--i:${pi}"><span class="nm">${esc(p.name)}</span><span class="tr"><i style="width:${(p.rev / maxRev) * 100}%;background:${esc(it ? it.color : 'var(--red)')}"></i></span><span class="v">${rm0(p.rev)}<small>${p.qty} sold</small></span></div>`;
                })
                .join('')
            : '<div class="empty">No sales in this period.</div>'
        }
      </div>
      <div class="panel"><h3>Busy hours (orders)</h3>
        <div class="chart"><span class="max">${maxH}</span>
        <div class="bars" style="height:150px">${hc.map((c, i) => `<div class="bcol" style="--i:${i}" title="${hl(hours[i])}–${hl(hours[i] + 1)}: ${c} orders"><i class="s" style="height:${(c / maxH) * 100}%"></i></div>`).join('')}</div>
        <div class="xl">${hours.map((h, i) => `<span>${i % hstep === 0 ? hl(h) : ''}</span>`).join('')}</div></div>
      </div>
    </div>
    <div class="two">${calendarPanel(b)}${trendsPanel()}</div>
    <div class="two">${week}${monthly}</div>
  </div>`;
}

/* ---------- calendar heatmap ---------- */
let calMonth = null;
const shortRM = v => (v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(v)));
function calendarPanel(b) {
  const ym = calMonth || b.slice(0, 7),
    first = ym + '-01',
    d0 = parse(first),
    dim = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate(),
    off = (d0.getDay() + 6) % 7,
    t = today();
  const by = {};
  S.orders.forEach(o => {
    if (!o.voided && o.date.slice(0, 7) === ym) by[o.date] = (by[o.date] || 0) + o.total;
  });
  const vals = Object.values(by),
    mx = Math.max(1, ...vals),
    tot = vals.reduce((s, v) => s + v, 0),
    bestE = Object.entries(by).sort((x, y) => y[1] - x[1])[0];
  let cells = '';
  for (let i = 0; i < off; i++) cells += '<span></span>';
  for (let n = 1; n <= dim; n++) {
    const k = ym + '-' + pad(n),
      v = by[k] || 0,
      fut = k > t,
      a = v ? 0.18 + (0.82 * v) / mx : 0;
    cells += `<button class="cal-d ${a > 0.55 ? 'hot' : ''} ${fut ? 'fut' : ''} ${k === t ? 'now' : ''} ${dashP === 'custom' && k >= dashFrom && k <= dashTo ? 'sel' : ''}" style="--i:${n}" data-act="calday" data-id="${k}" ${fut ? 'disabled' : ''} title="${dlabel(k)}: ${rm(v)}"><i style="opacity:${a.toFixed(2)}"></i><span class="dn">${n}</span><span class="dv">${v ? shortRM(v) : ''}</span></button>`;
  }
  const nextYm = (() => {
    const d = parse(first);
    d.setMonth(d.getMonth() + 1);
    return dkey(d).slice(0, 7);
  })();
  return `<div class="panel">
    <div class="calhead"><button class="chip" data-act="calnav" data-id="-1" aria-label="Previous month">‹</button><h3>${d0.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}</h3><button class="chip" data-act="calnav" data-id="1" aria-label="Next month" ${nextYm > t.slice(0, 7) ? 'disabled' : ''}>›</button></div>
    <div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span class="cal-h">${d}</span>`).join('')}${cells}</div>
    <div class="cal-key">Less <i class="z"></i><i style="opacity:.25"></i><i style="opacity:.5"></i><i style="opacity:.75"></i><i></i> More<span style="margin-left:auto">${vals.length ? `${money0(tot)} this month · best day ${parse(bestE[0]).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} (${money0(bestE[1])})` : 'No sales this month'}</span></div>
    <p class="note" style="margin-top:6px">Tap a day to see that day's dashboard.</p>
  </div>`;
}

/* ---------- flavour trends: last 8 weeks ---------- */
function trendsPanel() {
  const t = today(),
    weeks = [];
  for (let w = 7; w >= 0; w--) {
    const e = addDays(t, -7 * w);
    weeks.push([addDays(e, -6), e]);
  }
  const ser = {};
  S.orders.forEach(o => {
    if (o.voided || o.date < weeks[0][0]) return;
    const wi = weeks.findIndex(([s, e]) => o.date >= s && o.date <= e);
    if (wi < 0) return;
    o.lines.forEach(l => {
      (ser[l.itemId] = ser[l.itemId] || { name: l.name, q: Array(8).fill(0) }).q[wi] += l.qty;
    });
  });
  const menu = S.items.map(i => i.id),
    ids = Object.keys(ser).sort((x, y) => (menu.indexOf(x) + 1 || 99) - (menu.indexOf(y) + 1 || 99));
  if (!ids.length)
    return '<div class="panel"><h3>Flavour trends · last 8 weeks</h3><div class="empty">Not enough sales yet.</div></div>';
  // start the chart at the first week with any sales, so a new stall does not show weeks of fake zeros
  let f0 = 0;
  while (f0 < 6 && ids.every(id => !ser[id].q[f0])) f0++;
  const shown = weeks.slice(f0),
    nW = shown.length;
  const Wd = 360,
    Hd = 180,
    L = 30,
    R = 12,
    T = 12,
    B = 24,
    mx = Math.max(1, ...ids.flatMap(id => ser[id].q)),
    x = i => L + (i * (Wd - L - R)) / (nW - 1),
    y = v => T + (Hd - T - B) * (1 - v / mx);
  const grid = [0, 0.5, 1]
    .map(f => {
      const v = Math.round(mx * f),
        yy = y(v);
      return `<line x1="${L}" x2="${Wd - R}" y1="${yy}" y2="${yy}" style="stroke:var(--line)"/><text x="${L - 6}" y="${yy + 3}" text-anchor="end">${v}</text>`;
    })
    .join('');
  const xl = shown
    .map(([s], i) =>
      nW <= 4 || (nW - 1 - i) % 2 === 0
        ? `<text x="${x(i)}" y="${Hd - 6}" text-anchor="middle">${parse(s).getDate()}/${parse(s).getMonth() + 1}</text>`
        : ''
    )
    .join('');
  const lines = ids
    .map(id => {
      const it = item(id),
        c = esc(it ? it.color : '#999'),
        q = ser[id].q.slice(f0);
      return `<polyline points="${q.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(nW - 1)}" cy="${y(q[nW - 1])}" r="3.5" fill="${c}"/>`;
    })
    .join('');
  const rows = ids
    .map(id => {
      const it = item(id),
        q = ser[id].q,
        last = q.slice(4).reduce((s, v) => s + v, 0),
        prev = q.slice(0, 4).reduce((s, v) => s + v, 0),
        p = prev ? Math.round(((last - prev) / prev) * 100) : null;
      return `<tr><td><span class="dot" style="background:${esc(it ? it.color : '#999')}"></span>${esc(ser[id].name)}</td><td>${last}</td><td>${prev}</td><td class="${p === null ? '' : p >= 0 ? 'pos-v' : 'neg-v'}">${p === null ? 'new' : (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%'}</td></tr>`;
    })
    .join('');
  return `<div class="panel"><h3>Flavour trends · items sold per week</h3>
    <svg class="trend-svg" viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="Items sold per week for each flavour over the last 8 weeks">${grid}${xl}${lines}</svg>
    <div class="tablewrap" style="margin-top:8px"><table class="mt"><thead><tr><th>Flavour</th><th>Last 4 wks</th><th>Prev 4 wks</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>`;
}
