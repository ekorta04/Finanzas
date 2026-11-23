/* ==========================================================================
    13. SUSCRIPCIONES Y RECIBOS
    Detecta los cargos que se repiten (semanal, mensual, trimestral, anual…),
    calcula lo que cuestan al mes y al año, los próximos cobros y las subidas
    de precio. Tú decides qué es una suscripción: confirmar, ignorar o marcar
    como cancelada. Las decisiones y las suscripciones manuales se guardan en
    AppState.subs y se sincronizan entre dispositivos.
    ========================================================================== */
const SUB_CADS = {
    w:    { name: 'cada semana',     py: 365.25 / 7, days: 7 },
    m:    { name: 'cada mes',        py: 12, step: 1 },
    '2m': { name: 'cada 2 meses',    py: 6,  step: 2 },
    '3m': { name: 'cada trimestre',  py: 4,  step: 3 },
    '6m': { name: 'cada 6 meses',    py: 2,  step: 6 },
    y:    { name: 'cada año',        py: 1,  step: 12 }
};
const SUB_CAT_SUB = 'Vida y entretenimiento › Libros, audio, suscripciones';
const SUB_CAT_REC = 'Gastos financieros › Cargos, tarifas';
// Servicios que casi siempre son suscripciones digitales
const SUB_KNOWN = /NETFLIX|SPOTIFY|HBO|DISNEY|YOUTUBE|ICLOUD|APPLE|PRIME|GOOGLE|MICROSOFT|ADOBE|DROPBOX|CHATGPT|OPENAI|ANTHROPIC|CLAUDE|GEMINI|PATREON|TWITCH|DAZN|FILMIN|MOVISTAR|CRUNCHYROLL|AUDIBLE|KINDLE|NOTION|CANVA|NORDVPN|PASSWORD|DUOLINGO|STRAVA|COURSERA|LINKEDIN|PLAYSTATION|XBOX|NINTENDO|STEAM|GITHUB|SUPABASE|FIGMA|ZOOM|SLACK/;
const SUB_CATS_SUB = new Set(['Vida y entretenimiento › TV, Streaming', SUB_CAT_SUB, 'Comunicación, PC › Software, aplicaciones, juegos']);
// Categorías donde un comercio habitual (súper, gasolinera…) no es una suscripción: solo se acepta si el importe es casi idéntico
const subRisky = c => ['Comida y bebida', 'Compras', 'Transporte'].includes(catGroup(c)) || /Combustible|Estacionamiento/.test(c);

const SubUI = { f: 'all', open: null, items: [], showNo: false };

const subStep = cad => (SUB_CADS[cad] || SUB_CADS.m);
function subAdvance(d, cad, dom) { const c = subStep(cad); return c.days ? addDays(d, c.days) : addMonthsIso(d, c.step, dom); }
function subRetreat(d, cad) { const c = subStep(cad); return c.days ? addDays(d, -c.days) : addMonthsIso(d, -c.step); }
function subCadFromGap(g) {
    return g >= 6 && g <= 8 ? 'w' : g >= 25 && g <= 36 ? 'm' : g >= 55 && g <= 67 ? '2m' : g >= 84 && g <= 98 ? '3m'
        : g >= 170 && g <= 195 ? '6m' : g >= 350 && g <= 380 ? 'y' : null;
}
// Primera fecha de cobro igual o posterior a "from"
function subNextFrom(it, from) {
    const dom = Number(it.last.slice(8, 10));
    let d = it.last;
    for (let g = 0; d < from && g < 600; g++) d = subAdvance(d, it.cad, dom);
    return d;
}
const subPerYear = it => it.amount * subStep(it.cad).py;
const subPerMonth = it => subPerYear(it) / 12;

/* --------------------------------------------------------------------------
   DETECCIÓN
   -------------------------------------------------------------------------- */
