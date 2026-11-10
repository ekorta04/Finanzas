/* ==========================================================================
    8. DASHBOARD
    ========================================================================== */
// Gasto/ingreso netos: los Bizums vinculados restan del gasto (y de su categoría) y no cuentan como ingreso
function netTotals(rows) {
    const map = byKeyMap();
    let gasto = 0, ingreso = 0, recovered = 0; const cat = {};
    rows.forEach(r => {
        if (r.cat === 'Inversión') return;
        if (r.i < 0) { gasto += -r.i; cat[r.cat] = (cat[r.cat] || 0) - r.i; }
        else if (r.lk && map.has(r.lk)) { const e = map.get(r.lk); gasto -= r.i; recovered += r.i; cat[e.cat] = (cat[e.cat] || 0) - r.i; }
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

// Periodo elegido en el Resumen: '30d' (últimos 30 días), '' (todo) o 'AAAA-MM'
function dashPeriod(value) {
    if (value === '30d') {
        const to = todayIso();
        return { from: addDays(to, -29), to, days: 30 };
    }
    if (value) {
        const [y, m] = value.split('-').map(Number);
        const last = new Date(y, m, 0).getDate();
        return { from: `${value}-01`, to: `${value}-${String(last).padStart(2, '0')}`, days: last };
    }
    return { from: null, to: null, days: null };
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

function renderChartSaldo(period) {
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
    chartSaldoInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Saldo', data, borderColor: blue, backgroundColor: blue + '22', fill: true,
                tension: 0.3, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { ...th.tooltip, callbacks: {
                    title: c => formatDateEs(labels[c[0].dataIndex]),
                    label: c => ` Saldo: ${formatEur(c.raw)}`
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
                    ticks: { maxTicksLimit: 4, callback: v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('es-ES') + ' k' : v }
                }
            }
        }
    });
}

function renderDashboard() {
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
    balEl.className = `stat-value num ${balance >= 0 ? 'pos' : 'red'}`;
    balEl.textContent = (balance > 0 ? '+' : '') + formatEur(balance);
    document.getElementById('kpi-ahorro').textContent = tasa.toFixed(1).replace('.', ',') + ' %';
    document.getElementById('kpi-diario').textContent = formatEur(gasto / days);
    document.getElementById('kpi-saldo').textContent = formatEur(saldo);

    const inv = invSummary();
    const pat = document.getElementById('kpi-patrimonio');
    if (inv.valor != null) { pat.classList.remove('hidden'); pat.textContent = `Con inversión: ${formatEur(saldo + inv.valor)}`; }
    else pat.classList.add('hidden');

    renderChartSaldo(period);
    renderChartMensual();
    renderChartCategorias(cat);
    renderTopShops(rows.filter(r => r.i < 0 && r.cat !== 'Inversión'));
    renderInsights(cat, gasto, recovered);
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
                tooltip: { ...th.tooltip, callbacks: { title: c => monthName(months[c[0].dataIndex]), label: c => ` ${c.dataset.label}: ${formatEur(c.raw)}` } }
            },
            scales: {
                x: { grid: { display: false }, border: { display: false } },
                y: { grid: { color: th.grid }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: v => v >= 1000 ? (v / 1000).toLocaleString('es-ES') + ' k' : v } }
            }
        }
    });
}

function renderChartCategorias(catTotals) {
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
            plugins: {
                legend: { display: false },
                tooltip: { ...th.tooltip, callbacks: { label: c => ` ${c.label}: ${formatEur(c.raw)} (${total > 0 ? ((c.raw / total) * 100).toFixed(0) : 0}%)` } }
            }
        },
        plugins: [{
            id: 'centerText',
            afterDraw(chart) {
                const { ctx: c, chartArea: a } = chart;
                const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
                c.save(); c.textAlign = 'center';
                c.fillStyle = Chart.defaults.color; c.font = `600 12px ${Chart.defaults.font.family}`;
                c.fillText('Gasto', x, y - 12);
                c.fillStyle = cssVar('--label'); c.font = `700 20px ${Chart.defaults.font.family}`;
                c.fillText(formatEur(total).replace(/,\d\d\s/, ' '), x, y + 12);
                c.restore();
            }
        }]
    });

    const legend = document.getElementById('cat-legend');
    legend.innerHTML = sorted.length ? `<div class="group" style="box-shadow:none;background:transparent">${sorted.map(([c, v]) => `
        <div class="row" style="padding:8px 4px;min-height:0;--sep-left:26px">
            <span class="legend-dot" style="background:var(${catStyle(c)[1]})"></span>
            <span class="row-main" style="font-size:14px">${esc(c)}</span>
            <span class="small muted num">${total > 0 ? Math.round(v / total * 100) : 0}%</span>
            <span class="small bold num" style="min-width:84px;text-align:right">${formatEur(v)}</span>
        </div>`).join('')}</div>` : '<p class="small muted center">Sin gastos en este periodo.</p>';
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
                    <span class="bold num" style="font-size:15px">${formatEur(amt)}</span>
                </div>
                <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, Math.round(amt / max * 100))}%;background:var(${catStyle(cats[name])[1]})"></div></div>
                <div class="row-sub">${counts[name]} ${counts[name] === 1 ? 'pago' : 'pagos'}</div>
            </div>
        </div>`).join('');
}

function renderInsights(cat, gasto, recovered) {
    const cont = document.getElementById('insights-container');
    const top = Object.entries(cat).sort((a, b) => b[1] - a[1])[0];
    if (!top) { cont.innerHTML = '<div class="row"><span class="muted small">Aún no hay datos suficientes.</span></div>'; return; }
    const pct = gasto > 0 ? ((top[1] / gasto) * 100).toFixed(0) : 0;
    const item = (icon, color, title, text) => `
        <div class="row with-icon" style="align-items:flex-start">
            <span class="icon-tile" style="background:var(${color})"><i class="ic ic-${icon}"></i></span>
            <div class="row-main"><div class="row-title bold" style="font-size:15px">${title}</div><div class="row-sub" style="white-space:normal">${text}</div></div>
        </div>`;
    let html = item(catStyle(top[0])[0], catStyle(top[0])[1], esc(top[0]), `Es tu mayor gasto: <b>${pct}%</b> del total (${formatEur(top[1])}).`);
    if (recovered > 0) html += item('users', '--teal', 'Bizums recuperados', `Te han devuelto <b>${formatEur(recovered)}</b> de gastos compartidos.`);
    const subs = cat['Suscripciones'];
    if (subs) html += item('repeat', '--purple', 'Suscripciones', `Llevas <b>${formatEur(subs)}</b> en suscripciones en este periodo.`);
    cont.innerHTML = html;
}
