/* ==========================================================================
   TARJETA DE CRÉDITO
   Las compras de la tarjeta llegan en su PDF (perfil propio, sin saldo). En la cuenta
   aparece cada mes un «RECIBO VISA» con la suma de esas compras. Para no contar el gasto
   dos veces, el recibo se cuadra con sus compras, se marca como «Traspaso entre cuentas»
   y se oculta de Movimientos. Se conserva (no se borra) para que el saldo, los avisos de
   huecos y las importaciones sigan cuadrando.
   ========================================================================== */

const isCardRow = r => String((r && r.k) || '').startsWith('tj|');
const isVisaReceipt = r => !!r && r.i < 0 && !isManualRow(r) && !isCardRow(r) && /^RECIBO (VISA|MASTERCARD|TARJETA)/.test(norm(r.c));
const cents = n => Math.round(n * 100);
const VISA_MAX_GAP_DAYS = 62;

// Busca el perfil de la tarjeta (el que ya tiene compras o se llama «tarjeta/crédito/visa»); si no hay, lo crea
async function ensureCardProfile() {
    let p = ProfileList.find(x => allRows().some(r => r.a === x.id && isCardRow(r)))
        || ProfileList.find(x => /tarjeta|cr[eé]dito|visa/i.test(x.name));
    if (p) return p;
    const acc = await createMyAccount('Tarjeta de crédito', 'Laboral Kutxa');
    ProfileList.push({ id: acc.id, name: acc.name, bank_name: acc.bank_name });
    return acc;
}

// Compras sueltas = de la tarjeta y sin recibo asignado
function unlinkedCardRows() {
    const used = new Set();
    Object.values(AppState.visa || {}).forEach(v => (v.cards || []).forEach(k => used.add(k)));
    return allRows().filter(r => isCardRow(r) && !used.has(r.k)).sort((a, b) => a.d.localeCompare(b.d) || a.k.localeCompare(b.k));
}
const pendingReceipts = () => allRows().filter(r => isVisaReceipt(r) && !(AppState.visa || {})[r.k]);

// Para un recibo, el tramo más largo de compras (de las más antiguas) cuya suma es exactamente el recibo
function matchReceipt(receipt, pool) {
    const cand = pool.filter(r => r.d <= receipt.d);
    let best = null, sum = 0;
    for (let n = 0; n < cand.length; n++) {
        sum += cents(cand[n].i);
        const last = n === cand.length - 1 || cand[n + 1].d !== cand[n].d;   // solo se corta entre días distintos
        if (last && sum === cents(receipt.i) && daysBetween(cand[n].d, receipt.d) <= VISA_MAX_GAP_DAYS) best = cand.slice(0, n + 1);
    }
    return best;
}

async function markReceipt(receipt, cardKeys) {
    AppState.visa = AppState.visa || {};
    AppState.visa[receipt.k] = { cards: cardKeys };
    receipt.cat = TRANSFER_CAT; receipt.man = true;
    try { await updateTransactionCategory(receipt.a, receipt.k, TRANSFER_CAT); } catch (e) { console.error(e); }
}

// Cuadra todos los recibos pendientes. Devuelve cuántos ha cuadrado.
async function reconcileVisa({ silent = false } = {}) {
    let done = 0;
    const receipts = pendingReceipts().sort((a, b) => a.d.localeCompare(b.d));
    let pool = unlinkedCardRows();
    for (const rc of receipts) {
        const m = matchReceipt(rc, pool);
        if (!m) continue;
        await markReceipt(rc, m.map(r => r.k));
        const used = new Set(m.map(r => r.k));
        pool = pool.filter(r => !used.has(r.k));
        done++;
    }
    if (done) { saveState(); applyView(); renderAllViews(); }
    if (!silent) showToast(done ? `${done} ${done === 1 ? 'recibo cuadrado' : 'recibos cuadrados'}` : 'No hay recibos que cuadren con compras de la tarjeta');
    return done;
}

async function unlinkVisa(encKey) {
    const key = decodeURIComponent(encKey);
    const rc = allRows().find(r => r.k === key);
    delete AppState.visa[key];
    if (rc) {
        rc.cat = classifyConcept(rc.c, AppState.rules); rc.man = false;
        try {
            const { error } = await supabaseClient.from('transactions').update({ category: rc.cat, manual_category: false })
                .eq('account_id', rc.a).eq('source_key', key);
            if (error) throw error;
        } catch (e) { console.error(e); showToast('No se pudo restaurar la categoría', 'error'); }
    }
    saveState(); applyView(); renderAllViews();
}

// Si se borra un recibo o compras, el vínculo se limpia (y el recibo vuelve a quedar pendiente si sobrevive)
function cleanVisaLinks(gone) {
    const v = AppState.visa || {};
    Object.keys(v).forEach(k => {
        if (gone.has(k)) { delete v[k]; return; }
        if ((v[k].cards || []).some(c => gone.has(c))) {
            delete v[k];
            const rc = allRows().find(r => r.k === k);
            if (rc) { rc.cat = classifyConcept(rc.c, AppState.rules); rc.man = false; }
        }
    });
}

