/* ==========================================================================
   CIERRE DE MES
   Resumen de un mes frente al anterior: gasto, ingresos, ahorro, categorías que
   más suben y bajan y los mayores gastos. Usa los mismos cálculos que el Resumen
   (Bizums vinculados restan del gasto, las aportaciones a inversión no cuentan).
   Las cifras en euros llevan la clase "priv" (modo privado); los porcentajes no.
   ========================================================================== */

let cierreMonth = null;   // mes mostrado (AAAA-MM); solo en memoria

function cierreMonths() {
    const s = new Set();
    AppState.rows.forEach(r => s.add(r.d.slice(0, 7)));
    return [...s].sort();
}

// Por defecto, el último mes ya terminado; si solo hay el mes en curso, ese
function cierreDefault(months) {
    const cur = todayIso().slice(0, 7);
    const done = months.filter(m => m < cur);
    return done.length ? done[done.length - 1] : months[months.length - 1];
}

function cierreMove(dir) {
    const months = cierreMonths();
    const j = months.indexOf(cierreMonth) + dir;
    if (j < 0 || j >= months.length) return;
    cierreMonth = months[j];
    renderCierre();
}

// "septiembre 2026" si es un mes completo; "el mismo tramo del mes anterior" si es un rango de días
function cierreRef(cmp) {
    return /\d{2}\/\d{2}/.test(cmp.label) ? 'el mismo tramo del mes anterior' : cmp.label.toLowerCase();
}

function cierrePct(n) {
    return Math.round(Math.abs(n)).toString();
}

// Frase de arriba: solo porcentajes, así que se ve también en modo privado
function cierreHeadline(month, inProgress, cur, prev, cmp, balance, tasa) {
    const parts = [];
    if (prev && prev.gasto > 0.005) {
        const pct = ((cur.gasto - prev.gasto) / prev.gasto) * 100;
        const verb = inProgress ? 'es' : 'fue';
        parts.push(Math.abs(pct) < 1
            ? `el gasto ${verb} parecido al de ${cierreRef(cmp)}`
            : `el gasto ${verb} un ${cierrePct(pct)} % ${pct > 0 ? 'mayor' : 'menor'} que en ${cierreRef(cmp)}`);
    }
    if (cur.ingreso > 0.005) {
        parts.push(balance > 0
            ? `${inProgress ? 'llevas ahorrado' : 'ahorraste'} el ${tasa.toFixed(0)} % de tus ingresos`
            : `${inProgress ? 'llevas gastado' : 'gastaste'} más de lo que ingresaste`);
    }
    if (!parts.length) return '';
    const mn = monthName(month).toLowerCase();
    return `${inProgress ? 'Hasta hoy en' : 'En'} ${mn}: ${parts.join(' y ')}.`;
}

