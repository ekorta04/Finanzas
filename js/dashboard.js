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

function renderDashboard() {
    const month = document.getElementById('dash-month').value;
    let rows = AppState.rows;
    if (month) rows = rows.filter(r => r.d.startsWith(month));

    const { gasto, ingreso, recovered, cat } = netTotals(rows);
    const balance = ingreso - gasto;
    const tasa = ingreso > 0 ? Math.max(0, (balance / ingreso) * 100) : 0;

    let days = 30;
    if (month) { const [y, m] = month.split('-').map(Number); days = new Date(y, m, 0).getDate(); }
    else if (rows.length) {
        const ds = rows.map(r => new Date(r.d));
        days = Math.max(1, Math.ceil(Math.abs(Math.max(...ds) - Math.min(...ds)) / 86400000));
    }

    const saldo = AppState.rows.length ? AppState.rows[0].s : 0;
    document.getElementById('kpi-gasto').textContent = formatEur(gasto);
    document.getElementById('kpi-ingreso').textContent = formatEur(ingreso);
    const balEl = document.getElementById('kpi-balance');
    balEl.textContent = formatEur(balance);
    balEl.className = `text-lg sm:text-xl font-bold tracking-tight ${balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
    document.getElementById('kpi-ahorro').textContent = tasa.toFixed(1) + '%';
    document.getElementById('kpi-diario').textContent = formatEur(gasto / days);
    document.getElementById('kpi-saldo').textContent = formatEur(saldo);

    const inv = invSummary();
    const pat = document.getElementById('kpi-patrimonio');
    if (inv.valor != null) { pat.classList.remove('hidden'); pat.textContent = `+ Inversión ${formatEur(inv.valor)} = ${formatEur(saldo + inv.valor)}`; }
    else pat.classList.add('hidden');

    renderChartMensual();
    renderChartCategorias(cat);
    renderTopShops(rows.filter(r => r.i < 0 && r.cat !== 'Inversión'));
    renderInsights(cat, gasto, recovered);
}

function renderChartMensual() {
    const ctx = document.getElementById('chart-mensual').getContext('2d');
    const months = getUniqueMonths().slice(0, 12).reverse();
    const g = [], inc = [];
    months.forEach(m => { const t = netTotals(AppState.rows.filter(r => r.d.startsWith(m))); g.push(t.gasto); inc.push(t.ingreso); });
    if (chartMensualInstance) chartMensualInstance.destroy();
    chartMensualInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months.map(m => { const [y, mm] = m.split('-'); return `${mm}/${y.slice(2)}`; }),
            datasets: [
                { label: 'Ingresos', data: inc, backgroundColor: 'rgba(16,185,129,0.85)', borderRadius: 6 },
                { label: 'Gastos', data: g, backgroundColor: 'rgba(244,63,94,0.85)', borderRadius: 6 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${formatEur(c.raw)}` } } },
            scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => v >= 1000 ? (v / 1000) + 'k €' : v + ' €' } } }
        }
    });
}

function renderChartCategorias(catTotals) {
    const ctx = document.getElementById('chart-categorias').getContext('2d');
    const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(c => c[0]), data = sorted.map(c => c[1]);
    const total = data.reduce((a, b) => a + b, 0);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1', '#f97316', '#06b6d4', '#84cc16', '#64748b'];
    if (chartCategoriasInstance) chartCategoriasInstance.destroy();
    chartCategoriasInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 2, hoverOffset: 6 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } },
                tooltip: { callbacks: { label: c => ` ${c.label}: ${formatEur(c.raw)} (${total > 0 ? ((c.raw / total) * 100).toFixed(1) : 0}%)` } }
            }
        }
    });
}

function renderTopShops(expenseRows) {
    const totals = {};
    expenseRows.forEach(r => { const s = r.c.trim(); totals[s] = (totals[s] || 0) + Math.abs(r.i); });
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const cont = document.getElementById('top-shops-list');
    if (!sorted.length) { cont.innerHTML = '<p class="text-xs text-slate-400">Sin datos de gastos en este periodo.</p>'; return; }
    const max = sorted[0][1];
    cont.innerHTML = sorted.map(([name, amt]) => `
        <div>
            <div class="flex justify-between text-xs font-semibold mb-1">
                <span class="truncate max-w-[200px]" title="${esc(name)}">${esc(name)}</span>
                <span class="text-rose-600 dark:text-rose-400 font-bold">${formatEur(amt)}</span>
            </div>
            <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden"><div class="bg-brand-500 h-2 rounded-full" style="width:${Math.round(amt / max * 100)}%"></div></div>
        </div>`).join('');
}

function renderInsights(cat, gasto, recovered) {
    const cont = document.getElementById('insights-container');
    const top = Object.entries(cat).sort((a, b) => b[1] - a[1])[0];
    if (!top) { cont.innerHTML = '<p class="text-xs text-slate-400">Sin suficientes datos para generar insights.</p>'; return; }
    const pct = gasto > 0 ? ((top[1] / gasto) * 100).toFixed(1) : 0;
    let html = `
        <div class="p-3 bg-brand-50 dark:bg-brand-900/20 rounded-xl border border-brand-100 dark:border-brand-900/60 flex items-start space-x-3">
            <i class="fa-solid fa-chart-line text-brand-600 dark:text-brand-400 mt-0.5"></i>
            <div><h4 class="text-xs font-bold">Categoría Principal</h4>
            <p class="text-xs mt-0.5"><strong>${esc(top[0])}</strong> representa el <strong>${pct}%</strong> del gasto neto (${formatEur(top[1])}).</p></div>
        </div>`;
    if (recovered > 0) html += `
        <div class="p-3 bg-sky-50 dark:bg-sky-900/20 rounded-xl border border-sky-100 dark:border-sky-900/60 flex items-start space-x-3">
            <i class="fa-solid fa-people-arrows text-sky-600 dark:text-sky-400 mt-0.5"></i>
            <div><h4 class="text-xs font-bold">Bizums recuperados</h4>
            <p class="text-xs mt-0.5">Has recuperado <strong>${formatEur(recovered)}</strong> de gastos compartidos en este periodo.</p></div>
        </div>`;
    cont.innerHTML = html;
}