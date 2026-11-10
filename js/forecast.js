/* ==========================================================================
    9. PROYECCIÓN DE FLUJO DE CAJA
    Saldo previsto a 3 o 6 meses a partir de los movimientos importados:
      · lo que se repite (nómina, alquiler, suscripciones…) entra como pagos con fecha
      · lo demás, como un ritmo medio diario sacado de los últimos 90 días
      · el rango se abre con la raíz del tiempo, porque la incertidumbre se acumula
    ========================================================================== */
const FC_DAYS_MONTH = 30.4375;
const FC_MIN_HISTORY = 45;          // días de datos mínimos para proyectar
const FC_AMOUNT_TOL = 0.30;         // un importe es "el habitual" si está a ±30 % de la mediana
const FC_Z = 1.5;                   // calibrado con simulaciones para que el rango cubra ~80 % de los casos
// Palabras que los bancos añaden a casi todos los conceptos y no identifican al comercio
const FC_NOISE = new Set(['COMPRA', 'TARJETA', 'TARJ', 'PAGO', 'RECIBO', 'REF', 'NUM', 'EUR', 'TPV', 'COM', 'WWW', 'ES', 'DE', 'DEL', 'LA', 'EL', 'CON', 'EN', 'POR', 'A']);
let chartForecastInstance = null;
const FC = { last: null };

const fcMedian = arr => {
    const s = [...arr].sort((a, b) => a - b), n = s.length;
    return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0;
};
const fcMean = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

// Identifica "quién" es un movimiento: signo + primeras palabras del concepto sin números ni ruido
function fcKey(r) {
    const words = norm(r.c).replace(/[0-9]+/g, ' ').replace(/[^A-Z ]/g, ' ').split(' ')
        .filter(w => w.length > 1 && !FC_NOISE.has(w));
    return words.length ? (r.i < 0 ? '-' : '+') + '|' + words.slice(0, 3).join(' ') : '';
}

// Detecta series que se repiten cada 1, 2 o 3 meses con un importe parecido (mín. 3 veces en 13 meses)
function fcDetect(rows, ref) {
    const since = addMonthsIso(ref, -13);
    const groups = new Map();
    rows.forEach(r => {
        if (r.d > ref || r.d < since || r.lk || (r.bz && r.bz.length)) return;   // los Bizums de gastos compartidos no son recurrentes
        const key = fcKey(r);
        if (!key) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    });

    const series = [], used = new Set();
    groups.forEach((list, key) => {
        const byDay = new Map();   // varios movimientos el mismo día cuentan como uno
        list.forEach(r => byDay.set(r.d, (byDay.get(r.d) || 0) + r.i));
        const all = [...byDay.keys()];
        if (all.length < 3) return;

        // Importe habitual: los que están cerca de la mediana (el resto, p. ej. una paga extra, queda fuera)
        const ma = fcMedian(all.map(d => Math.abs(byDay.get(d))));
        if (ma < 0.5) return;
        const regDates = all.filter(d => Math.abs(Math.abs(byDay.get(d)) - ma) <= ma * FC_AMOUNT_TOL).sort();
        if (regDates.length < 3 || regDates.length / all.length < 0.6) return;

        // Cadencia: la mediana de los intervalos debe ser ~1, 2 o 3 meses y la mayoría de intervalos la respetan
        const gaps = regDates.slice(1).map((d, i) => daysBetween(regDates[i], d));
        const med = fcMedian(gaps);
        const step = med >= 25 && med <= 36 ? 1 : med >= 55 && med <= 67 ? 2 : med >= 84 && med <= 98 ? 3 : 0;
        if (!step) return;
        const tol = Math.max(5, med * 0.15);
        const okGaps = gaps.filter(g => Math.abs(g - med) <= tol).length;
        if (okGaps < 2 || okGaps / gaps.length < 0.7) return;

        const sign = key[0] === '-' ? -1 : 1;
        const regAmounts = regDates.map(d => Math.abs(byDay.get(d)));
        const regSet = new Set(regDates);
        const regRows = list.filter(r => regSet.has(r.d));
        regRows.forEach(r => used.add(r.k));
        const cats = {};
        regRows.forEach(r => { cats[r.cat] = (cats[r.cat] || 0) + 1; });
        const cat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0];
        const last = regDates[regDates.length - 1];
        series.push({
            key, sign, step, cat, last, n: regDates.length,
            name: key.slice(2).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()),
            amount: sign * fcMedian(regAmounts.slice(-3)),                       // el importe más reciente manda
            dom: Math.round(fcMedian(regDates.map(d => Number(d.slice(8, 10))))),
            variable: (Math.max(...regAmounts) - Math.min(...regAmounts)) / ma > 0.08,
            active: daysBetween(last, ref) <= med * 1.6,                         // si dejó de repetirse, no se proyecta
            inv: isInvCat(cat)
        });
    });
    series.sort((a, b) => (b.amount > 0) - (a.amount > 0) || Math.abs(b.amount) / b.step - Math.abs(a.amount) / a.step);
    return { series, used };
}

