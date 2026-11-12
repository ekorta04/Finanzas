/* ==========================================================================
    15. MOVIMIENTOS REPETIDOS
    · Al importar: se compara cada fila con lo que ya hay por fecha + importe + concepto
      (no solo por la clave, que incluye el saldo y el texto exacto).
    · Revisión: busca en la cuenta los que ya se colaron y permite quitarlos.
    ========================================================================== */

// Concepto "limpio": solo letras y números, sin acentos. Así no importan comillas, espacios ni signos.
const fpConcept = c => norm(c).replace(/[^A-Z0-9]/g, '');
// Huella de un movimiento: misma fecha, mismo importe, mismo concepto
const rowFp = r => [r.d, Number(r.i).toFixed(2), fpConcept(r.c)].join('|');
const txFp = t => [t.operation_date, Number(t.amount).toFixed(2), fpConcept(t.description)].join('|');

/* ---------- Al importar ---------- */

// Reparte las filas del archivo en: exactas (misma clave que una guardada), parecidas (misma huella
// pero otra clave: el mismo movimiento con otro saldo o texto) y nuevas.
// Cuenta ocurrencias: si hay 2 cafés iguales el mismo día y en la base solo 1, entra 1; no se pierde ninguno.
function splitRepeatedRows(existing, incoming) {
    const keys = new Set(existing.map(t => t.source_key));
    const free = new Map();   // huella → guardados que aún no se han emparejado
    existing.forEach(t => { const f = txFp(t); free.set(f, (free.get(f) || 0) + 1); });

    const exact = [], rest = [];
    incoming.forEach(r => {
        if (keys.has(r.k)) {
            exact.push(r);
            const f = rowFp(r);
            free.set(f, Math.max(0, (free.get(f) || 0) - 1));
        } else rest.push(r);
    });

    const similar = [], fresh = [];
    rest.forEach(r => {
        const f = rowFp(r), n = free.get(f) || 0;
        if (n > 0) { free.set(f, n - 1); similar.push(r); } else fresh.push(r);
    });
    return { exact, similar, fresh };
}

/* ---------- Revisión de lo ya guardado ---------- */

// Grupos de movimientos con la misma huella que vienen de importaciones distintas.
// Se conserva siempre el de la importación más antigua (o el que tenga etiquetas, Bizums o categoría manual)
// y se propone quitar los demás si no encajan en la cadena de saldos: dos compras iguales consecutivas
// cumplen saldo = saldo anterior + importe y se consideran reales.
function findDuplicateGroups(txs, isProtected = () => false) {
    const near = (a, b) => Math.abs(a - b) < 0.005;
    const by = new Map();
    txs.forEach(t => { const f = txFp(t); if (!by.has(f)) by.set(f, []); by.get(f).push(t); });

    const groups = [];
    by.forEach(list => {
        if (list.length < 2 || new Set(list.map(t => t.import_id || '·')).size < 2) return;   // un solo archivo: compras repetidas reales
        const order = [...list].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id);
        const firstImp = order[0].import_id;
        const keep = order.filter(t => t.import_id === firstImp || isProtected(t));
        const cand = order.filter(t => !keep.includes(t));
        const drop = [];

        // Sin saldo (importaciones antiguas): sobran tantos como filas con saldo haya
        const withBal = list.filter(t => t.balance != null).length;
        let nullAllowance = withBal;
        cand.filter(t => t.balance == null).forEach(t => { if (nullAllowance-- > 0) drop.push(t); });

        cand.filter(t => t.balance != null).forEach(t => {
            const chained = [...keep, ...cand.filter(c => c.balance != null && !drop.includes(c) && c !== t)].some(r =>
                r.balance != null && (near(Number(r.balance) + Number(t.amount), Number(t.balance)) || near(Number(t.balance) + Number(r.amount), Number(r.balance))));
            if (!chained) drop.push(t);
        });

        if (drop.length) groups.push({ d: order[0].operation_date, i: Number(order[0].amount), c: order[0].description, keep: order.filter(t => !drop.includes(t)), drop });
    });
    groups.sort((a, b) => b.d.localeCompare(a.d));
    return groups;
}

/* ---------- Pantalla ---------- */

let dupGroups = [];

function dupAccountId() {
    const sel = document.getElementById('import-account');
    return (sel && sel.value) || window.activeSupabaseAccountId || null;
}

