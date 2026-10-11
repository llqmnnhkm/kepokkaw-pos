// Expenses screen.
function vExpenses(m) {
  const t = today();
  if (!expMonth) expMonth = t.slice(0, 7);
  const list = S.expenses
    .filter(e => e.date.slice(0, 7) === expMonth)
    .sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const tot = list.reduce((s, e) => s + e.amount, 0),
    by = {};
  list.forEach(e => (by[e.cat] = (by[e.cat] || 0) + e.amount));
  const cats = Object.entries(by).sort((a, b) => b[1] - a[1]),
    mx = Math.max(1, ...cats.map(c => c[1]));
  m.innerHTML = `<div class="wrap">
    <div class="bar"><h1 class="h1">Expenses</h1><input class="inp" type="month" id="expMonth" value="${expMonth}" style="width:auto"></div>
    <div class="panel"><h3>Add expense</h3>
      <div class="form">
        <div class="field"><label for="exDate">Date</label><input class="inp" type="date" id="exDate" value="${t}" max="${t}"></div>
        <div class="field"><label for="exCat">Category</label><select class="inp" id="exCat">${EXP_CATS.map(c => `<option>${c}</option>`).join('')}</select></div>
        <div class="field"><label for="exAmt">Amount</label><span class="money"><span class="cur">RM</span><input class="inp" type="number" inputmode="decimal" min="0" step="0.01" id="exAmt" placeholder="0.00"></span></div>
        <div class="field"><label for="exNote">Note</label><input class="inp" id="exNote" placeholder="e.g. 2 bottles oil"></div>
        <button class="btn" data-act="addexp">Add expense</button>
      </div>
    </div>
    <div class="two">
      <div class="panel"><h3>By category · total ${rm(tot)}</h3>
        ${cats.length ? cats.map(([c, v]) => `<div class="hrow"><span class="nm">${esc(c)}</span><span class="tr"><i style="width:${(v / mx) * 100}%;background:var(--exp)"></i></span><span class="v">${rm0(Math.round(v))}</span></div>`).join('') : '<div class="empty">No expenses this month.</div>'}
      </div>
      <div class="panel"><h3>Entries</h3><div class="list">
        ${
          list.length
            ? list
                .map(
                  e => `<div class="row" style="grid-template-columns:70px minmax(0,1fr) auto auto">
          <span class="lsub">${parse(e.date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}</span>
          <span class="mid"><div><b>${esc(e.cat)}</b></div><small>${esc(e.note || '')}</small></span>
          <span class="r">${rm(e.amount)}</span>
          <button class="ghost" data-act="delexp" data-id="${esc(e.id)}" aria-label="Delete">✕</button></div>`
                )
                .join('')
            : '<div class="empty">Nothing recorded yet.</div>'
        }
      </div></div>
    </div>
  </div>`;
}
