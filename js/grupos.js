/* ==========================================================================
   GASTOS EN GRUPO CON TICKET
   Subes la foto del ticket → la app lee comercio, fecha, total y líneas →
   eliges tu parte → busca el cargo del banco con ese total y te propone los
   Bizums que encajan con lo que te deben (líneas de otros, partes iguales…).
   Los grupos se sincronizan (AppState.groups); la foto se queda en el
   dispositivo (IndexedDB).
   ========================================================================== */

const GROUP_BZ_DAYS = 3;   // Bizums del mismo día y hasta 3 días después (y 1 antes)

/* ---------- Cálculos ---------- */

const r2 = n => Math.round(n * 100) / 100;
const eurIn = n => (+n || 0).toFixed(2).replace('.', ',');

function groupMine(g) {
    if (g.mode === 'equal') return r2(g.total / Math.max(1, g.n || 1));
    if (g.mode === 'items') return r2((g.items || []).filter(it => it.me).reduce((a, it) => a + (+it.v || 0), 0));
    return r2(Math.min(g.total, Math.max(0, +g.mine || 0)));
}
const groupOwed = g => r2(Math.max(0, g.total - groupMine(g)));

function groupExpenseCandidates(g, rows = AppState.rows) {
    const taken = new Set((AppState.groups || []).filter(o => o.id !== g.id && o.exp).map(o => o.exp));
    const from = addDays(g.d, -1), to = addDays(g.d, 4);
    return rows
        .filter(r => r.i < 0 && !isBizum(r) && !taken.has(r.k) && r.d >= from && r.d <= to && Math.abs(-r.i - g.total) <= 0.02)
        .sort((a, b) => Math.abs(daysBetween(g.d, a.d)) - Math.abs(daysBetween(g.d, b.d)));
}

// Enlaza con su cargo los grupos que aún no lo tienen (p. ej. tras importar el CSV)
function linkPendingGroups() {
    const map = byKeyMap();
    let changed = false;
    (AppState.groups || []).forEach(g => {
        if (g.exp && map.has(g.exp)) return;
        const c = groupExpenseCandidates(g)[0];
        const next = c ? c.k : null;
        if (next !== (g.exp || null)) { g.exp = next; changed = true; }
    });
    return changed;
}

// Importes que podría mandarte cada persona, con su explicación
function groupTargets(g) {
    const out = [], owed = groupOwed(g);
    const add = (v, why) => { v = r2(v); if (v >= 0.5 && !out.some(t => Math.abs(t.v - v) < 0.01)) out.push({ v, why }); };
    if (g.mode === 'items') (g.items || []).filter(it => !it.me && +it.v > 0).forEach(it => add(+it.v, it.t || 'una línea'));
    if (g.mode === 'equal') add(g.total / g.n, `su parte (1/${g.n})`);
    if (g.mode === 'amount') add(groupMine(g), 'lo mismo que tú');
    add(owed, 'todo lo que te deben');
    for (let k = 2; k <= 6; k++) add(owed / k, `lo que te deben entre ${k}`);
    for (let n = 2; n <= 6; n++) add(g.total / n, `1/${n} del total`);
    return out;
}

// ¿Encaja un Bizum con alguno de esos importes? (admite redondeos: 12,40 → 12 o 13)
function groupMatch(amount, targets) {
    for (const t of targets) {
        const tol = Math.max(0.02, t.v * 0.03);
        if (Math.abs(amount - t.v) <= tol) return t;
        if (Number.isInteger(amount) && t.v >= 3 && Math.abs(amount - t.v) < 1) return t;
    }
    return null;
}

function groupProposal(g, map) {
    const exp = g.exp && map.get(g.exp);
    if (!exp) return null;
    const received = (exp.bz || []).reduce((a, k) => a + ((map.get(k) || {}).i || 0), 0);
    const remaining = r2(groupOwed(g) - received);
    if (remaining < 0.5) return null;
    const no = new Set(g.no || []);
    const targets = groupTargets(g);
    const from = addDays(g.d, -1), to = addDays(g.d, GROUP_BZ_DAYS);
    const cands = AppState.rows
        .filter(b => b.i > 0 && isBizum(b) && !b.lk && !no.has(b.k) && b.d >= from && b.d <= to)
        .map(b => ({ b, t: groupMatch(b.i, targets) }))
        .filter(c => c.t)
        .sort((a, b) => a.b.d.localeCompare(b.b.d));
    if (!cands.length) return null;
    // Premarcar la combinación que más se acerca a lo que te deben (sin pasarse de 1 €)
    const pool = cands.slice(0, 12);
    let best = 0, bestGap = Infinity;
    for (let mask = 1; mask < (1 << pool.length); mask++) {
        let s = 0;
        pool.forEach((c, i) => { if (mask & (1 << i)) s += c.b.i; });
        const gap = Math.abs(remaining - s);
        if (s <= remaining + 1 && gap < bestGap - 0.001) { best = mask; bestGap = gap; }
    }
    cands.forEach((c, i) => { c.pre = i < 12 && !!(best & (1 << i)); });
    return { g, exp, cands, remaining };
}

