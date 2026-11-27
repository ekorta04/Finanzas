/* ==========================================================================
   PERFILES (cuentas y tarjetas)
   Cada perfil es una cuenta de la base de datos: «Débito», «Crédito», otro
   banco… Todos los movimientos se cargan juntos (cada uno con su perfil en
   r.a) y el selector de arriba elige qué se ve: todos juntos o uno.
   · AppState.all   = movimientos de todos los perfiles (no se guarda en el dispositivo)
   · AppState.rows  = los que se ven ahora (todos, o los del perfil elegido)
   El saldo y el patrimonio suman el último saldo de cada perfil.
   ========================================================================== */

let viewAcc = 'all';        // 'all' o el id de un perfil
let ProfileList = [];       // [{ id, name, bank_name }]

const allRows = () => AppState.all || AppState.rows;
const viewKey = userId => `finanzas_view_acc_${userId}`;

// Dejar en AppState.rows lo que toca ver según el perfil elegido
function applyView() {
    const all = allRows();
    AppState.all = all;
    AppState.rows = viewAcc === 'all' ? all : all.filter(r => r.a === viewAcc);
}

function profileName(id) {
    const p = ProfileList.find(x => x.id === id);
    return p ? p.name : '';
}

// Recordar los perfiles del usuario y qué perfil se estaba viendo
function setProfiles(accounts, userId) {
    ProfileList = accounts.map(a => ({ id: a.id, name: a.name, bank_name: a.bank_name }));
    restoreViewAcc(userId);
    if (viewAcc !== 'all' && !ProfileList.some(p => p.id === viewAcc)) viewAcc = 'all';
}

function restoreViewAcc(userId) {
    try { viewAcc = localStorage.getItem(viewKey(userId)) || 'all'; } catch (e) { viewAcc = 'all'; }
}

// Saldo actual de cada perfil: el del último movimiento del banco (las filas van de más nuevas a más antiguas)
function accountBalances(rows) {
    const out = new Map();
    rows.forEach(r => {
        const a = r.a || '';
        if (!isManualRow(r) && r.s != null && !out.has(a)) out.set(a, r.s);
    });
    return out;
}
const totalBalance = rows => [...accountBalances(rows).values()].reduce((a, b) => a + b, 0);

/* ---------- Selector de arriba ---------- */

function renderViewSelector() {
    const multi = ProfileList.length > 1;
    ['view-acc-top', 'view-acc-mob'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('hidden', !multi);
        el.innerHTML = '<option value="all">Todos los perfiles</option>'
            + ProfileList.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
        el.value = viewAcc;
    });
}

async function onViewChange(value) {
    viewAcc = value === 'all' || ProfileList.some(p => p.id === value) ? value : 'all';
    try {
        const user = await getCurrentUser();
        if (user) localStorage.setItem(viewKey(user.id), viewAcc);
    } catch (e) { /* sin almacenamiento */ }

    if (viewAcc !== 'all') {
        window.activeSupabaseAccountId = viewAcc;   // por defecto se importa y se apunta en el perfil que se está viendo
        const sel = document.getElementById('import-account');
        if (sel) sel.value = viewAcc;
        dbImports = null;
    }
    applyView();
    movsLimit = 150;
    renderAllViews();
}

/* ---------- Gestión en Datos ---------- */

function renderProfiles() {
    const el = document.getElementById('profiles-list');
    if (!el) return;
    el.innerHTML = ProfileList.map(p => {
        const n = allRows().filter(r => r.a === p.id).length;
        const sub = [p.bank_name, `${n} movimientos`].filter(Boolean).join(' · ');
        return `
        <div class="row">
            <div class="row-main"><div class="row-title" style="font-size:15px">${esc(p.name)}</div><div class="row-sub truncate">${esc(sub)}</div></div>
            <button type="button" class="link small" onclick="renameProfile('${esc(p.id)}')">Renombrar</button>
            <button type="button" class="link small" style="color:var(--red);margin-left:10px" onclick="deleteProfile('${esc(p.id)}')">Borrar</button>
        </div>`;
    }).join('') || '<div class="row"><span class="muted small">Aún no hay perfiles: se crea uno al importar.</span></div>';
}

