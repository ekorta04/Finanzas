/* ==========================================================================
   EXTRACTO EN PDF DE LABORAL KUTXA
   Lee el PDF "Movimientos de cuenta" que descarga la banca online y lo
   convierte en las mismas filas que el CSV: { d, v, c, i, s }.
   El PDF se lee en el propio dispositivo (pdf.js, el mismo lector del X-Ray).
   parseExtractoPages es una función pura (sin pantalla) para poder probarla.
   ========================================================================== */

(function (root) {
    const DATE = /^(\d{2})\/(\d{2})\/(\d{4})\b/;
    const AMOUNT = /(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})\s*€/g;

    const isoOf = s => { const m = String(s).match(DATE); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
    const toNum = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));

    // Agrupa las piezas de texto de una página en líneas (misma altura) y las ordena de izquierda a derecha
    function pageLines(items) {
        const sorted = items.filter(i => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
        const lines = [];
        sorted.forEach(it => {
            const last = lines[lines.length - 1];
            if (last && Math.abs(last.y - it.y) <= 2.5) last.items.push(it);
            else lines.push({ y: it.y, items: [it] });
        });
        return lines.map(l => {
            const its = l.items.sort((a, b) => a.x - b.x);
            let text = '';
            its.forEach((it, k) => {
                const prev = its[k - 1];
                const gap = prev ? it.x - (prev.x + (prev.w || 0)) : 0;
                text += (k && (gap > 1 || !(prev.w >= 0)) ? ' ' : '') + it.str;
            });
            return text.replace(/\s+/g, ' ').trim();
        }).filter(Boolean);
    }

    /* pages: [[{ str, x, y, w }, …], …]  →  { rows: [{ d, v, c, i, s }], bad } */
    function parseExtractoPages(pages) {
        const rows = [];
        let bad = 0, prev = null;

        pages.forEach(items => {
            pageLines(items).forEach(line => {
                if (/^Fecha Concepto Importe Saldo/i.test(line)) { prev = null; return; }

                const dm = line.match(DATE);
                if (dm) {
                    const amounts = [...line.matchAll(AMOUNT)];
                    if (amounts.length < 2) { prev = null; return; }     // p. ej. la hora de descarga "27/11/2026 11:39"
                    const imp = amounts[amounts.length - 2], sal = amounts[amounts.length - 1];
                    const concept = line.slice(dm[0].length, imp.index).trim();
                    const i = toNum(imp[1]), s = toNum(sal[1]);
                    if (!concept || !Number.isFinite(i) || !Number.isFinite(s)) { bad++; prev = null; return; }
                    prev = { d: isoOf(line), v: isoOf(line), c: concept, i, s };
                    rows.push(prev);
                    return;
                }

                if (!prev) return;
                const val = line.match(/^Valor\s+(\d{2}\/\d{2}\/\d{4})/i);
                if (val) { prev.v = isoOf(val[1]); prev = null; return; }
                if (/^(Fechas|Tipo|MOVIMIENTOS|CUENTA|P[áa]gina)\b/i.test(line)) return;
                // Concepto largo que sigue en la línea siguiente
                prev.c = (prev.c + ' ' + line).replace(/\s+/g, ' ').trim();
            });
        });

        return { rows, bad };
    }

    /* ---------- PDF «Movimientos de tarjeta» (tarjeta de crédito) ----------
       Columnas: Fecha · Categoría · Establecimiento · Importe · Moneda. No trae saldo,
       el establecimiento puede ocupar varias líneas y la categoría es la que da el banco. */

    const norm2 = s => String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
    const SEP = ' › ';
    // Categoría del banco → categoría de la app (lo que no se reconoce se clasifica con las reglas o queda sin clasificar)
    const BANK_CATS = [
        [/ROPA|CALZADO/, 'Compras' + SEP + 'Ropa y calzado'],
        [/GASOLINA|COMBUSTIBLE/, 'Vehículo' + SEP + 'Combustible'],
        [/TRANSPORTE|VIAJE/, 'Transporte'],
        [/SUPERMERCADO|ALIMENTACION/, 'Comida y bebida' + SEP + 'Supermercado'],
        [/RESTAUR|RESTAURACION|COMIDA RAPIDA/, 'Comida y bebida' + SEP + 'Restaurante, comida rápida'],
        [/SALUD|FARMACIA|MEDIC/, 'Vida y entretenimiento' + SEP + 'Atención médica, doctor'],
        [/SEGURO/, 'Gastos financieros' + SEP + 'Seguros']
    ];
    const bankCategory = c => { const n = norm2(c); const m = BANK_CATS.find(([re]) => re.test(n)); return m ? m[1] : null; };
    const parseAmount = s => /^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^-?\d+(?:,\d+)?$/.test(s) ? toNum(s) : NaN;
    const isoLoose = s => { const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };

    function isTarjetaPages(pages) {
        // pdf.js según la versión parte las frases en palabras sueltas: se une el texto de la página
        return pages.some(items => /Movimientos\s+de\s+tarjeta/i.test(items.map(i => i.str).join(' ')) && items.some(i => /^Establecimiento$/i.test(i.str.trim())));
    }

    function parseTarjetaPages(pages) {
        const rows = [], seen = new Map();
        let bad = 0, prev = null;

        pages.forEach(items => {
            const clean = items.filter(i => i.str && i.str.trim());
            const head = {};
            clean.forEach(i => {
                const t = norm2(i.str);
                if (t === 'FECHA') head.f = i.x;
                else if (t === 'CATEGORIA') head.c = i.x;
                else if (t === 'ESTABLECIMIENTO') head.e = i.x;
                else if (t === 'IMPORTE') head.i = i.x;
                else if (t === 'MONEDA') head.m = i.x;
            });
            if (head.f == null || head.e == null || head.i == null || head.m == null) return;
            const cols = [['f', head.f], ['c', head.c == null ? head.f + 1 : head.c], ['e', head.e], ['i', head.i], ['m', head.m]].sort((a, b) => a[1] - b[1]);
            const colOf = x => { let k = cols[0][0]; cols.forEach(([n, cx]) => { if (x >= cx - 3) k = n; }); return k; };
            const headY = clean.find(i => norm2(i.str) === 'FECHA').y;

            // Líneas por altura (solo por debajo de la cabecera)
            const lines = [];
            clean.filter(i => i.y < headY - 1).sort((a, b) => b.y - a.y || a.x - b.x).forEach(it => {
                const last = lines[lines.length - 1];
                if (last && Math.abs(last.y - it.y) <= 2.5) last.items.push(it); else lines.push({ y: it.y, items: [it] });
            });

            lines.forEach(l => {
                const t = { f: '', c: '', e: '', i: '', m: '' };
                l.items.sort((a, b) => a.x - b.x).forEach(it => { const k = colOf(it.x); t[k] = (t[k] + ' ' + it.str).trim(); });
                if (isoLoose(t.f)) {
                    const amount = parseAmount(t.i.replace(/\s/g, ''));
                    if (!t.e || !Number.isFinite(amount)) { bad++; prev = null; return; }
                    prev = { d: isoLoose(t.f), bankCat: t.c, c: t.e, i: amount, cur: (t.m || 'EUR').toUpperCase() };
                    rows.push(prev);
                } else if (prev) {          // continuación del establecimiento (o de la categoría)
                    if (t.e) prev.c = (prev.c + ' ' + t.e).trim();
                    if (t.c) prev.bankCat = (prev.bankCat + ' ' + t.c).trim();
                }
            });
            prev = null;
        });

        const out = rows.map(r => {
            const c = (r.c.replace(/\s+/g, ' ').trim() + (r.cur && r.cur !== 'EUR' ? ` (${r.cur})` : ''));
            // Sin saldo: la clave es fecha + importe + establecimiento + nº de repetición dentro del archivo
            const fp = `${r.d}|${r.i.toFixed(2)}|${norm2(c)}`;
            const n = (seen.get(fp) || 0) + 1; seen.set(fp, n);
            const cat = bankCategory(r.bankCat);
            return { k: `tj|${fp}|${n}`, d: r.d, v: r.d, c, i: r.i, s: null, bankCat: r.bankCat, ...(cat ? { catHint: cat } : {}) };
        });
        return { rows: out, bad };
    }

    // Lee el PDF y devuelve lo mismo que parseLaboralKutxaCSV: { parsedRows, badRows } (kind: 'tarjeta' si es de tarjeta)
    async function readExtractoPdf(file) {
        const lib = await xrayLoadPdfJs();
        const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        try {
            const pages = [];
            for (let n = 1; n <= doc.numPages; n++) {
                const tc = await (await doc.getPage(n)).getTextContent();
                pages.push(tc.items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
            }
            if (isTarjetaPages(pages)) {
                const t = parseTarjetaPages(pages);
                return { parsedRows: t.rows, badRows: t.bad, kind: 'tarjeta' };
            }
            const { rows, bad } = parseExtractoPages(pages);
            return { parsedRows: rows, badRows: bad };
        } finally { doc.destroy(); }
    }

    const api = { parseExtractoPages, parseTarjetaPages, isTarjetaPages, readExtractoPdf };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
