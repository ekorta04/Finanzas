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

    // Lee el PDF y devuelve lo mismo que parseLaboralKutxaCSV: { parsedRows, badRows }
    async function readExtractoPdf(file) {
        const lib = await xrayLoadPdfJs();
        const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        try {
            const pages = [];
            for (let n = 1; n <= doc.numPages; n++) {
                const tc = await (await doc.getPage(n)).getTextContent();
                pages.push(tc.items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
            }
            const { rows, bad } = parseExtractoPages(pages);
            return { parsedRows: rows, badRows: bad };
        } finally { doc.destroy(); }
    }

    const api = { parseExtractoPages, readExtractoPdf };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
