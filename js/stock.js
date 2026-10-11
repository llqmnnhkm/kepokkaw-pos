// Stock screen: pack counts, receiving stock and count corrections.
function vStock(m) {
  const st = S.items.filter(i => i.stock);
  m.innerHTML = `<div class="wrap">
    <div class="bar"><h1 class="h1">Stock</h1></div>
    ${
      st.length
        ? st
            .map(it => {
              const mv = S.moves
                .filter(x => x.itemId === it.id)
                .sort((a, b) => b.ts - a.ts)
                .slice(0, 25);
              const state =
                it.qty <= 0
                  ? '<span class="pill void">Out of stock</span>'
                  : it.qty <= S.lowAt
                    ? '<span class="pill low">Running low</span>'
                    : '<span class="pill ok">OK</span>';
              return `<div class="two">
        <div class="panel" style="display:grid;gap:14px;align-content:start">
          <h3>${esc(it.name)}</h3>
          <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="big-stock">${it.qty}</span><span class="note">packs left</span>${state}</div>
          ${
            role === 'admin'
              ? `
          <div class="form">
            <div class="field"><label for="rq-${esc(it.id)}">Packs received</label><input class="inp" type="number" inputmode="numeric" min="1" id="rq-${esc(it.id)}" placeholder="20"></div>
            <div class="field"><label for="rc-${esc(it.id)}">Cost paid</label><span class="money"><span class="cur">RM</span><input class="inp" type="number" inputmode="decimal" min="0" id="rc-${esc(it.id)}" placeholder="Optional"></span></div>
            <button class="btn" data-act="receive" data-id="${esc(it.id)}">Add stock</button>
          </div>
          <p class="note">Cost paid is also saved as a "Frozen stock" expense.</p>
          <div class="form">
            <div class="field"><label for="cq-${esc(it.id)}">Counted on shelf</label><input class="inp" type="number" inputmode="numeric" min="0" id="cq-${esc(it.id)}" placeholder="${it.qty}"></div>
            <button class="btn quiet" data-act="count" data-id="${esc(it.id)}">Correct count</button>
          </div>`
              : '<p class="note">Selling a pack at the cashier takes it off stock. Ask the admin to add new stock.</p>'
          }
        </div>
        <div class="panel"><h3>History</h3><div class="list">${mv.length ? mv.map(x => `<div class="row" style="grid-template-columns:110px minmax(0,1fr) auto"><span class="lsub">${parse(dkey(new Date(x.ts))).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} ${tm(x.ts)}</span><span class="mid"><div>${esc(x.reason)}</div></span><span class="r ${x.delta > 0 ? 'pos-v' : ''}">${x.delta > 0 ? '+' : ''}${x.delta}</span></div>`).join('') : '<div class="empty">No movements yet.</div>'}</div></div>
      </div>`;
            })
            .join('')
        : '<div class="panel"><div class="empty">No items track stock. Turn on "Track stock" for an item in Settings.</div></div>'
    }
  </div>`;
}