function subsDetect(rows, ref) {
    const since = addMonthsIso(ref, -26);
    const groups = new Map();
    rows.forEach(r => {
        if (r.i >= 0 || r.d > ref || r.d < since || r.lk || (r.bz && r.bz.length) || isInvCat(r.cat) || isBizum(r)) return;
        const key = fcKey(r);
        if (!key) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    });

    const out = [];
    groups.forEach((list, key) => {
        const byDay = new Map();   // varios cargos el mismo día cuentan como uno
        list.forEach(r => byDay.set(r.d, (byDay.get(r.d) || 0) - r.i));
        const days = [...byDay.keys()].sort();
        if (days.length < 2) return;
        const ma = fcMedian(days.map(d => byDay.get(d)));
        if (ma < 0.5) return;

        const catCount = {};
        list.forEach(r => { catCount[r.cat] = (catCount[r.cat] || 0) + 1; });
        const cat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0][0];
        const risky = subRisky(cat);

        const attempt = tol => {
            const reg = days.filter(d => Math.abs(byDay.get(d) - ma) <= ma * tol);
            if (reg.length < 2 || reg.length / days.length < 0.6) return null;
            const gaps = reg.slice(1).map((d, i) => daysBetween(reg[i], d));
            const med = fcMedian(gaps), cad = subCadFromGap(med);
            if (!cad) return null;
            if (reg.length < (cad === 'y' || cad === '6m' ? 2 : cad === 'w' ? 5 : 3)) return null;
            const t = cad === 'w' ? 2 : Math.max(4, med * 0.15);
            const ok = gaps.filter(g => Math.abs(g - med) <= t).length;
            if (ok / gaps.length < 0.7) return null;
            const am = reg.map(d => byDay.get(d));
            const spread = (Math.max(...am) - Math.min(...am)) / ma;
            if ((cad === 'y' || cad === '6m') && spread > 0.2) return null;
            return { reg, cad, med, am, spread };
        };

        let res = risky ? attempt(0.03) : attempt(0.4);
        if (res && res.cad === 'w' && !risky) res = attempt(0.12);   // lo semanal solo si el importe es casi fijo
        if (!res) return;

        const { reg, cad, med, am } = res;
        const last = reg[reg.length - 1], amount = am[am.length - 1];

        // Subida de precio: último cambio de importe. Si cambia casi siempre (luz, agua…), es un recibo variable
        let changes = 0, rise = null;
        for (let j = am.length - 1; j >= 1; j--) {
            const df = am[j] - am[j - 1];
            if (Math.abs(df) / am[j - 1] > 0.02 && Math.abs(df) >= 0.1) {
                changes++;
                if (!rise && df > 0) rise = { from: am[j - 1], to: am[j], date: reg[j], pct: df / am[j - 1] * 100 };
                if (!rise && df < 0) break;   // la última variación fue una bajada
            }
        }
        const variable = changes > 2 || res.spread > 0.25;
        if (variable || (rise && daysBetween(rise.date, ref) > 180)) rise = null;

        const regSet = new Set(reg);
        const isSub = SUB_CATS_SUB.has(cat) || SUB_KNOWN.test(key);
        out.push({
            key, cad, amount, last, first: reg[0], n: reg.length, cat, variable, rise,
            total: am.reduce((a, b) => a + b, 0),
            name: key.slice(2).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()),
            type: isSub ? 'sub' : 'rec',
            active: daysBetween(last, ref) <= med * 1.6 + (cad === 'w' ? 7 : 0),
            rowKeys: list.filter(r => regSet.has(r.d)).map(r => r.k)
        });
    });
    return out;
}

/* --------------------------------------------------------------------------
   MODELO: detectadas + decisiones del usuario + manuales
   -------------------------------------------------------------------------- */
