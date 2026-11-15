/* ==========================================================================
   TICKETS: del texto leído en la foto a comercio, fecha, total y líneas.
   Sin dependencias, para poder probarlo también con Node.
   ========================================================================== */

// Importe al final de la línea: 12,50 · 1.234,50 · 12.50 · 12,50€ · 12,50 A (letra de IVA)
const TK_AMOUNT_END = /(-?\d{1,4}(?:[.,\s]\d{3})*\s?[.,]\s?\d{2})\s*(?:€|EUR|E)?\s*[A-Z*]?\s*$/i;
const TK_SKIP = /\b(SUB\s?TOTAL|BASE|IVA|I\.V\.A|CUOTA|IMPUESTO|CAMBIO|ENTREGAD|EFECTIVO|TARJETA|VISA|MASTERCARD|CONTACTLESS|CIF|NIF|N\.I\.F|C\.I\.F|TEL[EÉ]?F?|MESA|FACTURA|TICKET|FECHA|HORA|CAJA|CAJERO|ATENDID|AUT\.?|AUTORIZ|PEDIDO|N[º°]|OPERACI[OÓ]N|COMERCIO|TERMINAL|SALDO|PUNTOS|DEVOLUCI|GRACIAS|PRECIO|IMPORTE\s+NETO)\b/i;
const TK_TOTAL = /\b(TOTAL|A\s+PAGAR|IMPORTE\s+TOTAL|TOTAL\s+EUR|TOTAL\s+A\s+PAGAR)\b/i;
const TK_NOT_TOTAL = /\b(SUB\s?TOTAL|TOTAL\s+IVA|TOTAL\s+BASE|BASE|CUOTA|ART[IÍ]CULOS|UNIDADES|ITEMS|DESCUENTOS?)\b/i;

function tkNum(s) {
    s = String(s).replace(/\s+/g, '');
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    const dec = Math.max(lc, ld);
    const int = s.slice(0, dec).replace(/[.,]/g, ''), frac = s.slice(dec + 1);
    return Math.round(parseFloat(int + '.' + frac) * 100) / 100;
}

function tkDate(text) {
    const m = String(text).match(/\b(\d{1,2})\s?[\/\-.]\s?(\d{1,2})\s?[\/\-.]\s?(\d{4}|\d{2})\b/);
    if (!m) return '';
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    d = Number(d); mo = Number(mo);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return '';
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function tkClean(label) {
    return label
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+\d{1,4}[.,]\d{2}\s*$/, '')      // precio unitario que queda al final
        .replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/, '')
        .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9)]+$/, '')
        .trim();
}

function parseTicketText(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const out = { shop: '', date: tkDate(text), total: null, items: [] };

    // Comercio: primera línea con texto de verdad (no CIF, no dirección con números)
    for (const l of lines.slice(0, 6)) {
        const letters = (l.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) || []).length;
        if (letters >= 3 && letters / l.length > 0.6 && !TK_SKIP.test(l)) { out.shop = tkClean(l).slice(0, 40); break; }
    }

    // Total: la línea "TOTAL" (no subtotal ni IVA) con importe; si hay varias, la mayor
    let totalIdx = -1;
    lines.forEach((l, i) => {
        if (!TK_TOTAL.test(l) || TK_NOT_TOTAL.test(l)) return;
        let m = l.match(TK_AMOUNT_END);
        if (!m && lines[i + 1]) m = lines[i + 1].match(/^(?:€\s*)?(-?\d{1,4}(?:[.,]\d{3})*[.,]\d{2})\s*(?:€|EUR)?$/i);
        if (!m) return;
        const v = tkNum(m[1]);
        if (v > 0 && (out.total == null || v > out.total)) { out.total = v; if (totalIdx < 0) totalIdx = i; }
    });

    // Líneas: antes del total, con importe al final y sin palabras de pie de ticket
    const end = totalIdx >= 0 ? totalIdx : lines.length;
    for (let i = 0; i < end; i++) {
        const l = lines[i];
        if (TK_SKIP.test(l) || TK_TOTAL.test(l)) continue;
        const m = l.match(TK_AMOUNT_END);
        if (!m) continue;
        const v = tkNum(m[1]);
        let label = tkClean(l.slice(0, m.index));
        if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}/.test(label) || Math.abs(v) > 5000 || v === 0) continue;
        // "2 x CAÑA" / "2 CAÑA" → se conserva la cantidad en el texto
        label = label.replace(/^(\d{1,2})\s*[xX*]\s*/, '$1 × ').replace(/^(\d{1,2})\s+(?=[A-Za-zÁÉÍÓÚÑ])/, '$1 × ');
        out.items.push({ t: label.slice(0, 40), v });
    }

    if (out.total == null) {
        const sum = Math.round(out.items.reduce((a, it) => a + it.v, 0) * 100) / 100;
        const all = lines.map(l => l.match(TK_AMOUNT_END)).filter(Boolean).map(m => tkNum(m[1]));
        out.total = sum > 0 ? sum : (all.length ? Math.max(...all) : null);
    }
    return out;
}

if (typeof module !== 'undefined') module.exports = { parseTicketText, tkNum, tkDate };
