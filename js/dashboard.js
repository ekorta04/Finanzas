/* ==========================================================================
    8. DASHBOARD
    ========================================================================== */
// Gasto/ingreso netos: los Bizums vinculados restan del gasto (y de su categoría) y no cuentan como ingreso
function netTotals(rows) {
    const map = byKeyMap();
    let gasto = 0, ingreso = 0, recovered = 0; const cat = {};
    rows.forEach(r => {
        if (isInvCat(r.cat)) return;
        if (r.i < 0) { gasto += -r.i; cat[catGroup(r.cat)] = (cat[catGroup(r.cat)] || 0) - r.i; }
        else if (r.lk && map.has(r.lk)) { const e = map.get(r.lk); gasto -= r.i; recovered += r.i; cat[catGroup(e.cat)] = (cat[catGroup(e.cat)] || 0) - r.i; }
        else ingreso += r.i;
    });
    Object.keys(cat).forEach(k => { if (cat[k] < 0.005) delete cat[k]; });
    return { gasto: Math.max(0, gasto), ingreso, recovered, cat };
}

// Fecha de hoy (hora local) en formato AAAA-MM-DD
function todayIso() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// Periodo elegido en el Resumen: '30d' / '90d' (últimos días), 'ytd' (este año hasta hoy),
// 'y:AAAA' (un año), 'AAAA-MM' (un mes) o '' (todo). Un periodo en curso termina hoy,
// así que "días" son los días transcurridos y no los del mes completo.
function dashPeriod(value) {
    const today = todayIso();
    const cap = d => (d > today ? today : d);
    let p;
    if (value === '30d' || value === '90d') {
        const n = value === '30d' ? 30 : 90;
        p = { kind: 'days', n, from: addDays(today, -(n - 1)), to: today };
    } else if (value === 'ytd') {
        p = { kind: 'ytd', from: `${today.slice(0, 4)}-01-01`, to: today };
    } else if (/^y:\d{4}$/.test(value || '')) {
        const y = value.slice(2);
        p = { kind: 'year', from: `${y}-01-01`, to: cap(`${y}-12-31`), full: `${y}-12-31` };
    } else if (/^\d{4}-\d{2}$/.test(value || '')) {
        const [y, m] = value.split('-').map(Number);
        const full = `${value}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
        p = { kind: 'month', ym: value, from: `${value}-01`, to: cap(full), full };
    } else {
        return { kind: 'all', from: null, to: null, days: null };
    }
    p.days = daysBetween(p.from, p.to) + 1;
    return p;
}

// Periodo con el que se compara: 'prev' = el inmediatamente anterior; 'yoy' = el mismo del año anterior.
// "Este año" solo tiene sentido contra el año anterior. Un mes en curso se compara con los mismos
// días del otro mes, para no enfrentar 10 días contra 31.
function comparePeriod(p, mode) {
    if (!mode || !p || p.kind === 'all') return null;
    const yoy = mode === 'yoy' || p.kind === 'ytd' || p.kind === 'year';
    let from, to, label = null;
    if (p.kind === 'days') {
        if (yoy) { from = shiftYear(p.from, -1); to = shiftYear(p.to, -1); }
        else { to = addDays(p.from, -1); from = addDays(to, -(p.n - 1)); }
    } else if (p.kind === 'ytd' || p.kind === 'year') {
        from = shiftYear(p.from, -1); to = shiftYear(p.to, -1);
        if (p.kind === 'year' && p.to === p.full) label = String(Number(p.from.slice(0, 4)) - 1);
    } else {   // mes
        const n = yoy ? -12 : -1;
        from = addMonthsIso(p.from, n, 1);
        const lastOfThat = addMonthsIso(p.from, n, 31);
        to = p.to === p.full ? lastOfThat : addMonthsIso(p.to, n);   // mes completo, o los mismos días
        if (to > lastOfThat) to = lastOfThat;
        if (to === lastOfThat) label = monthName(from.slice(0, 7));
    }
    return { from, to, days: daysBetween(from, to) + 1, label: label || `${formatDateEs(from)} – ${formatDateEs(to)}` };
}

// Fecha del último movimiento importado
function lastDataDate() {
    let max = null;
    AppState.rows.forEach(r => { if (max === null || r.d > max) max = r.d; });
    return max;
}

// Si los datos llegan menos lejos que el periodo (CSV importado hace días), se recorta la cola del periodo
// comparado en la misma medida: así se comparan los mismos días y no sale un ahorro falso.
function trimCompare(cmp, gap) {
    if (!cmp || gap <= 0) return cmp;
    const to = addDays(cmp.to, -gap);
    if (to < cmp.from) return null;
    return { from: cmp.from, to, days: daysBetween(cmp.from, to) + 1, label: `${formatDateEs(cmp.from)} – ${formatDateEs(to)}` };
}

// ¿Hay movimientos que cubran el periodo comparado? 'full' | 'partial' | 'none'
function compareCoverage(cmp) {
    if (!cmp || !AppState.rows.length) return 'none';
    let min = AppState.rows[0].d, max = min;
    AppState.rows.forEach(r => { if (r.d < min) min = r.d; if (r.d > max) max = r.d; });
    if (cmp.to < min || cmp.from > max) return 'none';
    return cmp.from >= min && cmp.to <= max ? 'full' : 'partial';
}

// Variación entre dos cifras. goodUp: true si subir es bueno (ingresos, balance), false si es malo (gastos).
// noPct: solo en euros, para cifras que pueden cambiar de signo (el balance), donde un porcentaje no significa nada.
function deltaInfo(cur, prev, goodUp, noPct) {
    const diff = cur - prev;
    if (Math.abs(diff) < 0.005) return { cls: 'flat', text: 'Sin cambios' };
    const up = diff > 0;
    const sign = up ? '+' : '−';
    const eur = `${sign}${formatEur(Math.abs(diff))}`;
    const cls = up === goodUp ? 'good' : 'bad';
    if (noPct) return { cls, text: `${up ? '↑' : '↓'} ${eur}`, html: `${up ? '↑' : '↓'} <span class="priv">${eur}</span>` };
    const pct = Math.abs(prev) < 0.005 ? null : (Math.abs(diff) / Math.abs(prev)) * 100;
    const pctTxt = pct == null ? 'nuevo' : `${sign}${pct.toFixed(pct < 10 ? 1 : 0).replace('.', ',')} %`;
    return { cls, text: `${up ? '↑' : '↓'} ${pctTxt} · ${eur}`, html: `${up ? '↑' : '↓'} ${pctTxt} · <span class="priv">${eur}</span>` };
}
function setDelta(id, info) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'delta' + (info ? ' ' + info.cls : '');
    if (info && info.html) el.innerHTML = info.html;   // el porcentaje se queda a la vista; los euros, ocultables
    else el.textContent = info ? info.text : '';
}

// Guardar la elección de comparación en este dispositivo
const CMP_KEY = 'finanzas_cmp';
function loadCompareMode() {
    try {
        const v = localStorage.getItem(CMP_KEY), el = document.getElementById('dash-compare');
        if (v !== null && [...el.options].some(o => o.value === v)) el.value = v;
    } catch (e) { /* sin almacenamiento */ }
}
function onCompareChange() {
    try { localStorage.setItem(CMP_KEY, document.getElementById('dash-compare').value); } catch (e) { /* sin almacenamiento */ }
    renderDashboard();
}

// Saldo de cierre de cada día del periodo. Los días sin movimientos
// mantienen el saldo del día anterior. Las filas llegan de más nuevas a
// más antiguas, así que la primera de cada día es la última del día.
function balanceSeries(period) {
    const close = new Map();
    AppState.rows.forEach(r => { if (r.s != null && !close.has(r.d)) close.set(r.d, r.s); });
    const days = [...close.keys()].sort();
    if (!days.length) return { labels: [], data: [] };

    const first = days[0], lastData = days[days.length - 1];
    let from = period.from || first;
    let to = period.to || lastData;
    if (to > todayIso()) to = todayIso();   // sin días futuros
    if (from < first) from = first;
    if (to < from) return { labels: [], data: [] };

    let i = 0, last = null;
    while (i < days.length && days[i] < from) { last = close.get(days[i]); i++; }
    const labels = [], data = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
        while (i < days.length && days[i] <= d) { last = close.get(days[i]); i++; }
        labels.push(d);
        data.push(last);
    }
    return { labels, data };
}

function renderChartSaldo(period, cmp) {
    const canvas = document.getElementById('chart-saldo');
    if (!canvas) return;
    const box = canvas.parentElement;
    const range = document.getElementById('saldo-range');
    if (chartSaldoInstance) { chartSaldoInstance.destroy(); chartSaldoInstance = null; }

    const { labels, data } = balanceSeries(period);
    if (data.length < 2) {   // con un solo punto no hay evolución que mostrar
        box.classList.add('hidden');
        range.textContent = '';
        return;
    }
    box.classList.remove('hidden');
    range.textContent = `Mín ${formatEur(Math.min(...data))} · Máx ${formatEur(Math.max(...data))}`;

    const th = chartTheme();
    const blue = cssVar('--blue');
    const short = labels.length <= 62;
    const datasets = [{
        label: 'Saldo', data, borderColor: blue, backgroundColor: blue + '22', fill: true,
        tension: 0.3, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4
    }];
    // Línea del periodo comparado, alineada día a día con el actual
    if (cmp) {
        const prev = balanceSeries(cmp).data;
        if (prev.length > 1) {
            datasets.push({
                label: 'Periodo anterior', data: labels.map((_, i) => (i < prev.length ? prev[i] : null)),
                borderColor: cssVar('--gray'), borderDash: [5, 4], borderWidth: 1.5, fill: false,
                tension: 0.3, pointRadius: 0, pointHoverRadius: 3, spanGaps: false
            });
        }
    }
    chartSaldoInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { ...th.tooltip, enabled: !privOn, callbacks: {
                    title: c => formatDateEs(labels[c[0].dataIndex]),
                    label: c => ` ${c.dataset.label === 'Saldo' ? 'Saldo' : 'Periodo anterior'}: ${formatEur(c.raw)}`
                } }
            },
            scales: {
                x: {
                    grid: { display: false }, border: { display: false },
                    ticks: {
                        maxTicksLimit: 5, maxRotation: 0,
                        callback: v => {
                            const d = labels[v];
                            if (!d) return '';
                            return short ? shortDate(d) : `${MONTHS_ES[Number(d.slice(5, 7)) - 1].slice(0, 3)} ${d.slice(2, 4)}`;
                        }
                    }
                },
                y: {
                    grace: '8%', grid: { color: th.grid }, border: { display: false },
                    ticks: { display: !privOn, maxTicksLimit: 4, callback: v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('es-ES') + ' k' : v }
                }
            }
        }
    });
}

function renderDashboard() {
    if (typeof applyDashOrder === 'function') applyDashOrder();   // orden elegido (sincronizado)
    const month = document.getElementById('dash-month').value;
    const period = dashPeriod(month);
    let rows = AppState.rows;
    if (period.from) rows = rows.filter(r => r.d >= period.from && r.d <= period.to);

    const { gasto, ingreso, recovered, cat } = netTotals(rows);
    const balance = ingreso - gasto;
    const tasa = ingreso > 0 ? Math.max(0, (balance / ingreso) * 100) : 0;

    let days = 30;
    if (period.days) { days = period.days; }
    else if (rows.length) {
        const ds = rows.map(r => new Date(r.d));
        days = Math.max(1, Math.ceil(Math.abs(Math.max(...ds) - Math.min(...ds)) / 86400000));
    }

    const saldo = AppState.rows.length ? AppState.rows[0].s : 0;
    document.getElementById('kpi-gasto').textContent = formatEur(gasto);
    document.getElementById('kpi-ingreso').textContent = formatEur(ingreso);
    const balEl = document.getElementById('kpi-balance');
    balEl.textContent = formatEur(balance);
    balEl.className = `stat-value num priv ${balance >= 0 ? 'pos' : 'red'}`;
    balEl.textContent = (balance > 0 ? '+' : '') + formatEur(balance);
    document.getElementById('kpi-ahorro').textContent = tasa.toFixed(1).replace('.', ',') + ' %';
    document.getElementById('kpi-diario').textContent = formatEur(gasto / days);
    document.getElementById('kpi-saldo').textContent = formatEur(saldo);

    const inv = invSummary();
    const pat = document.getElementById('kpi-patrimonio');
    if (inv.valor != null) { pat.classList.remove('hidden'); pat.textContent = `Con inversión: ${formatEur(saldo + inv.valor)}`; }
    else pat.classList.add('hidden');

    // Comparación con otro periodo
    const lastData = lastDataDate();
    const gap = lastData && period.to && lastData < period.to ? daysBetween(lastData, period.to) : 0;
    const cmpMode = document.getElementById('dash-compare').value;
    const cmpFull = comparePeriod(period, cmpMode);
    const cmp = trimCompare(cmpFull, gap);
    const cov = compareCoverage(cmp);
    const note = document.getElementById('dash-cmp-note');
    let cmpTot = null;
    if (cmp && cov === 'full') {
        cmpTot = netTotals(AppState.rows.filter(r => r.d >= cmp.from && r.d <= cmp.to));
        const cBalance = cmpTot.ingreso - cmpTot.gasto;
        const cTasa = cmpTot.ingreso > 0 ? Math.max(0, (cBalance / cmpTot.ingreso) * 100) : 0;
        setDelta('d-gasto', deltaInfo(gasto, cmpTot.gasto, false));
        setDelta('d-ingreso', deltaInfo(ingreso, cmpTot.ingreso, true));
        setDelta('d-balance', deltaInfo(balance, cBalance, true, true));
        const pp = tasa - cTasa;
        setDelta('d-ahorro', Math.abs(pp) < 0.05 ? { cls: 'flat', text: 'Sin cambios' }
            : { cls: pp > 0 ? 'good' : 'bad', text: `${pp > 0 ? '↑ +' : '↓ −'}${Math.abs(pp).toFixed(1).replace('.', ',')} pts` });
        note.textContent = `Comparado con ${cmp.label}` + (gap > 0 ? ` · tus movimientos llegan hasta el ${formatDateEs(lastData)}` : '');
    } else {
        ['d-gasto', 'd-ingreso', 'd-balance', 'd-ahorro'].forEach(id => setDelta(id, null));
        if (!cmp) note.textContent = !cmpMode ? '' : period.kind === 'all' ? 'Elige un periodo concreto para comparar' : 'Aún no hay movimientos recientes para comparar';
        else if (cov === 'none') note.textContent = `Sin movimientos de ${cmp.label} para comparar`;
        else note.textContent = `Faltan datos de ${cmp.label}: la comparación no sería fiable`;
    }

    renderChartSaldo(period, cmpTot ? cmp : null);
    renderChartMensual();
    renderChartCategorias(cat, cmpTot ? cmpTot.cat : null);
    renderTopShops(rows.filter(r => r.i < 0 && !isInvCat(r.cat)));
    renderInsights(cat, gasto, recovered, cmpTot ? { cat: cmpTot.cat, label: cmp.label } : null);
    if (typeof renderForecast === 'function') renderForecast();
    if (typeof renderCierre === 'function') renderCierre();
}

// Estilo común de los gráficos (tipografía y colores del sistema)
function chartTheme() {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 11;
    Chart.defaults.color = dark ? 'rgba(235,235,245,.6)' : 'rgba(60,60,67,.6)';
    return {
        grid: dark ? 'rgba(84,84,88,.45)' : 'rgba(60,60,67,.1)',
        card: cssVar('--card'),
        tooltip: {
            backgroundColor: dark ? 'rgba(44,44,46,.96)' : 'rgba(255,255,255,.98)',
            titleColor: dark ? '#fff' : '#000', bodyColor: dark ? '#fff' : '#000',
            borderColor: dark ? 'rgba(84,84,88,.6)' : 'rgba(60,60,67,.15)', borderWidth: .5,
            padding: 10, cornerRadius: 10, boxPadding: 4, usePointStyle: true,
            titleFont: { weight: '600' }
        }
    };
}

function renderChartMensual() {
    const ctx = document.getElementById('chart-mensual').getContext('2d');
    const months = getUniqueMonths().slice(0, 12).reverse();
    const g = [], inc = [];
    months.forEach(m => {
        const t = netTotals(AppState.rows.filter(r => r.d.startsWith(m)));
        g.push(t.gasto); inc.push(t.ingreso);
    });
    const th = chartTheme();
    if (chartMensualInstance) chartMensualInstance.destroy();
    chartMensualInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months.map(m => MONTHS_ES[Number(m.slice(5)) - 1].slice(0, 3)),
            datasets: [
                { label: 'Ingresos', data: inc, backgroundColor: cssVar('--green'), borderRadius: 5, borderSkipped: false, maxBarThickness: 14, categoryPercentage: .6, barPercentage: .8 },
                { label: 'Gastos', data: g, backgroundColor: cssVar('--red'), borderRadius: 5, borderSkipped: false, maxBarThickness: 14, categoryPercentage: .6, barPercentage: .8 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, padding: 14 } },
                tooltip: { ...th.tooltip, enabled: !privOn, callbacks: { title: c => monthName(months[c[0].dataIndex]), label: c => ` ${c.dataset.label}: ${formatEur(c.raw)}` } }
            },
            scales: {
                x: { grid: { display: false }, border: { display: false } },
                y: { grid: { color: th.grid }, border: { display: false }, ticks: { display: !privOn, maxTicksLimit: 5, callback: v => v >= 1000 ? (v / 1000).toLocaleString('es-ES') + ' k' : v } }
            }
        }
    });
}

function renderChartCategorias(catTotals, prevCat) {
    const ctx = document.getElementById('chart-categorias').getContext('2d');
    const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(c => c[0]), data = sorted.map(c => c[1]);
    const total = data.reduce((a, b) => a + b, 0);
    const colors = labels.map(c => cssVar(catStyle(c)[1]));
    const th = chartTheme();
    if (chartCategoriasInstance) chartCategoriasInstance.destroy();
    chartCategoriasInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: th.card, borderWidth: 3, borderRadius: 4, hoverOffset: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '72%',
            onClick: (e, els) => { if (els.length) drillToMovs({ type: 'expense', cat: labels[els[0].index] }); },
            onHover: (e, els) => { if (e.native && e.native.target) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
            plugins: {
                legend: { display: false },
                tooltip: { ...th.tooltip, callbacks: { label: c => { const pc = total > 0 ? ((c.raw / total) * 100).toFixed(0) : 0; return privOn ? ` ${c.label}: ${pc}%` : ` ${c.label}: ${formatEur(c.raw)} (${pc}%)`; } } }
            }
        },
        plugins: [{
            id: 'centerText',
            afterDraw(chart) {
                const { ctx: c, chartArea: a } = chart;
                const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
                c.save(); c.textAlign = 'center';
                c.fillStyle = Chart.defaults.color; c.font = `600 12px ${Chart.defaults.font.family}`;
                if (privOn) { c.fillText('Gasto', x, y + 4); c.restore(); return; }
                c.fillText('Gasto', x, y - 12);
                c.fillStyle = cssVar('--label'); c.font = `700 20px ${Chart.defaults.font.family}`;
                c.fillText(formatEur(total).replace(/,\d\d\s/, ' '), x, y + 12);
                c.restore();
            }
        }]
    });

    const legend = document.getElementById('cat-legend');
    const catDelta = c => {
        if (!prevCat) return '';
        const d = deltaInfo(catTotals[c], prevCat[c] || 0, false);
        return `<span class="cat-delta ${d.cls}">${d.text.replace(/ · .*$/, '')}</span>`;
    };
    legend.innerHTML = sorted.length ? `<div class="group" style="box-shadow:none;background:transparent">${sorted.map(([c, v]) => `
        <button type="button" class="row tap" data-cat="${esc(c)}" onclick="drillFromEl(this)" style="padding:8px 4px;min-height:0;--sep-left:26px;text-align:left;width:100%">
            <span class="legend-dot" style="background:var(${catStyle(c)[1]})"></span>
            <span class="row-main" style="font-size:14px">${esc(c)}${catDelta(c)}</span>
            <span class="small muted num">${total > 0 ? Math.round(v / total * 100) : 0}%</span>
            <span class="small bold num priv" style="min-width:84px;text-align:right">${formatEur(v)}</span>
        </button>`).join('')}</div>` : '<p class="small muted center">Sin gastos en este periodo.</p>';
}

function renderTopShops(expenseRows) {
    const totals = {}, cats = {}, counts = {};
    const map = byKeyMap();
    expenseRows.forEach(r => {
        const s = r.c.trim();
        const rec = (r.bz || []).reduce((a, k) => a + ((map.get(k) || {}).i || 0), 0);
        totals[s] = (totals[s] || 0) + Math.abs(r.i) - rec;
        cats[s] = r.cat; counts[s] = (counts[s] || 0) + 1;
    });
    const sorted = Object.entries(totals).filter(e => e[1] > 0.005).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const cont = document.getElementById('top-shops-list');
    if (!sorted.length) { cont.innerHTML = '<div class="row"><span class="muted small">Sin gastos en este periodo.</span></div>'; return; }
    const max = sorted[0][1];
    cont.innerHTML = sorted.map(([name, amt]) => `
        <div class="row with-icon">
            ${catIcon(cats[name])}
            <div class="row-main">
                <div class="flex justify-between gap-2">
                    <span class="row-title truncate" style="font-size:15px" title="${esc(name)}">${esc(name)}</span>
                    <span class="bold num priv" style="font-size:15px">${formatEur(amt)}</span>
                </div>
                <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, Math.round(amt / max * 100))}%;background:var(${catStyle(cats[name])[1]})"></div></div>
                <div class="row-sub">${counts[name]} ${counts[name] === 1 ? 'pago' : 'pagos'}</div>
            </div>
        </div>`).join('');
}

function renderInsights(cat, gasto, recovered, cmp) {
    const cont = document.getElementById('insights-container');
    const top = Object.entries(cat).sort((a, b) => b[1] - a[1])[0];
    if (!top) { cont.innerHTML = '<div class="row"><span class="muted small">Aún no hay datos suficientes.</span></div>'; return; }
    const pct = gasto > 0 ? ((top[1] / gasto) * 100).toFixed(0) : 0;
    const item = (icon, color, title, text) => `
        <div class="row with-icon" style="align-items:flex-start">
            <span class="icon-tile" style="background:var(${color})"><i class="ic ic-${icon}"></i></span>
            <div class="row-main"><div class="row-title bold" style="font-size:15px">${title}</div><div class="row-sub" style="white-space:normal">${text}</div></div>
        </div>`;
    let html = item(catStyle(top[0])[0], catStyle(top[0])[1], esc(top[0]), `Es tu mayor gasto: <b>${pct}%</b> del total (<span class="priv">${formatEur(top[1])}</span>).`);
    if (cmp) {   // categoría con mayor cambio respecto al periodo comparado
        const names = new Set([...Object.keys(cat), ...Object.keys(cmp.cat)]);
        let best = null;
        names.forEach(n => {
            const cur = cat[n] || 0, prev = cmp.cat[n] || 0, diff = cur - prev;
            if (Math.abs(diff) >= 20 && Math.abs(diff) >= prev * 0.1 && (!best || Math.abs(diff) > Math.abs(best.diff))) best = { n, diff, prev };
        });
        if (best) {
            const up = best.diff > 0, pct = best.prev > 0 ? ` (${up ? '+' : '−'}${Math.round(Math.abs(best.diff) / best.prev * 100)} %)` : '';
            html += item(up ? 'trending-up' : 'arrow-down', up ? '--orange' : '--green', esc(best.n),
                `${up ? 'Ha subido' : 'Ha bajado'} <b class="priv">${formatEur(Math.abs(best.diff))}</b>${pct} respecto a ${esc(cmp.label)}.`);
        }
    }
    if (recovered > 0) html += item('users', '--teal', 'Bizums recuperados', `Te han devuelto <b class="priv">${formatEur(recovered)}</b> de gastos compartidos.`);
    cont.innerHTML = html;
}
