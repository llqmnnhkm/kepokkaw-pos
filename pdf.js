// Tiny PDF writer for the Kepokkaw reports: A4 pages, text in the built-in Helvetica fonts,
// filled rectangles and lines. No library, works offline.
// const d = KKPDF.create(); d.text(40, 60, 'Hello', {size: 12, bold: true, color: '#E1251B', align: 'right'});
// d.rect(x, y, w, h, '#eee'); d.line(x1, y1, x2, y2, '#ccc', 0.5); d.page(); d.bytes() -> Uint8Array
// Coordinates are in points from the TOP-left corner (A4 = 595 x 842).
(function (root) {
  const W = 595, H = 842;
  // Helvetica / Helvetica-Bold advance widths for ASCII 32..126 (1/1000 em)
  const REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  // characters outside ASCII that WinAnsi can show, with their widths [code, regular, bold]
  const EXTRA = { '–': [0x96, 556, 556], '—': [0x97, 1000, 1000], '•': [0x95, 350, 350], '×': [0xD7, 584, 584],
    '·': [0xB7, 278, 278], '‘': [0x91, 222, 278], '’': [0x92, 222, 278], '“': [0x93, 333, 500], '”': [0x94, 333, 500], '…': [0x85, 1000, 1000] };
  const SUB = { '−': '-', '▲': '+', '▼': '-', ' ': ' ' };

  function codes(str) {
    const out = [];
    for (let ch of String(str)) {
      if (SUB[ch]) ch = SUB[ch];
      const c = ch.codePointAt(0);
      if (c >= 32 && c < 127) out.push(c);
      else if (EXTRA[ch]) out.push(EXTRA[ch][0]);
      else if (c >= 160 && c < 256) out.push(c);
      else out.push(63); // '?'
    }
    return out;
  }
  function widthOf(cs, size, bold) {
    const t = bold ? BOLD : REG;
    let w = 0;
    for (const c of cs) {
      if (c >= 32 && c < 127) w += t[c - 32];
      else { const e = Object.values(EXTRA).find(x => x[0] === c); w += e ? (bold ? e[2] : e[1]) : 556; }
    }
    return w * size / 1000;
  }
  function pdfString(cs) {
    let s = '(';
    for (const c of cs) {
      if (c === 40 || c === 41 || c === 92) s += '\\' + String.fromCharCode(c);
      else if (c < 32 || c > 126) s += '\\' + c.toString(8).padStart(3, '0');
      else s += String.fromCharCode(c);
    }
    return s + ')';
  }
  function rgb(col) {
    if (Array.isArray(col)) return col.map(v => +v.toFixed(3)).join(' ');
    const h = String(col || '#000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => +(v / 255).toFixed(3)).join(' ');
  }
  const f = n => +n.toFixed(2);

  function create() {
    const pages = [];
    let ops = null;
    const doc = {
      W, H,
      page() { ops = []; pages.push(ops); return doc; },
      get pageCount() { return pages.length; },
      onPage(i) { ops = pages[i]; return doc; },
      width(str, size = 10, bold = false) { return widthOf(codes(str), size, bold); },
      text(x, y, str, o = {}) {
        if (!ops) doc.page();
        const size = o.size || 10, bold = !!o.bold, cs = codes(str);
        let tx = x;
        if (o.align === 'right') tx = x - widthOf(cs, size, bold);
        else if (o.align === 'center') tx = x - widthOf(cs, size, bold) / 2;
        ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(o.color || '#1B1413')} rg ${f(tx)} ${f(H - y)} Td ${pdfString(cs)} Tj ET`);
        return doc;
      },
      // shortens text with "..." until it fits maxW
      fit(str, maxW, size = 10, bold = false) {
        let s = String(str);
        if (widthOf(codes(s), size, bold) <= maxW) return s;
        while (s.length > 1 && widthOf(codes(s + '…'), size, bold) > maxW) s = s.slice(0, -1);
        return s + '…';
      },
      rect(x, y, w, h, col) { if (!ops) doc.page(); if (w > 0 && h > 0) ops.push(`${rgb(col)} rg ${f(x)} ${f(H - y - h)} ${f(w)} ${f(h)} re f`); return doc; },
      line(x1, y1, x2, y2, col = '#DDDDDD', lw = 0.5) { if (!ops) doc.page(); ops.push(`${rgb(col)} RG ${lw} w ${f(x1)} ${f(H - y1)} m ${f(x2)} ${f(H - y2)} l S`); return doc; },
      bytes() {
        if (!pages.length) doc.page();
        const objs = [];
        const add = s => { objs.push(s); return objs.length; };
        const catalog = add(null), pagesId = add(null);
        const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
        const kids = [];
        for (const p of pages) {
          const body = p.join('\n');
          const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
          kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
        }
        objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
        objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
        let out = '%PDF-1.4\n';
        const offs = [];
        objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
        const xref = out.length;
        out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
        out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        const u = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255;
        return u;
      }
    };
    return doc;
  }

  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KKPDF = api;
})(typeof self !== 'undefined' ? self : this);