function subsBuild() {
    const rows = AppState.rows, recs = Array.isArray(AppState.subs) ? AppState.subs : [];
    const ref = rows.length ? lastDataDate() : todayIso();
    const today = todayIso();
    const byKey = new Map(recs.filter(r => r.key).map(r => [r.key, r]));
    const items = [];

    (rows.length ? subsDetect(rows, ref) : []).forEach(s => {
        const rec = byKey.get(s.key);
        items.push(Object.assign({}, s, {
            id: 'k:' + s.key, st: rec ? rec.st : 'new', manual: false,
            name: (rec && rec.name) || s.name, type: (rec && rec.type) || s.type
        }));
    });
    recs.filter(r => r.manual).forEach(r => {
        const cad = SUB_CADS[r.cad] ? r.cad : 'm';
        const it = {
            id: r.id, key: null, manual: true, st: r.st === 'end' ? 'end' : 'ok', name: r.name, type: r.type === 'rec' ? 'rec' : 'sub',
            cad, amount: Number(r.amount) || 0, cat: r.type === 'rec' ? SUB_CAT_REC : SUB_CAT_SUB,
            n: 0, total: 0, first: null, variable: false, rise: null, active: true, rowKeys: []
        };
        it.last = subRetreat(r.next && /^\d{4}-\d{2}-\d{2}$/.test(r.next) ? r.next : today, cad);
        items.push(it);
    });
    items.forEach(it => { it.nextDate = it.st === 'end' || it.st === 'no' ? null : subNextFrom(it, today); });

    // Totales: solo lo confirmado y que sigue cobrándose
    const live = items.filter(it => it.st === 'ok' && it.active);
    const sum = f => live.filter(f).reduce((a, it) => a + subPerMonth(it), 0);
    const totals = {
        month: sum(() => true), subMonth: sum(it => it.type === 'sub'), recMonth: sum(it => it.type === 'rec'),
        subN: live.filter(it => it.type === 'sub').length, recN: live.filter(it => it.type === 'rec').length, n: live.length
    };
    totals.year = totals.month * 12;

    // Ingresos medios al mes (últimos ~90 días de datos) para ver qué parte se va en recibos fijos
    let income = 0;
    if (rows.length) {
        const from = addDays(ref, -89), first = rows.reduce((m, r) => r.d < m ? r.d : m, ref);
        const span = Math.min(90, daysBetween(first, ref) + 1);
        const inc = rows.filter(r => r.i > 0 && r.d >= from && r.d <= ref && !r.lk && !isBizum(r) && !isInvCat(r.cat)).reduce((a, r) => a + r.i, 0);
        income = span >= 28 ? inc / (span / FC_DAYS_MONTH) : 0;
    }
    totals.pct = income > 0 ? totals.month / income * 100 : null;

    // Próximos 30 días
    const end = addDays(today, 30), upcoming = [];
    live.forEach(it => {
        const dom = Number(it.last.slice(8, 10));
        let d = subNextFrom(it, today);
        for (let g = 0; d <= end && g < 12; g++) { upcoming.push({ d, it }); d = subAdvance(d, it.cad, dom); }
    });
    upcoming.sort((a, b) => a.d.localeCompare(b.d) || b.it.amount - a.it.amount);

    return { items, totals, upcoming, ref, today, hasRows: rows.length > 0 };
}

/* --------------------------------------------------------------------------
   ACCIONES
   -------------------------------------------------------------------------- */