// Para que la sugerencia automática de siempre no duplique estos gastos
function groupExpenseKeys() { return new Set((AppState.groups || []).map(g => g.exp).filter(Boolean)); }

/* ---------- Propuestas en el Resumen ---------- */

let GroupProps = [];

function renderGroupProposals() {
    if (linkPendingGroups()) saveState();
    const map = byKeyMap();
    GroupProps = (AppState.groups || []).map(g => groupProposal(g, map)).filter(Boolean);
    return GroupProps.map((p, idx) => `
        <div class="row with-icon" style="align-items:flex-start">
            <span class="icon-tile round" style="background:var(--teal)"><i class="ic ic-receipt"></i></span>
            <div class="row-main">
                <div class="row-title bold" style="font-size:15px">${esc(p.g.shop || p.exp.c)} · te deben <span class="priv">${formatEur(p.remaining)}</span></div>
                <div class="row-sub" style="white-space:normal">Estos Bizums encajan con el ticket del ${shortDate(p.g.d)}. Marca los que son de este gasto:</div>
                <div class="grp-cands" id="grp-cands-${idx}">
                    ${p.cands.map(c => `
                        <label class="pick-row">
                            <input type="checkbox" data-k="${enc(c.b.k)}" ${c.pre ? 'checked' : ''}>
                            <span class="grp-cand-txt"><span class="truncate">${shortDate(c.b.d)} · ${esc(c.b.c)}</span><span class="xsmall muted">≈ ${esc(c.t.why)}</span></span>
                            <span class="num pos priv">+${formatEur(c.b.i)}</span>
                        </label>`).join('')}
                </div>
                <div class="flex gap-2 mt-2">
                    <button onclick="applyGroupProposal(${idx})" class="btn xs">Agrupar</button>
                    <button onclick="dismissGroupProposal(${idx})" class="btn xs gray">No son de esto</button>
                </div>
            </div>
        </div>`).join('');
}

function applyGroupProposal(idx) {
    const p = GroupProps[idx]; if (!p) return;
    const box = document.getElementById('grp-cands-' + idx);
    const sel = [...box.querySelectorAll('input:checked')].map(i => decodeURIComponent(i.dataset.k));
    if (!sel.length) { showToast('Marca al menos un Bizum', 'error'); return; }
    const map = byKeyMap();
    const exp = map.get(p.g.exp); if (!exp) return;
    exp.bz = [...new Set([...(exp.bz || []), ...sel])];
    sel.forEach(k => { const b = map.get(k); if (b) b.lk = exp.k; });
    // Los no marcados no se vuelven a proponer para este ticket
    p.cands.forEach(c => { if (!sel.includes(c.b.k)) (p.g.no = p.g.no || []).push(c.b.k); });
    saveState(); renderAllViews();
    showToast('Bizums agrupados con el ticket');
}

function dismissGroupProposal(idx) {
    const p = GroupProps[idx]; if (!p) return;
    p.g.no = [...new Set([...(p.g.no || []), ...p.cands.map(c => c.b.k)])];
    saveState(); renderAllViews();
}

/* ---------- Foto del ticket (solo en este dispositivo) ---------- */

function tkDb() {
    return new Promise((res, rej) => {
        const rq = indexedDB.open('finanzas-tickets', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('fotos');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
    });
}
async function tkPhoto(op, id, blob) {
    try {
        const db = await tkDb();
        return await new Promise((res, rej) => {
            const tx = db.transaction('fotos', op === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore('fotos');
            const rq = op === 'get' ? st.get(id) : op === 'put' ? st.put(blob, id) : st.delete(id);
            rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
        });
    } catch (e) { return null; }
}

/* ---------- Lectura del ticket (Tesseract, dentro del dispositivo) ---------- */

let tkWorker = null;
let tkProgress = () => {};

function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'vendor/tesseract/tesseract.min.js';
        s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el lector de tickets'));
        document.head.appendChild(s);
    });
}

