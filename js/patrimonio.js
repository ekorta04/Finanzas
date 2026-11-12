/* ==========================================================================
   PATRIMONIO A LO LARGO DEL TIEMPO
   Fin de cada mes: saldo de la cuenta (último movimiento del mes) + valor de la
   cartera (último valor anotado hasta esa fecha). Antes del primer valor
   anotado la inversión no cuenta. Euros con clase "priv"; el % no.
   ========================================================================== */

let chartPatrimonioInstance = null;
let patrimonioAll = false;   // false = últimos 12 meses; solo en memoria

function patrimonioSeries() {
    if (!AppState.rows.length) return [];
    const byMonth = {};   // rows va de más nuevo a más antiguo: el primero de cada mes es el de fin de mes
    AppState.rows.forEach(r => { if (r.s != null && byMonth[r.d.slice(0, 7)] === undefined) byMonth[r.d.slice(0, 7)] = r.s; });
    const keys = Object.keys(byMonth).sort();
    if (!keys.length) return [];
    const vals = [...AppState.invValues].sort((a, b) => a.d.localeCompare(b.d));
    const out = [];
    let liq = byMonth[keys[0]];
    let [y, m] = keys[0].split('-').map(Number);
    const last = keys[keys.length - 1];
    for (;;) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        if (byMonth[key] !== undefined) liq = byMonth[key];
        const end = key + '-31';
        let inv = null;
        vals.forEach(v => { if (v.d <= end) inv = v.v; });
        out.push({ m: key, liq, inv, total: liq + (inv || 0) });
        if (key >= last) break;
        if (++m > 12) { m = 1; y++; }
    }
    return out;
}

function setPatrimonioRange(all) { patrimonioAll = all; renderPatrimonio(); }

function renderPatrimonio() {
    const body = document.getElementById('pat-body');
    if (!body) return;
    const all = patrimonioSeries();
    const hasInv = all.some(p => p.inv != null);
    const data = patrimonioAll ? all : all.slice(-12);
    document.getElementById('pat-r12').classList.toggle('active', !patrimonioAll);
    document.getElementById('pat-rall').classList.toggle('active', patrimonioAll);
    if (chartPatrimonioInstance) { chartPatrimonioInstance.destroy(); chartPatrimonioInstance = null; }
    const wrap = document.getElementById('pat-chart-box'), head = document.getElementById('pat-head');
    if (data.length < 2) {
        wrap.classList.add('hidden');
        head.innerHTML = '<p class="small muted center">Necesito al menos dos meses de movimientos para dibujar la evolución.</p>';
        return;
    }
    wrap.classList.remove('hidden');
    // Si hay cartera anotada, se compara desde el primer mes en que se conoce (si no, el salto sería falso)
    const first = (hasInv && data.find(p => p.inv != null)) || data[0], cur = data[data.length - 1];
    const diff = cur.total - first.total;
    const pct = first.total > 0.005 ? diff / first.total * 100 : null;
    const sign = diff >= 0 ? '+' : '';
    head.innerHTML = `<div class="pat-total num priv">${formatEur(cur.total)}</div>` +
        `<div class="small ${diff >= 0 ? 'pos' : 'red'}">${pct != null ? `${sign}${pct.toFixed(1).replace('.', ',')} % ` : ''}<span class="priv num">(${sign}${formatEur(diff)})</span> <span class="muted">desde ${monthName(first.m).toLowerCase()}</span></div>` +
        (hasInv ? '' : '<div class="small muted" style="margin-top:4px">Solo cuenta corriente: anota el valor de tu cartera en Inversión para sumarla.</div>');

    const th = chartTheme(), blue = cssVar('--blue'), green = cssVar('--green');
    const ds = [{ label: 'Cuenta', data: data.map(p => p.liq), borderColor: blue, backgroundColor: blue + '55', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, stack: 'p' }];
    if (hasInv) ds.push({ label: 'Inversión', data: data.map(p => p.inv || 0), borderColor: green, backgroundColor: green + '55', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, stack: 'p' });
    chartPatrimonioInstance = new Chart(document.getElementById('chart-patrimonio').getContext('2d'), {
        type: 'line',
        data: { labels: data.map(p => `${MONTHS_ES[Number(p.m.slice(5)) - 1].slice(0, 3)} ${p.m.slice(2, 4)}`), datasets: ds },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: hasInv, position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, padding: 14 } },
                tooltip: { ...th.tooltip, enabled: !privOn, callbacks: { label: c => ` ${c.dataset.label}: ${formatEur(c.raw)}`, footer: items => hasInv ? 'Total: ' + formatEur(items.reduce((a, i) => a + i.raw, 0)) : '' } }
            },
            scales: {
                x: { grid: { display: false }, border: { display: false } },
                y: { stacked: true, grid: { color: th.grid }, border: { display: false }, ticks: { display: !privOn, maxTicksLimit: 5, callback: v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('es-ES') + ' k' : v } }
            }
        }
    });
}