function renderCierre() {
    const body = document.getElementById('cierre-body');
    if (!body) return;
    const lab = document.getElementById('cierre-label');
    const prevBtn = document.getElementById('cierre-prev'), nextBtn = document.getElementById('cierre-next');
    const months = cierreMonths();
    if (!months.length) {
        lab.textContent = '';
        prevBtn.disabled = nextBtn.disabled = true;
        body.innerHTML = '<p class="small muted center">Importa tus movimientos para ver el cierre del mes.</p>';
        return;
    }
    if (!months.includes(cierreMonth)) cierreMonth = cierreDefault(months);
    const i = months.indexOf(cierreMonth);
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === months.length - 1;
    lab.textContent = monthName(cierreMonth);

    const period = dashPeriod(cierreMonth);
    const inProgress = period.to < period.full;
    const rows = AppState.rows.filter(r => r.d >= period.from && r.d <= period.to);
    const cur = netTotals(rows);
    const balance = cur.ingreso - cur.gasto;
    const tasa = cur.ingreso > 0 ? Math.max(0, (balance / cur.ingreso) * 100) : 0;

    // Mes anterior (o los mismos días si el mes está en curso o los datos no llegan al final)
    const lastData = lastDataDate();
    const gap = lastData && lastData < period.to ? daysBetween(lastData, period.to) : 0;
    const cmp = trimCompare(comparePeriod(period, 'prev'), gap);
    const cov = compareCoverage(cmp);
    const prev = cmp && cov === 'full'
        ? netTotals(AppState.rows.filter(r => r.d >= cmp.from && r.d <= cmp.to)) : null;
    const pBalance = prev ? prev.ingreso - prev.gasto : 0;
    const pTasa = prev && prev.ingreso > 0 ? Math.max(0, (pBalance / prev.ingreso) * 100) : 0;

    const delta = info => info ? `<span class="delta ${info.cls}" style="display:block;margin:2px 0 0">${info.html || info.text}</span>` : '';
    const stat = (title, sub, value, cls) => `
        <div class="row"><span class="row-main"><span class="row-title" style="display:block;font-size:15px">${title}</span>${sub}</span>
        <span class="row-value num priv ${cls || ''}" style="font-size:15px">${value}</span></div>`;

    const pp = tasa - pTasa;
    const ahorroDelta = prev && cur.ingreso > 0 && prev.ingreso > 0
        ? (Math.abs(pp) < 0.05 ? { cls: 'flat', text: 'Sin cambios' }
            : { cls: pp > 0 ? 'good' : 'bad', text: `${pp > 0 ? '↑ +' : '↓ −'}${Math.abs(pp).toFixed(1).replace('.', ',')} pts` }) : null;

    let html = '';
    const lead = cierreHeadline(cierreMonth, inProgress, cur, prev, cmp, balance, tasa);
    if (lead) html += `<p class="cierre-lead">${lead}</p>`;

    html += '<div class="group">' +
        stat('Gastos', delta(prev && deltaInfo(cur.gasto, prev.gasto, false)), formatEur(cur.gasto)) +
        stat('Ingresos', delta(prev && deltaInfo(cur.ingreso, prev.ingreso, true)), formatEur(cur.ingreso)) +
        stat('Ahorro',
            `<span class="row-sub" style="display:block">${tasa.toFixed(1).replace('.', ',')} % de tus ingresos</span>${delta(ahorroDelta)}`,
            (balance > 0 ? '+' : '') + formatEur(balance), balance >= 0 ? 'pos' : 'red') +
        '</div>';

    // Categorías que más cambian respecto al periodo anterior
    if (prev) {
        const names = new Set([...Object.keys(cur.cat), ...Object.keys(prev.cat)]);
        const changes = [...names].map(n => ({ n, now: cur.cat[n] || 0, before: prev.cat[n] || 0 }))
            .map(x => ({ ...x, diff: x.now - x.before })).filter(x => Math.abs(x.diff) >= 15);
        const line = x => {
            const up = x.diff > 0, sign = up ? '+' : '−';
            const pct = x.before > 0 ? `${sign}${cierrePct((x.diff / x.before) * 100)} %` : 'nuevo este mes';
            return `<div class="row with-icon">${catIcon(x.n)}
                <span class="row-main"><span class="row-title" style="display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.n)}</span>
                <span class="row-sub" style="display:block">${pct} frente a ${cierreRef(cmp)}</span></span>
                <span class="row-value num priv ${up ? 'red' : 'pos'}" style="font-size:15px">${sign}${formatEur(Math.abs(x.diff))}</span></div>`;
        };
        const ups = changes.filter(x => x.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 3);
        const downs = changes.filter(x => x.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 2);
        if (ups.length) html += `<h3 class="group-header">Lo que más ha subido</h3><div class="group">${ups.map(line).join('')}</div>`;
        if (downs.length) html += `<h3 class="group-header">Lo que más ha bajado</h3><div class="group">${downs.map(line).join('')}</div>`;
    }

    // Mayores gastos sueltos del mes
    const big = rows.filter(r => r.i < 0 && !isInvCat(r.cat)).sort((a, b) => a.i - b.i).slice(0, 3);
    if (big.length) {
        html += '<h3 class="group-header">Mayores gastos</h3><div class="group">' + big.map(r => `
            <div class="row with-icon">${catIcon(r.cat)}
                <span class="row-main"><span class="row-title" style="display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.c)}</span>
                <span class="row-sub" style="display:block">${formatDateEs(r.d)} · ${esc(catGroup(r.cat))}</span></span>
                <span class="row-value num priv" style="font-size:15px">${formatEur(-r.i)}</span></div>`).join('') + '</div>';
    }

    // Avisos sobre los datos
    const notes = [];
    if (inProgress) notes.push('Mes en curso: se compara con los mismos días del anterior.');
    if (gap > 0) notes.push(`Tus movimientos llegan hasta el ${formatDateEs(lastData)}.`);
    if (!prev) {
        if (!cmp) notes.push('No hay un mes anterior con el que comparar.');
        else if (cov === 'none') notes.push(`Sin movimientos de ${esc(cmp.label)} para comparar.`);
        else notes.push(`Faltan datos de ${esc(cmp.label)}: la comparación no sería fiable.`);
    }
    if (notes.length) html += `<p class="small muted" style="margin:12px 0 0">${notes.join(' ')}</p>`;

    body.innerHTML = html;
}