async function getTkWorker() {
    if (tkWorker) return tkWorker;
    await loadTesseract();
    const base = new URL('vendor/tesseract/', location.href).href;
    tkWorker = await Tesseract.createWorker('spa', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        langPath: base.replace(/\/$/, ''),
        logger: m => { if (m.status === 'recognizing text') tkProgress(m.progress); }
    });
    await tkWorker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1', user_defined_dpi: '300' });
    return tkWorker;
}

async function loadImageFile(file) {
    if (window.createImageBitmap) {
        try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* sigue abajo */ }
    }
    return new Promise((res, rej) => {
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); res(img); };
        img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo abrir la imagen')); };
        img.src = url;
    });
}

function drawScaled(img, maxSide) {
    const w = img.width, h = img.height, k = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
}

// Gris y más contraste: el papel térmico suele salir apagado
function ocrCanvas(img) {
    const c = drawScaled(img, 2000), ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
        let l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        l = Math.max(0, Math.min(255, (l - 128) * 1.5 + 140));
        p[i] = p[i + 1] = p[i + 2] = l;
    }
    ctx.putImageData(d, 0, 0);
    return c;
}

/* ---------- Editor ---------- */

let GroupEdit = null;   // copia del grupo que se está editando

function newGroup() {
    return { id: 'g' + Date.now().toString(36), d: todayIso(), shop: '', total: 0, mode: 'equal', n: 2, mine: 0, items: [], exp: null, no: [] };
}

function openGroups() {
    document.getElementById('group-modal').classList.remove('hidden');
    showGroupList();
}
function closeGroups() {
    document.getElementById('group-modal').classList.add('hidden');
    GroupEdit = null;
}

function showGroupList() {
    GroupEdit = null;
    linkPendingGroups();
    const map = byKeyMap();
    const gs = [...(AppState.groups || [])].sort((a, b) => b.d.localeCompare(a.d));
    document.getElementById('group-title').textContent = 'Gastos en grupo';
    document.getElementById('group-body').innerHTML = `
        <label class="btn block grp-upload"><i class="ic ic-camera"></i> Subir ticket
            <input type="file" accept="image/*" class="hidden" onchange="onTicketFile(this)">
        </label>
        <button type="button" class="btn plain small" onclick="editGroup()">o crear sin foto</button>
        ${gs.length ? `<div class="grp-list">${gs.map(g => {
            const exp = g.exp && map.get(g.exp);
            const rec = exp ? (exp.bz || []).reduce((a, k) => a + ((map.get(k) || {}).i || 0), 0) : 0;
            const left = r2(groupOwed(g) - rec);
            const st = !exp ? 'Esperando el cargo del banco' : left < 0.5 ? 'Completo' : `Faltan <span class="priv">${formatEur(left)}</span> por recibir`;
            return `<button type="button" class="grp-item" onclick="editGroup('${g.id}')">
                <span class="truncate"><b>${esc(g.shop || 'Ticket')}</b> · ${shortDate(g.d)}</span>
                <span class="num priv">${formatEur(g.total)}</span>
                <span class="xsmall muted" style="grid-column:1/-1">Tu parte <span class="priv">${formatEur(groupMine(g))}</span> · ${st}</span>
            </button>`;
        }).join('')}</div>` : '<p class="small muted center" style="padding:6px 0 0">Sube la foto de un ticket que hayas pagado tú por el grupo.</p>'}`;
    const act = document.getElementById('group-actions');
    act.style.gridTemplateColumns = '1fr';
    act.innerHTML = '<button type="button" onclick="closeGroups()">Cerrar</button>';
}

async function onTicketFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!GroupEdit) editGroup();
    const g = GroupEdit;
    const status = document.getElementById('grp-ocr');
    const say = t => { if (status) status.innerHTML = t; };
    say('<span class="spin"></span> Preparando la foto…');
    try {
        const img = await loadImageFile(file);
        const thumb = drawScaled(img, 1200);
        g._photo = await new Promise(r => thumb.toBlob(r, 'image/jpeg', 0.72));
        paintGroupPhoto(URL.createObjectURL(g._photo));
        say('<span class="spin"></span> Cargando el lector (solo la primera vez tarda un poco)…');
        tkProgress = p => say(`<span class="spin"></span> Leyendo el ticket… ${Math.round(p * 100)} %`);
        const w = await getTkWorker();
        const { data } = await w.recognize(ocrCanvas(img));
        if (GroupEdit !== g) return;   // se cerró mientras leía
        const t = parseTicketText(data.text);
        if (t.shop) g.shop = t.shop;
        if (t.date && Math.abs(daysBetween(t.date, todayIso())) < 400) g.d = t.date;
        if (t.total) g.total = t.total;
        g.items = t.items.map(it => ({ t: it.t, v: it.v, me: false }));
        if (g.items.length >= 2) g.mode = 'items';
        const sum = r2(g.items.reduce((a, it) => a + it.v, 0));
        say(t.total
            ? `Leído. Revisa los datos${g.items.length && Math.abs(sum - g.total) > 0.05 ? ` (las líneas suman ${formatEur(sum)}, el total es ${formatEur(g.total)})` : ''}.`
            : 'No he encontrado el total: escríbelo tú.');
        paintGroupForm();
    } catch (e) {
        console.error(e);
        say('No he podido leer el ticket. Puedes rellenarlo a mano.');
    }
}