// Fechas futuras de una serie dentro del horizonte
function fcOccurrences(s, ref, end) {
    const out = [];
    let d = s.last;
    for (let guard = 0; guard < 60; guard++) {
        d = addMonthsIso(d, s.step, s.dom);
        if (d > end) break;
        if (d > ref) out.push(d);
        else if (daysBetween(d, ref) <= 10) out.push(addDays(ref, 1));   // tocaba hace unos días y no consta: se cuenta mañana
    }
    return out;
}

// Ritmo de lo que NO es recurrente: cubos de 30 días hacia atrás desde el último movimiento (máx. 3)
function fcBaseline(rows, ref, first, used) {
    const hist = daysBetween(first, ref) + 1;
    const nb = Math.min(3, Math.max(1, Math.floor(hist / 30)));
    const b = Array.from({ length: nb }, () => ({ spend: 0, inc: 0, inv: 0, cats: {} }));
    rows.forEach(r => {
        const age = daysBetween(r.d, ref);
        if (age < 0 || age >= nb * 30 || used.has(r.k)) return;
        const o = b[Math.floor(age / 30)];
        if (r.i < 0) {
            if (isInvCat(r.cat)) o.inv += -r.i;
            else { o.spend += -r.i; const g = catGroup(r.cat); o.cats[g] = (o.cats[g] || 0) + -r.i; }
        } else if (!isInvCat(r.cat)) o.inc += r.i;   // retirar de la inversión es excepcional: no se cuenta como ingreso habitual
    });
    return b;
}

// Proyección completa. opts: { months: 3|6, inv: seguir aportando a inversión, off: Set de claves excluidas }
function fcBuild(rows, opts) {
    const months = opts.months === 6 ? 6 : 3, invOn = opts.inv !== false, off = opts.off || new Set();
    if (!rows.length) return { error: 'sin-datos' };
    let ref = rows[0].d, first = rows[0].d;
    rows.forEach(r => { if (r.d > ref) ref = r.d; if (r.d < first) first = r.d; });
    const lastRow = rows.find(r => r.d === ref);
    const saldo0 = lastRow.s;
    const hist = daysBetween(first, ref) + 1;
    if (saldo0 == null || hist < FC_MIN_HISTORY) return { error: 'poco-historial', hist };

    const N = Math.round(months * FC_DAYS_MONTH), end = addDays(ref, N);
    const det = fcDetect(rows, ref);
    const buckets = fcBaseline(rows, ref, first, det.used);
    const nb = buckets.length;

    // Recurrentes: cada pago con su fecha
    const events = new Map();
    const series = det.series.filter(s => s.active);
    series.forEach(s => {
        s.off = off.has(s.key);
        s.skipInv = s.inv && !invOn;
        s.on = !s.off && !s.skipInv;
        s.next = fcOccurrences(s, ref, end);
        if (s.on) s.next.forEach(d => events.set(d, (events.get(d) || 0) + s.amount));
    });

    // Resto: media de gasto, mediana de ingresos sueltos (una venta puntual no se repite), media de traspasos
    const spend = fcMean(buckets.map(o => o.spend));
    const incVar = fcMedian(buckets.map(o => o.inc));
    const invVar = invOn ? fcMean(buckets.map(o => o.inv)) : 0;
    const net = incVar - spend - invVar;
    const nets = buckets.map(o => o.inc - o.spend - (invOn ? o.inv : 0));
    const sd = nb > 1 ? Math.sqrt(fcMean(nets.map(x => (x - fcMean(nets)) ** 2))) : 0;
    // Suelo: con 2-3 cubos la desviación muestral sale artificialmente baja; el gasto real varía ~15 % de un mes a otro
    const sdMonth = Math.max(sd, spend * 0.15, 25);

    const labels = [], central = [], low = [], high = [];
    let bal = saldo0;
    for (let i = 1; i <= N; i++) {
        // Incertidumbre = variación natural (crece con t) + error de estimar el ritmo medio con nb meses (crece con t²/nb)
        const t = i / FC_DAYS_MONTH, d = addDays(ref, i), w = FC_Z * sdMonth * Math.sqrt(t + (t * t) / nb);
        bal += net / FC_DAYS_MONTH + (events.get(d) || 0);
        labels.push(d); central.push(bal); low.push(bal - w); high.push(bal + w);
    }

    // Resumen mensual para explicar de dónde sale la cifra
    const perMonth = f => series.filter(s => s.on && f(s)).reduce((a, s) => a + s.amount / s.step, 0);
    const cats = {};
    buckets.forEach(o => Object.entries(o.cats).forEach(([g, v]) => { cats[g] = (cats[g] || 0) + v / nb; }));
    const flows = {
        incFix: perMonth(s => s.amount > 0),
        expFix: perMonth(s => s.amount < 0 && !s.inv),
        invFix: perMonth(s => s.amount < 0 && s.inv),
        spendVar: -spend, incVar, invVar: -invVar,
        topCats: Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 4)
    };
    flows.total = flows.incFix + flows.expFix + flows.invFix + flows.spendVar + flows.incVar + flows.invVar;

    const iMin = central.indexOf(Math.min(...central));
    const firstBelow = arr => { const i = arr.findIndex(v => v < 0); return i < 0 ? null : labels[i]; };
    const histMonths = hist / FC_DAYS_MONTH;
    const confidence = hist < 90 ? 'baja' : (hist < 180 || series.filter(s => s.on).length < 2) ? 'media' : 'alta';
    return {
        ref, first, saldo0, months, N, labels, central, low, high, series, flows, nb, hist, histMonths, confidence,
        end: { central: central[N - 1], low: low[N - 1], high: high[N - 1] },
        min: { date: labels[iMin], value: central[iMin] },
        negDate: firstBelow(central), riskDate: firstBelow(low)
    };
}