/* ---------- Sección en Datos ---------- */

function renderVisaSection() {
    const el = document.getElementById('visa-list');
    if (!el) return;
    const v = AppState.visa || {};
    const all = allRows();
    const linked = Object.keys(v).map(k => all.find(r => r.k === k)).filter(Boolean).sort((a, b) => b.d.localeCompare(a.d));
    const pend = pendingReceipts().sort((a, b) => b.d.localeCompare(a.d));
    const hasCard = all.some(isCardRow);
    const sec = document.getElementById('visa-section');
    if (sec) sec.classList.toggle('hidden', !hasCard && !linked.length && !pend.length);
    el.innerHTML = linked.map(r => `
        <div class="row">
            <div class="row-main"><div class="row-title" style="font-size:15px">${esc(formatDateEs(r.d))} · ${esc(formatEur(Math.abs(r.i)))}</div><div class="row-sub">${(v[r.k].cards || []).length} compras de la tarjeta</div></div>
            <button type="button" class="link small" onclick="openVisaPicker('${encodeURIComponent(r.k)}')">Editar</button>
            <button type="button" class="link small" style="margin-left:10px" onclick="unlinkVisa('${encodeURIComponent(r.k)}')">Deshacer</button>
        </div>`).join('')
        + pend.map(r => `
        <div class="row">
            <div class="row-main"><div class="row-title" style="font-size:15px;color:var(--orange)">${esc(formatDateEs(r.d))} · ${esc(formatEur(Math.abs(r.i)))}</div><div class="row-sub">Sin cuadrar: faltan compras de la tarjeta</div></div>
            <button type="button" class="link small" onclick="openVisaPicker('${encodeURIComponent(r.k)}')">Vincular</button>
        </div>`).join('')
        || '<div class="row"><span class="muted small">Sin recibos de tarjeta todavía.</span></div>';
}

/* ---------- Vincular a mano ---------- */

let visaPick = null;   // { key, sel:Set }

function openVisaPicker(encKey) {
    const key = decodeURIComponent(encKey);
    const rc = allRows().find(r => r.k === key);
    if (!rc) return;
    visaPick = { key, sel: new Set((AppState.visa[key] || {}).cards || []) };   // si ya estaba cuadrado, parte de su selección
    document.getElementById('visa-pick-sub').textContent = `Recibo del ${formatDateEs(rc.d)}: ${formatEur(Math.abs(rc.i))}. Marca las compras que lo componen (cualquier fecha).`;
    paintVisaPick();
    document.getElementById('visa-modal').classList.remove('hidden');
}
function closeVisaPicker() { visaPick = null; document.getElementById('visa-modal').classList.add('hidden'); }

function paintVisaPick() {
    if (!visaPick) return;
    const rc = allRows().find(r => r.k === visaPick.key);
    const mine = new Set((AppState.visa[visaPick.key] || {}).cards || []);
    const pool = unlinkedCardRows().concat(allRows().filter(r => mine.has(r.k))).sort((a, b) => b.d.localeCompare(a.d) || a.k.localeCompare(b.k));
    document.getElementById('visa-pick-list').innerHTML = pool.map(r => `
        <label class="pick-row"><input type="checkbox" data-k="${esc(encodeURIComponent(r.k))}" ${visaPick.sel.has(r.k) ? 'checked' : ''}>
        <span>${esc(formatDateEs(r.d))} · ${esc(r.c)}</span><b>${esc(formatEur(r.i))}</b></label>`).join('') || '<p class="muted small" style="padding:8px 0">No hay compras sueltas de la tarjeta.</p>';
    const sum = [...visaPick.sel].reduce((a, k) => a + cents((pool.find(r => r.k === k) || { i: 0 }).i), 0);
    const ok = sum === cents(rc.i);
    document.getElementById('visa-pick-sum').innerHTML = `Seleccionado: <b>${esc(formatEur(sum / 100))}</b> de ${esc(formatEur(rc.i))} ${ok ? '✓' : (visaPick.sel.size ? `· diferencia ${esc(formatEur((sum - cents(rc.i)) / 100))}` : '')}`;
    const okBtn = document.getElementById('visa-pick-ok');
    okBtn.disabled = !visaPick.sel.size;
    okBtn.textContent = ok ? 'Guardar' : 'Guardar igualmente';
}
function onVisaPickToggle(e) {
    const cb = e.target.closest('input[type=checkbox]');
    if (!cb || !visaPick) return;
    const k = decodeURIComponent(cb.dataset.k);
    cb.checked ? visaPick.sel.add(k) : visaPick.sel.delete(k);
    paintVisaPick();
}
async function applyVisaPick() {
    if (!visaPick) return;
    const rc = allRows().find(r => r.k === visaPick.key);
    await markReceipt(rc, [...visaPick.sel]);
    closeVisaPicker();
    saveState(); applyView(); renderAllViews();
    showToast('Recibo vinculado');
}