function paintGroupPhoto(url) {
    const el = document.getElementById('grp-photo');
    if (!el) return;
    el.innerHTML = url ? `<img src="${url}" alt="Ticket">` : '';
    el.classList.toggle('hidden', !url);
}

function editGroup(id) {
    const src = id && (AppState.groups || []).find(g => g.id === id);
    GroupEdit = src ? JSON.parse(JSON.stringify(src)) : newGroup();
    GroupEdit._isNew = !src;
    document.getElementById('group-title').textContent = src ? (src.shop || 'Ticket') : 'Nuevo gasto en grupo';
    document.getElementById('group-body').innerHTML = `
        <div class="grp-top">
            <div id="grp-photo" class="grp-photo hidden"></div>
            <label class="btn sm gray grp-upload"><i class="ic ic-camera"></i> ${src ? 'Cambiar foto' : 'Foto del ticket'}
                <input type="file" accept="image/*" class="hidden" onchange="onTicketFile(this)">
            </label>
        </div>
        <div id="grp-ocr" class="xsmall muted"></div>
        <div id="grp-form"></div>`;
    document.getElementById('group-actions').style.gridTemplateColumns = '';
    document.getElementById('group-actions').innerHTML =
        `<button type="button" onclick="showGroupList()">${src ? 'Atrás' : 'Cancelar'}</button><button type="button" onclick="saveGroup()">Guardar</button>`;
    paintGroupForm();
    if (src) tkPhoto('get', src.id).then(b => { if (b && GroupEdit && GroupEdit.id === src.id) paintGroupPhoto(URL.createObjectURL(b)); });
}

function paintGroupForm() {
    const g = GroupEdit; if (!g) return;
    document.getElementById('grp-form').innerHTML = `
        <div class="grp-fields">
            <label>Comercio<input class="field sm" value="${esc(g.shop)}" oninput="GroupEdit.shop=this.value" maxlength="40" placeholder="Bar, restaurante…"></label>
            <label>Fecha<input class="field sm" type="date" value="${g.d}" onchange="GroupEdit.d=this.value||todayIso();paintGroupSummary()"></label>
            <label>Total (€)<input class="field sm num" inputmode="decimal" value="${g.total ? eurIn(g.total) : ''}" oninput="GroupEdit.total=r2(parseFlexNum(this.value)||0);paintGroupSummary()" placeholder="0,00"></label>
        </div>
        <div class="small bold" style="margin:12px 0 6px">¿Cuál es tu parte?</div>
        <div class="seg grp-seg">
            <button type="button" class="${g.mode === 'items' ? 'on' : ''}" onclick="setGroupMode('items')">Mis líneas</button>
            <button type="button" class="${g.mode === 'equal' ? 'on' : ''}" onclick="setGroupMode('equal')">A partes iguales</button>
            <button type="button" class="${g.mode === 'amount' ? 'on' : ''}" onclick="setGroupMode('amount')">Importe</button>
        </div>
        <div id="grp-mode">${groupModeHtml(g)}</div>
        <div id="grp-sum" class="grp-sum"></div>
        ${!g._isNew ? `<button type="button" class="btn danger sm block" style="margin-top:10px" onclick="deleteGroup()">Eliminar este gasto en grupo</button>` : ''}`;
    paintGroupSummary();
}