/* --------------------------------------------------------------------------
   PANTALLA
   -------------------------------------------------------------------------- */
function fcPrefs() {
    const s = AppState.settings || {};
    return { months: s.fcMonths === 6 ? 6 : 3, inv: s.fcInv !== false, off: new Set(Array.isArray(s.fcOff) ? s.fcOff : []) };
}
function setForecastMonths(m) { AppState.settings.fcMonths = m === 6 ? 6 : 3; saveState(); renderForecast(); }
function setForecastInv(on) { AppState.settings.fcInv = !!on; saveState(); renderForecast(); }
function toggleForecastSeries(i) {
    const s = FC.last && FC.last.series && FC.last.series[i];
    if (!s) return;
    const off = new Set(Array.isArray(AppState.settings.fcOff) ? AppState.settings.fcOff : []);
    if (off.has(s.key)) off.delete(s.key); else off.add(s.key);
    AppState.settings.fcOff = [...off];
    saveState(); renderForecast();
}

const fcSigned = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatEur(Math.abs(v))}`;

function renderForecast() {
    const card = document.getElementById('fc-card');
    if (!card) return;
    const pr = fcPrefs();
    document.getElementById('fc-m3').classList.toggle('on', pr.months === 3);
    document.getElementById('fc-m6').classList.toggle('on', pr.months === 6);
    document.getElementById('fc-inv').checked = pr.inv;

    const res = fcBuild(AppState.rows, pr);
    FC.last = res;
    const body = document.getElementById('fc-body'), empty = document.getElementById('fc-empty');
    if (chartForecastInstance) { chartForecastInstance.destroy(); chartForecastInstance = null; }
    if (res.error) {
        body.classList.add('hidden');
        empty.classList.remove('hidden');
        empty.textContent = res.error === 'poco-historial'
            ? `Hacen falta al menos ${FC_MIN_HISTORY} días de movimientos para proyectar (ahora hay ${res.hist}).`
            : 'Importa tus movimientos para ver la proyección.';
        return;
    }
    body.classList.remove('hidden');
    empty.classList.add('hidden');

    // Cifra principal
    const diff = res.end.central - res.saldo0;
    let alert = '';
    if (res.negDate) alert = `<div class="fc-alert bad">Con este ritmo el saldo bajaría de 0 € hacia el ${formatDateEs(res.negDate)}.</div>`;
    else if (res.riskDate) alert = `<div class="fc-alert warn">En el escenario desfavorable el saldo podría bajar de 0 € hacia el ${formatDateEs(res.riskDate)}.</div>`;
    document.getElementById('fc-summary').innerHTML = `
        <div class="fc-label">Saldo previsto el ${shortDate(res.labels[res.N - 1])} ${res.labels[res.N - 1].slice(0, 4)}</div>
        <div class="fc-amount num">${formatEur(res.end.central)}</div>
        <div class="fc-sub num"><span class="bold ${diff >= 0 ? 'pos' : 'red'}">${fcSigned(diff)}</span> frente al saldo actual · rango ${formatEur(res.end.low)} a ${formatEur(res.end.high)}</div>
        ${alert}`;

    // Gráfica: últimos 45 días reales + proyección con su rango
    const th = chartTheme(), blue = cssVar('--blue');
    const hs = balanceSeries({ from: addDays(res.ref, -44), to: res.ref });
    if (!hs.labels.length) { hs.labels.push(res.ref); hs.data.push(res.saldo0); }
    const H = hs.labels.length;
    const labels = [...hs.labels, ...res.labels];
    const proj = arr => [...Array(H - 1).fill(null), res.saldo0, ...arr];
    const datasets = [
        { label: 'Saldo', data: [...hs.data, ...Array(res.N).fill(null)], borderColor: blue, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, tension: 0.3 },
        { label: 'Favorable', data: proj(res.high), borderWidth: 0, pointRadius: 0, fill: false },
        { label: 'Desfavorable', data: proj(res.low), borderWidth: 0, pointRadius: 0, backgroundColor: blue + '26', fill: '-1' },
        { label: 'Previsión', data: proj(res.central), borderColor: blue, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0 }
    ];
    chartForecastInstance = new Chart(document.getElementById('chart-forecast').getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...th.tooltip,
                    filter: it => it.dataset.label === 'Saldo' || it.dataset.label === 'Previsión',
                    callbacks: {
                        title: c => formatDateEs(labels[c[0].dataIndex]),
                        label: c => ` ${c.dataset.label}: ${formatEur(c.raw)}`,
                        afterBody: c => {
                            const i = c[0].dataIndex;
                            return i >= H ? [` Rango: ${formatEur(datasets[2].data[i])} a ${formatEur(datasets[1].data[i])}`] : [];
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 5, maxRotation: 0, callback: v => shortDate(labels[v]) } },
                y: { grace: '8%', grid: { color: th.grid }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('es-ES') + ' k' : v } }
            }
        }
    });

    // Nota de fiabilidad
    const active = res.series.filter(s => s.on).length;
    const notes = [`Datos hasta el ${formatDateEs(res.ref)} (${res.histMonths.toFixed(1).replace('.', ',')} meses de historial)`, `${active} ${active === 1 ? 'recurrente activo' : 'recurrentes activos'}`, `fiabilidad ${res.confidence}`];
    let extra = '';
    if (res.nb < 3) extra = ' Con menos de 3 meses de datos, el gasto variable es una aproximación.';
    document.getElementById('fc-note').textContent = notes.join(' · ') + '.' + extra + ' No depende del periodo elegido arriba.';

    // De dónde sale la cifra, por mes
    const f = res.flows;
    const flow = (title, v, sub) => v === 0 ? '' : `
        <div class="row"><span class="row-main"><span class="row-title" style="display:block;font-size:15px">${title}</span>${sub ? `<span class="row-sub" style="display:block;white-space:normal">${sub}</span>` : ''}</span>
        <span class="row-value num ${v > 0 ? 'pos' : 'red'}" style="font-size:15px">${fcSigned(v)}</span></div>`;
    const top = f.topCats.map(([g, v]) => `${esc(g)} ${formatEur(v).replace(/,\d\d\s/, ' ')}`).join(' · ');
    document.getElementById('fc-flows').innerHTML =
        flow('Ingresos fijos al mes', f.incFix) +
        flow('Gastos recurrentes al mes', f.expFix) +
        flow('Gasto variable al mes', f.spendVar, top ? `Media de ${res.nb} ${res.nb === 1 ? 'mes' : 'meses'}: ${top}` : '') +
        flow('Otros ingresos al mes', f.incVar) +
        flow('Traspasos a inversión al mes', f.invFix + f.invVar) +
        `<div class="row"><span class="row-main row-title bold" style="font-size:15px">Balance mensual previsto</span><span class="row-value num bold ${f.total >= 0 ? 'pos' : 'red'}" style="font-size:15px">${fcSigned(f.total)}</span></div>`;

    // Lista de recurrentes (tocar para excluir)
    const list = document.getElementById('fc-list');
    if (!res.series.length) {
        list.innerHTML = '<div class="row"><span class="muted small">Aún no hay pagos ni ingresos que se repitan al menos 3 veces. Con más historial aparecerán aquí.</span></div>';
        return;
    }
    list.innerHTML = res.series.map((s, i) => {
        const cadence = s.step === 1 ? `cada mes · día ${s.dom}` : `cada ${s.step} meses`;
        const next = s.next.length ? `próximo ${shortDate(s.next[0])}` : 'sin pagos en este horizonte';
        const tags = (s.variable ? ' · importe variable' : '') + (s.off ? ' · excluido' : s.skipInv ? ' · sin aportaciones' : '');
        return `<button type="button" class="row with-icon tap${s.on ? '' : ' fc-off'}" onclick="toggleForecastSeries(${i})">
            ${catIcon(s.cat)}
            <span class="row-main"><span class="row-title" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</span>
            <span class="row-sub" style="display:block">${cadence} · ${next}${tags}</span></span>
            <span class="row-value num ${s.amount > 0 ? 'pos' : ''}">${fcSigned(s.amount)}</span>
        </button>`;
    }).join('');
}