function subsRecord(it) {
    if (!Array.isArray(AppState.subs)) AppState.subs = [];
    let rec = AppState.subs.find(r => r.id === it.id);
    if (!rec) { rec = { id: it.id, key: it.key || null, st: 'ok' }; AppState.subs.push(rec); }
    return rec;
}
function subToggle(i) { SubUI.open = SubUI.open === i ? null : i; renderSubs(); }
function subAct(i, act) {
    const it = SubUI.items[i];
    if (!it) return;
    if (act === 'del') {
        AppState.subs = (AppState.subs || []).filter(r => r.id !== it.id);
        showToast('Eliminada');
    } else if (act === 'type') {
        const rec = subsRecord(it);
        rec.name = it.name; rec.type = it.type === 'sub' ? 'rec' : 'sub';
    } else if (act === 'movs') {
        subShowMovs(it);
        return;
    } else {
        const rec = subsRecord(it);
        rec.st = act;   // ok | no | end
        rec.name = it.name; rec.type = it.type;
        if (act === 'no' || act === 'end') SubUI.open = null;
        showToast(act === 'ok' ? 'Suscripción confirmada' : act === 'end' ? 'Marcada como cancelada' : 'Ignorada');
    }
    saveState();
    renderSubs();
}
// Abre Movimientos buscando los cobros de esa suscripción
function subShowMovs(it) {
    movsLimit = 150;
    ['filter-tag', 'filter-month', 'filter-date-from', 'filter-date-to', 'filter-cat'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('filter-search').value = it.key ? it.key.slice(2).split(' ')[0] : it.name;
    document.getElementById('filter-type').value = 'all';
    if (typeof MovsExtra !== 'undefined') MovsExtra.noInv = false;
    switchTab('v-movs');
    showMovsView('list');
    toggleFilters(false);
    renderMovimientos();
}
function subSetFilter(f) { SubUI.f = f; SubUI.open = null; renderSubs(); }
function subToggleNo() { SubUI.showNo = !SubUI.showNo; renderSubs(); }
function subAddManual() {
    const name = document.getElementById('sub-name').value.trim();
    const amount = parseFlexNum(document.getElementById('sub-amount').value);
    const cad = document.getElementById('sub-cad').value;
    const next = document.getElementById('sub-next').value;
    const type = document.getElementById('sub-type').value;
    if (!name) { showToast('Escribe el nombre', 'error'); return; }
    if (!(amount > 0)) { showToast('Escribe un importe mayor que 0', 'error'); return; }
    if (!next) { showToast('Indica la fecha del próximo cobro', 'error'); return; }
    if (!Array.isArray(AppState.subs)) AppState.subs = [];
    AppState.subs.push({ id: 'm:' + Date.now().toString(36), key: null, manual: true, st: 'ok', name: name.slice(0, 40), amount: Math.round(amount * 100) / 100, cad: SUB_CADS[cad] ? cad : 'm', next, type: type === 'rec' ? 'rec' : 'sub' });
    ['sub-name', 'sub-amount'].forEach(id => { document.getElementById(id).value = ''; });
    saveState();
    renderSubs();
    showToast('Suscripción añadida');
}

/* --------------------------------------------------------------------------
   PANTALLA
   -------------------------------------------------------------------------- */
const subMoney = v => formatEur(v);
const subEur0 = v => formatEur(Math.round(v)).replace(/,00\s/, ' ');

function subRow(it, i, opts = {}) {
    const open = SubUI.open === i;
    const c = subStep(it.cad);
    const dead = it.st === 'end' || it.st === 'no';
    const stale = it.st === 'ok' && !it.active;
    let sub = c.name;
    if (it.nextDate && !stale) sub += ` · próximo ${shortDate(it.nextDate)}`;
    if (stale) sub += ` · último cobro ${shortDate(it.last)}`;
    if (it.cad !== 'm') sub += ` · ${subEur0(subPerMonth(it))}/mes`;
    if (it.variable) sub += ' · importe variable';
    if (it.rise) sub += ` · ↑ ${Math.round(it.rise.pct)} %`;
    const cls = (dead || stale ? ' fc-off' : '');
    let html = `<button type="button" class="row with-icon tap${cls}" onclick="subToggle(${i})" aria-expanded="${open}">
        ${catIcon(it.cat)}
        <span class="row-main"><span class="row-title" style="display:block;white-space:nowrap">${esc(it.name)}</span>
        <span class="row-sub" style="display:block;white-space:nowrap">${esc(sub)}</span></span>
        <span class="row-value num priv">${subMoney(it.amount)}</span>
    </button>`;
    if (open || opts.always) {
        const facts = [];
        if (it.n) facts.push(`${it.n} cobros desde ${shortDate(it.first)} ${it.first.slice(0, 4)}`, `${subEur0(it.total)} en total`);
        else facts.push('Añadida a mano');
        facts.push(`${subEur0(subPerYear(it))} al año`);
        if (it.rise) facts.push(`Subió de ${subMoney(it.rise.from)} a ${subMoney(it.rise.to)} el ${shortDate(it.rise.date)}`);
        if (it.st === 'end') facts.push(`Ahorras ${subEur0(subPerYear(it))} al año`);
        const b = (act, label, kind = '') => `<button type="button" class="btn xs ${kind}" onclick="subAct(${i},'${act}')">${label}</button>`;
        const btns = [];
        if (it.st === 'new') btns.push(b('ok', '<i class="ic ic-check"></i> Es una suscripción', 'tinted'), b('no', 'Ignorar', 'gray'));
        else if (it.st === 'ok') btns.push(b('end', 'Marcar cancelada', 'gray'));
        else btns.push(b('ok', 'Reactivar', 'tinted'));
        if (!it.manual && it.st !== 'new') btns.push(b('type', it.type === 'sub' ? 'Pasar a recibo' : 'Pasar a suscripción', 'gray'));
        if (!it.manual) btns.push(b('movs', 'Ver cobros', 'gray'));
        else btns.push(b('del', 'Eliminar', 'danger'));
        html += `<div class="sub-detail"><div class="sub-facts num priv">${facts.map(esc).join(' · ')}</div><div class="sub-actions">${btns.join('')}</div></div>`;
    }
    return html;
}

function renderSubs() {
    const root = document.getElementById('subs-root');
    if (!root) return;
    const m = subsBuild();
    const { items, totals } = m;
    SubUI.items = items;
    const idx = new Map(items.map((it, i) => [it, i]));
    const passF = it => SubUI.f === 'all' || it.type === SubUI.f;
    const grp = (title, body, footer) => body ? `<div><h3 class="group-header">${title}</h3><div class="group">${body}</div>${footer ? `<p class="group-footer">${footer}</p>` : ''}</div>` : '';
    const rowsOf = (list, opts) => list.map(it => subRow(it, idx.get(it), opts)).join('');
    const byAmount = (a, b) => subPerMonth(b) - subPerMonth(a);

    const pending = items.filter(it => it.st === 'new' && it.active).sort(byAmount);
    const active = items.filter(it => it.st === 'ok' && it.active && passF(it)).sort(byAmount);
    const stale = items.filter(it => it.st === 'ok' && !it.active && passF(it)).sort(byAmount);
    const ended = items.filter(it => it.st === 'end' && passF(it)).sort(byAmount);
    const ignored = items.filter(it => it.st === 'no').sort(byAmount);
    const rises = items.filter(it => it.rise && it.st !== 'no' && it.st !== 'end').sort((a, b) => b.rise.date.localeCompare(a.rise.date));

    let h = '';

    // Resumen
    if (!m.hasRows && !items.length) {
        h += `<div class="card"><div class="muted small">Importa tus movimientos para detectar tus suscripciones, o añade una a mano abajo.</div></div>`;
    } else {
        const pct = totals.pct != null ? ` · ${totals.pct.toFixed(1).replace('.', ',')} % de tus ingresos` : '';
        h += `<div class="card" id="subs-summary">
            <div class="fc-label">Gasto fijo al mes</div>
            <div class="fc-amount num priv">${subMoney(totals.month)}</div>
            <div class="fc-sub num"><span class="bold priv">${subMoney(totals.year)}</span> al año${pct}</div>
            ${totals.n ? '' : '<div class="fc-note" style="margin-left:0">Confirma abajo las que sean tuyas para que cuenten aquí.</div>'}
        </div>`;
        if (totals.n) {
            h += `<div class="group">
                <div class="row"><span class="row-main row-title">Suscripciones <span class="muted">· ${totals.subN}</span></span><span class="row-value num priv">${subMoney(totals.subMonth)}/mes</span></div>
                <div class="row"><span class="row-main row-title">Recibos y cuotas <span class="muted">· ${totals.recN}</span></span><span class="row-value num priv">${subMoney(totals.recMonth)}/mes</span></div>
            </div>`;
        }
    }

    // Subidas de precio
    if (rises.length) {
        h += grp('Subidas de precio', rises.map(it => `<div class="row with-icon">
            <span class="icon-tile" style="background:var(--orange)"><i class="ic ic-arrow-up-right"></i></span>
            <span class="row-main"><span class="row-title" style="display:block">${esc(it.name)}</span>
            <span class="row-sub num priv" style="display:block;white-space:normal">de ${subMoney(it.rise.from)} a ${subMoney(it.rise.to)} · ${shortDate(it.rise.date)} · ${subEur0((it.rise.to - it.rise.from) * subStep(it.cad).py)} más al año</span></span>
            <span class="row-value bold" style="color:var(--orange)">+${Math.round(it.rise.pct)} %</span>
        </div>`).join(''));
    }

    // Por confirmar
    if (pending.length) {
        h += grp(`Por confirmar · ${pending.length}`, rowsOf(pending, { always: true }),
            'Cargos que se repiten. Confirma los que son suscripciones o recibos fijos; ignora los que no (por ejemplo, un bar al que vas cada semana).');
    }

    // Próximos cobros
    if (m.upcoming.length) {
        const tot = m.upcoming.reduce((a, u) => a + u.it.amount, 0);
        h += grp(`Próximos 30 días · <span class="num priv">${subEur0(tot)}</span>`, m.upcoming.map(u => `<div class="row with-icon">
            ${catIcon(u.it.cat)}
            <span class="row-main"><span class="row-title" style="display:block">${esc(u.it.name)}</span>
            <span class="row-sub" style="display:block">${shortDate(u.d)}${u.d === m.today ? ' · hoy' : ''}</span></span>
            <span class="row-value num priv">${subMoney(u.it.amount)}</span></div>`).join(''));
    }

    // Filtro
    if (items.some(it => it.st === 'ok' || it.st === 'end')) {
        const sg = (f, t) => `<button type="button" class="${SubUI.f === f ? 'on' : ''}" onclick="subSetFilter('${f}')">${t}</button>`;
        h += `<div class="seg" role="tablist" aria-label="Tipo">${sg('all', 'Todo')}${sg('sub', 'Suscripciones')}${sg('rec', 'Recibos')}</div>`;
    }

    h += grp(`Activas · ${active.length}`, rowsOf(active), active.length ? 'Toca una para ver el detalle o cancelarla.' : '');
    if (!active.length && !pending.length && m.hasRows) {
        h += `<div class="card"><div class="muted small">${items.length ? 'No hay suscripciones confirmadas con este filtro.' : 'No se ha detectado ningún cargo recurrente todavía. Hacen falta al menos 3 cobros parecidos (2 en los anuales).'}</div></div>`;
    }
    h += grp(`Sin cobros recientes · ${stale.length}`, rowsOf(stale), 'Confirmadas, pero llevan más tiempo del normal sin cobrarse y no cuentan en el total. Si ya no la tienes, márcala como cancelada.');
    if (ended.length) {
        const save = ended.reduce((a, it) => a + subPerYear(it), 0);
        h += grp(`Canceladas · ${ended.length}`, rowsOf(ended), `Con las que has cancelado ahorras unos <span class="num priv">${subEur0(save)}</span> al año.`);
    }
    if (ignored.length) {
        h += `<div><button type="button" class="btn sm gray" onclick="subToggleNo()">${SubUI.showNo ? 'Ocultar' : 'Ver'} ignoradas (${ignored.length})</button></div>`;
        if (SubUI.showNo) h += grp('Ignoradas', rowsOf(ignored));
    }

    // Añadir a mano
    h += `<div>
        <h3 class="group-header">Añadir a mano</h3>
        <div class="group">
            <div class="row"><input type="text" id="sub-name" class="field grow" placeholder="Nombre (ej. Gimnasio)" maxlength="40"></div>
            <div class="row"><span class="row-main row-title">Importe</span><input type="text" inputmode="decimal" id="sub-amount" class="field sm" placeholder="9,99" style="max-width:110px;text-align:right"></div>
            <div class="row"><span class="row-main row-title">Se cobra</span>
                <select id="sub-cad" class="field sm">${Object.entries(SUB_CADS).map(([k, c]) => `<option value="${k}"${k === 'm' ? ' selected' : ''}>${c.name}</option>`).join('')}</select></div>
            <div class="row"><span class="row-main row-title">Próximo cobro</span><input type="date" id="sub-next" class="field sm"></div>
            <div class="row"><span class="row-main row-title">Tipo</span>
                <select id="sub-type" class="field sm"><option value="sub">Suscripción</option><option value="rec">Recibo o cuota</option></select></div>
            <button type="button" class="row action" onclick="subAddManual()"><i class="ic ic-plus"></i>Añadir</button>
        </div>
        <p class="group-footer">Para lo que no sale en tu cuenta (por ejemplo, algo que pagas con otra tarjeta). Cuenta en los totales y en la proyección.</p>
    </div>`;

    // Conservar lo escrito en el formulario al volver a pintar
    const keep = ['sub-name', 'sub-amount', 'sub-cad', 'sub-next', 'sub-type'].map(id => { const el = document.getElementById(id); return el ? [id, el.value] : null; }).filter(Boolean);
    root.innerHTML = h;
    keep.forEach(([id, v]) => { const el = document.getElementById(id); if (el && v !== '') el.value = v; });
}

/* --------------------------------------------------------------------------
   PROYECCIÓN: las confirmadas que la detección de la proyección no ve
   (anuales, semestrales, manuales) se añaden como pagos con fecha
   -------------------------------------------------------------------------- */
function subsForecastExtras(rows, ref, det) {
    const out = { series: [], used: new Set() };
    try {
        const have = new Set(det.series.map(s => s.key));
        subsBuild().items.forEach(it => {
            if (it.st !== 'ok' || !it.active || it.cad === 'w' || (it.key && have.has(it.key))) return;
            const step = subStep(it.cad).step;
            out.series.push({
                key: it.key || it.id, sign: -1, step, cat: it.cat, last: it.last, n: it.n || 1, name: it.name,
                amount: -it.amount, dom: Number(it.last.slice(8, 10)), variable: it.variable, active: true, inv: false
            });
            it.rowKeys.forEach(k => out.used.add(k));
        });
    } catch (e) { console.error('Suscripciones en la proyección:', e); }
    return out;
}