function groupModeHtml(g) {
    if (g.mode === 'equal') return `
        <div class="grp-stepper">Entre
            <button type="button" class="btn xs gray" onclick="GroupEdit.n=Math.max(2,GroupEdit.n-1);paintGroupMode()">−</button>
            <b>${g.n}</b>
            <button type="button" class="btn xs gray" onclick="GroupEdit.n=Math.min(20,GroupEdit.n+1);paintGroupMode()">+</button>
            personas (contándote)</div>`;
    if (g.mode === 'amount') return `
        <label class="grp-fields one">Lo que me toca a mí (€)<input class="field sm num" inputmode="decimal" value="${g.mine ? eurIn(g.mine) : ''}" oninput="GroupEdit.mine=r2(parseFlexNum(this.value)||0);paintGroupSummary()" placeholder="0,00"></label>`;
    return `
        <div class="xsmall muted" style="margin-bottom:4px">Marca lo que has tomado tú. Las demás líneas son de los demás.</div>
        <div class="grp-items">${(g.items || []).map((it, i) => `
            <div class="grp-line">
                <input type="checkbox" ${it.me ? 'checked' : ''} onchange="GroupEdit.items[${i}].me=this.checked;paintGroupSummary()" aria-label="Es mío">
                <input class="field sm" value="${esc(it.t)}" oninput="GroupEdit.items[${i}].t=this.value" placeholder="Concepto">
                <input class="field sm num" inputmode="decimal" value="${it.v ? eurIn(it.v) : ''}" oninput="GroupEdit.items[${i}].v=r2(parseFlexNum(this.value)||0);paintGroupSummary()">
                <button type="button" class="btn plain" onclick="GroupEdit.items.splice(${i},1);paintGroupMode()" aria-label="Quitar línea"><i class="ic ic-x"></i></button>
            </div>`).join('')}</div>
        <button type="button" class="btn plain small" onclick="GroupEdit.items.push({t:'',v:0,me:true});paintGroupMode()"><i class="ic ic-plus"></i> Añadir línea</button>`;
}

function setGroupMode(m) {
    const g = GroupEdit;
    g.mode = m;
    document.querySelectorAll('.grp-seg button').forEach((b, i) => b.classList.toggle('on', ['items', 'equal', 'amount'][i] === m));
    paintGroupMode();
}
function paintGroupMode() {
    document.getElementById('grp-mode').innerHTML = groupModeHtml(GroupEdit);
    paintGroupSummary();
}

function paintGroupSummary() {
    const g = GroupEdit, el = document.getElementById('grp-sum');
    if (!g || !el) return;
    const mine = groupMine(g), owed = groupOwed(g);
    const cands = g.total > 0 ? groupExpenseCandidates(g) : [];
    const cur = g.exp && cands.find(c => c.k === g.exp);
    const exp = cur || cands[0];
    let warn = '';
    if (g.mode === 'items' && g.items.length) {
        const sum = r2(g.items.reduce((a, it) => a + (+it.v || 0), 0));
        if (g.total && Math.abs(sum - g.total) > 0.05) warn = `<div class="xsmall" style="color:var(--orange)">Las líneas suman ${formatEur(sum)} y el total es ${formatEur(g.total)}.</div>`;
    }
    el.innerHTML = `
        ${warn}
        <div>Tu parte <b class="priv">${formatEur(mine)}</b> · Te deben <b class="priv">${formatEur(owed)}</b></div>
        <div class="xsmall muted">${!g.total ? 'Escribe el total del ticket.'
            : exp ? `Cargo encontrado: ${shortDate(exp.d)} · ${esc(exp.c)}`
            : 'Aún no está el cargo en tus movimientos: se enlazará solo al importar el extracto.'}</div>`;
}

async function saveGroup() {
    const g = GroupEdit; if (!g) return;
    if (!(g.total > 0)) { showToast('Falta el total del ticket', 'error'); return; }
    if (g.mode === 'items') g.items = g.items.filter(it => it.t.trim() || it.v);
    if (groupMine(g) > g.total + 0.01) { showToast('Tu parte es mayor que el total', 'error'); return; }
    const photo = g._photo;
    const clean = Object.assign({}, g);
    delete clean._photo; delete clean._isNew;
    clean.exp = (g.exp && groupExpenseCandidates(g).some(c => c.k === g.exp)) ? g.exp : null;
    AppState.groups = (AppState.groups || []).filter(o => o.id !== g.id).concat(clean);
    linkPendingGroups();
    if (photo) await tkPhoto('put', g.id, photo);
    saveState(); renderAllViews();
    showGroupList();
    const p = groupProposal(clean, byKeyMap());
    showToast(p ? 'Guardado. Hay Bizums que encajan: revísalos en el Resumen' : clean.exp ? 'Guardado y enlazado con el cargo' : 'Guardado. Se enlazará al importar el extracto');
}

async function deleteGroup() {
    const g = GroupEdit; if (!g) return;
    if (!await askConfirm('¿Eliminar este gasto en grupo? Los Bizums que ya agrupaste siguen agrupados con el cargo.')) return;
    AppState.groups = (AppState.groups || []).filter(o => o.id !== g.id);
    tkPhoto('del', g.id);
    saveState(); renderAllViews();
    showGroupList();
}

if (typeof module !== 'undefined') module.exports = { groupMine, groupOwed, groupTargets, groupMatch };