// Pregunta un texto con la ventana de la app
function askText(title, value = '', placeholder = '') {
    return new Promise(resolve => {
        const modal = document.getElementById('text-modal');
        const input = document.getElementById('text-input');
        const ok = document.getElementById('text-ok'), cancel = document.getElementById('text-cancel');
        document.getElementById('text-title').textContent = title;
        input.value = value;
        input.placeholder = placeholder;
        const done = v => { modal.classList.add('hidden'); ok.onclick = cancel.onclick = input.onkeydown = null; resolve(v); };
        ok.onclick = () => done(input.value.trim());
        cancel.onclick = () => done(null);
        input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(input.value.trim()); } if (e.key === 'Escape') done(null); };
        modal.classList.remove('hidden');
        input.focus();
    });
}

const validProfileName = s => s && s.length <= 40 && !/[<>"'&]/.test(s);

async function createProfile() {
    const nameEl = document.getElementById('profile-new-name'), bankEl = document.getElementById('profile-new-bank');
    const name = nameEl.value.trim().replace(/\s+/g, ' ');
    const bank = bankEl.value.trim().replace(/\s+/g, ' ');
    if (!validProfileName(name)) { showToast('Escribe un nombre (máx. 40 letras, sin < > " \' &)', 'error'); return; }
    if (ProfileList.some(p => norm(p.name) === norm(name))) { showToast('Ya tienes un perfil con ese nombre', 'error'); return; }
    try {
        const acc = await createMyAccount(name, bank || 'Laboral Kutxa');
        nameEl.value = ''; bankEl.value = '';
        window.activeSupabaseAccountId = acc.id;   // el siguiente archivo que importes irá a este perfil
        await loadUserDashboard({ keepTab: true });
        showToast(`Perfil «${name}» creado`);
    } catch (error) {
        console.error('Error creando el perfil:', error);
        showToast('No se pudo crear: ' + describeSupabaseError(error), 'error');
    }
}

async function renameProfile(id) {
    const p = ProfileList.find(x => x.id === id);
    if (!p) return;
    const name = await askText('Renombrar perfil', p.name, 'Nombre');
    if (name === null || name === p.name) return;
    if (!validProfileName(name)) { showToast('Nombre no válido (máx. 40 letras, sin < > " \' &)', 'error'); return; }
    if (ProfileList.some(x => x.id !== id && norm(x.name) === norm(name))) { showToast('Ya tienes un perfil con ese nombre', 'error'); return; }
    try {
        const { error } = await supabaseClient.from('accounts').update({ name }).eq('id', id);
        if (error) throw error;
        p.name = name;
        renderImportAccountSelector(ProfileList.map(x => ({ id: x.id, name: x.name, bank_name: x.bank_name })), window.activeSupabaseAccountId);
        renderAllViews();
        showToast('Perfil renombrado');
    } catch (error) {
        console.error('Error renombrando el perfil:', error);
        showToast('No se pudo renombrar: ' + describeSupabaseError(error), 'error');
    }
}

async function deleteProfile(id) {
    const p = ProfileList.find(x => x.id === id);
    if (!p) return;
    if (ProfileList.length < 2) { showToast('Tiene que quedar al menos un perfil', 'error'); return; }
    const keys = allRows().filter(r => r.a === id).map(r => r.k);
    const ok = await askConfirm(`¿Borrar el perfil «${p.name}»?\nSe eliminarán sus ${keys.length} movimientos y su historial de importaciones. No se puede deshacer.`);
    if (!ok) return;
    try {
        const { error } = await supabaseClient.from('accounts').delete().eq('id', id);
        if (error) throw error;
        if (window.activeSupabaseAccountId === id) window.activeSupabaseAccountId = null;
        if (viewAcc === id) viewAcc = 'all';
        dbImports = null;
        await loadUserDashboard({ keepTab: true });
        showToast(`Perfil «${p.name}» borrado`);
    } catch (error) {
        console.error('Error borrando el perfil:', error);
        showToast('No se pudo borrar: ' + describeSupabaseError(error), 'error');
    }
}
