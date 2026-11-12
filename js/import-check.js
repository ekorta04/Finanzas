/* ==========================================================================
   COMPROBACIÓN DE UN CSV ANTES DE IMPORTARLO
   Detecta si faltan movimientos entre lo que ya está guardado y el archivo
   nuevo, comparando los saldos: el saldo anterior al primer movimiento del
   archivo tiene que ser igual al saldo del último movimiento guardado.
   Funciones puras (sin pantalla ni base de datos) para poder probarlas.
   ========================================================================== */

(function (root) {
    const near = (a, b) => Math.abs(a - b) < 0.015;
    const minOf = arr => arr.reduce((m, x) => (x < m ? x : m));
    const maxOf = arr => arr.reduce((m, x) => (x > m ? x : m));

    // Saldo antes del primer movimiento de un día. Varios movimientos el mismo día forman una cadena
    // (cada saldo = el anterior + importe): el primero es el que no sale como saldo final de otro.
    function dayStart(rows) {
        if (rows.some(r => r.s == null)) return null;
        const starts = rows.map(r => r.s - r.i);
        const first = starts.filter((st, k) => !rows.some((o, j) => j !== k && near(o.s, st)));
        return first.length ? first[0] : starts[0];
    }

    // Saldo tras el último movimiento de un día: el que no es saldo inicial de otro
    function dayEnd(rows) {
        if (rows.some(r => r.s == null)) return null;
        const last = rows.filter((r, k) => !rows.some((o, j) => j !== k && near(r.s, o.s - o.i)));
        return (last.length ? last[0] : rows[0]).s;
    }

    /* existing: movimientos guardados [{ d, i, s }]   incoming: movimientos del archivo [{ d, i, s }]
       Devuelve { status } con status:
         'first'      no hay nada guardado todavía
         'overlap'    el archivo se solapa en fechas con lo guardado
         'contiguous' empieza justo donde acaba lo guardado (o termina donde empieza) y los saldos cuadran
         'gap'        los saldos no cuadran: faltan movimientos (from, to, diff)
         'unknown'    no se puede comprobar (movimientos sin saldo)
         'none'       archivo vacío */
    function analyzeImportGap(existing, incoming) {
        if (!incoming.length) return { status: 'none' };
        if (!existing.length) return { status: 'first' };

        const inMin = minOf(incoming.map(r => r.d)), inMax = maxOf(incoming.map(r => r.d));
        const exMin = minOf(existing.map(r => r.d)), exMax = maxOf(existing.map(r => r.d));
        if (inMin <= exMax && inMax >= exMin) return { status: 'overlap' };

        const onDay = (rows, d) => rows.filter(r => r.d === d);
        if (inMin > exMax) {   // el archivo viene después de lo guardado
            const expected = dayEnd(onDay(existing, exMax));
            const actual = dayStart(onDay(incoming, inMin));
            if (expected == null || actual == null) return { status: 'unknown' };
            return near(actual, expected)
                ? { status: 'contiguous' }
                : { status: 'gap', from: exMax, to: inMin, diff: actual - expected };
        }
        // el archivo es anterior a lo guardado (historial antiguo)
        const expected = dayStart(onDay(existing, exMin));
        const actual = dayEnd(onDay(incoming, inMax));
        if (expected == null || actual == null) return { status: 'unknown' };
        return near(actual, expected)
            ? { status: 'contiguous' }
            : { status: 'gap', from: inMax, to: exMin, diff: expected - actual };
    }

    const api = { analyzeImportGap, dayStart, dayEnd };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