async function scanDuplicates() {
    const out = document.getElementById('dup-result');
    const btn = document.getElementById('dup-scan-btn');
    out.classList.remove('hidden');
    out.innerHTML = '<div class="muted small center" style="padding:14px">Buscando…</div>';
    btn.disabled = true;
    try {
        const accountId = dupAccountId();
        if (!accountId) throw new Error('Selecciona una cuenta.');
        const txs = await getAllAccountTransactions(accountId);
        const byK = new Map(AppState.rows.map(r => [r.k, r]));
        const isProtected = t => {
            const r = byK.get(t.source_key);
            return !!(t.manual_category || (r && ((r.t && r.t.length) || r.lk || (r.bz && r.bz.length))));
        };
        dupGroups = findDuplicateGroups(txs, isProtected);
        renderDuplicates(txs.length);
    } catch (err) {
        console.error(err);
        out.innerHTML = `<div class="result err" style="margin:0">No se pudo revisar: ${esc(describeSupabaseError(err))}</div>`;
    } finally {
        btn.disabled = false;
    }
}

function renderDuplicates(total) {
    const out = document.getElementById('dup-result');
    if (!dupGroups.length) {
        out.innerHTML = `<div class="result ok" style="margin:0">No hay movimientos repetidos entre los ${total} de esta cuenta.</div>`;
        return;
    }
    const n = dupGroups.reduce((a, g) => a + g.drop.length, 0);
    const row = (t, drop) => `
        <label class="row" style="min-height:0;padding:8px 14px;${drop ? 'cursor:pointer' : ''}">
            ${drop ? `<input type="checkbox" class="dup-check" data-id="${t.id}" checked onchange="updateDupCount()">` : '<span style="width:18px;text-align:center;color:var(--green)">✓</span>'}
            <span class="row-main" style="font-size:14px">${drop ? 'Sobra' : 'Se conserva'}
                <span class="row-sub" style="display:block">${t.balance == null ? 'Sin saldo' : 'Saldo <span class="priv">' + formatEur(Number(t.balance)) + '</span>'} · importado el ${esc(String(t.created_at || '').slice(0, 10).split('-').reverse().join('/'))}</span></span>
        </label>`;
    out.innerHTML = `
        <p class="small" style="margin:0 4px 10px"><b>${n}</b> ${n === 1 ? 'movimiento sobra' : 'movimientos sobran'} en ${dupGroups.length} ${dupGroups.length === 1 ? 'grupo' : 'grupos'}. Revisa y desmarca los que sean compras repetidas de verdad.</p>
        <div class="stack-sm">${dupGroups.map(g => `
            <div class="group">
                <div class="row" style="min-height:0;padding:10px 14px"><span class="row-main"><span class="row-title" style="display:block;font-size:15px">${esc(g.c)}</span>
                    <span class="row-sub" style="display:block">${formatDateEs(g.d)}</span></span>
                    <span class="row-value num ${g.i > 0 ? 'pos' : ''}">${formatEur(g.i)}</span></div>
                ${g.keep.map(t => row(t, false)).join('')}${g.drop.map(t => row(t, true)).join('')}
            </div>`).join('')}</div>
        <button id="dup-delete-btn" class="btn mt-2" style="width:100%" onclick="deleteMarkedDuplicates()">Quitar <span id="dup-count">${n}</span> marcados</button>
        <p class="small muted" style="margin:8px 4px 0">Antes de quitar, puedes descargar una copia en «Copia de seguridad».</p>`;
}

function updateDupCount() {
    const k = document.querySelectorAll('.dup-check:checked').length;
    const el = document.getElementById('dup-count'), btn = document.getElementById('dup-delete-btn');
    if (el) el.textContent = k;
    if (btn) btn.disabled = k === 0;
}

async function deleteMarkedDuplicates() {
    const ids = [...document.querySelectorAll('.dup-check:checked')].map(c => Number(c.dataset.id));
    if (!ids.length) return;
    if (!(await askConfirm(`¿Quitar ${ids.length} ${ids.length === 1 ? 'movimiento repetido' : 'movimientos repetidos'} de la base de datos? No se puede deshacer.`))) return;
    const btn = document.getElementById('dup-delete-btn');
    btn.disabled = true;
    try {
        await deleteTransactionsByIds(dupAccountId(), ids);
        await loadUserDashboard({ keepTab: true });
        showToast(`${ids.length} repetidos quitados`);
        await scanDuplicates();
    } catch (err) {
        console.error(err);
        showToast('No se pudieron quitar: ' + describeSupabaseError(err), 'error');
        btn.disabled = false;
    }
}
