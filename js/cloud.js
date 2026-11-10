/* ==========================================================================
    ESTADO DE LA BASE DE DATOS (SUPABASE)
    ========================================================================== */
const Cloud = { state: 'off' };

function setCloudStatus(txt, kind) {
    Cloud.state = kind;
    const el = document.getElementById('cloud-status-text'); if (el) el.textContent = txt;
    const color = kind === 'ok' ? 'var(--green)' : kind === 'busy' ? 'var(--orange)' : kind === 'err' ? 'var(--red)' : 'var(--gray)';
    const dot = document.getElementById('cloud-dot-i'), dt = document.getElementById('cloud-dot-t');
    if (dot) {
        dot.style.background = color;
        dt.textContent = kind === 'ok' ? 'Al día' : kind === 'busy' ? 'Sincronizando…' : kind === 'err' ? 'Revisar' : 'Sin conexión';
        document.getElementById('cloud-dot').title = txt;
    }
    const badge = document.getElementById('tab-sync-badge');
    if (badge) badge.classList.toggle('hidden', kind !== 'err');
}

function setCloudOk() {
    setCloudStatus('Al día · ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), 'ok');
}

function setCloudUser(user) {
    const u = document.getElementById('cloud-user'); if (u) u.textContent = (user && user.email) || '';
    const r = document.getElementById('cloud-remember');
    if (r) r.textContent = getRememberSession() ? 'Sesión iniciada en este dispositivo' : 'La sesión se cerrará al cerrar la app';
}

function cloudDotClick() {
    if (Cloud.state === 'err') { cloudSyncNow(); return; }
    switchTab('v-datos');
}

/* --------------------------------------------------------------------------
   AJUSTES SINCRONIZADOS (tabla user_settings)
   Los movimientos y sus categorías ya van a la tabla "transactions".
   Aquí se guarda el resto: reglas, presupuestos, etiquetas, Bizums
   vinculados, sugerencias descartadas, ajustes, histórico e inversión,
   para ver lo mismo en el iPhone y en el ordenador.
   -------------------------------------------------------------------------- */
const SETTINGS_FIELDS = ['rules', 'budgets', 'imports', 'inv', 'invMap', 'invSign', 'invValues', 'invXray', 'dismissed', 'settings', 'customCats'];

// null = aún no se sabe; false = la tabla no existe todavía en Supabase
Cloud.settingsAvailable = null;
Cloud.saveTimer = null;
Cloud.dirty = false;

function buildCloudData() {
    const tags = {}, links = {};
    AppState.rows.forEach(r => {
        if (r.t && r.t.length) tags[r.k] = r.t;
        if (r.lk) links[r.k] = r.lk;
    });
    const data = { v: 1, tags, links };
    SETTINGS_FIELDS.forEach(f => { data[f] = AppState[f]; });
    return data;
}

// Aplicar los ajustes de la nube sobre los movimientos ya cargados
function applyCloudData(data) {
    const rows = AppState.rows;
    const next = {};
    SETTINGS_FIELDS.forEach(f => { if (data[f] !== undefined) next[f] = data[f]; });
    AppState = normalizeState(Object.assign({}, AppState, next));
    AppState.rows = rows;

    const tags = data.tags || {}, links = data.links || {};
    const byKey = new Map(rows.map(r => [r.k, r]));
    rows.forEach(r => {
        r.t = tags[r.k] || [];
        delete r.lk;
        delete r.bz;
    });
    Object.entries(links).forEach(([child, parent]) => {
        const c = byKey.get(child), p = byKey.get(parent);
        if (!c || !p) return;
        c.lk = parent;
        (p.bz = p.bz || []).push(child);
    });
}

async function fetchCloudSettings(userId) {
    const { data, error } = await supabaseClient
        .from('user_settings')
        .select('data, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        const code = String(error.code || '');
        if (code === 'PGRST205' || code === '42P01' || /does not exist|could not find the table/i.test(error.message || '')) {
            Cloud.settingsAvailable = false;
            return undefined;   // la tabla no existe: seguir solo con el dispositivo
        }
        throw error;
    }

    Cloud.settingsAvailable = true;
    return data ? data.data : null;
}

async function cloudSaveSettings() {
    clearTimeout(Cloud.saveTimer);
    Cloud.saveTimer = null;
    if (!Cloud.dirty || Cloud.settingsAvailable === false) return;

    const userId = getStoredSessionUserId();
    if (!userId) return;

    Cloud.dirty = false;
    const { error } = await supabaseClient
        .from('user_settings')
        .upsert({ user_id: userId, data: buildCloudData(), updated_at: new Date().toISOString() });

    if (error) {
        Cloud.dirty = true;
        console.error('No se pudieron guardar los ajustes:', error);
        setCloudStatus('Cambios pendientes de guardar: ' + describeSupabaseError(error), 'err');
        throw error;
    }

    setCloudStatus('Guardado · ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), 'ok');
}

// Guardar todo lo pendiente antes de recargar datos de la nube
async function cloudFlush() {
    if (!Cloud.dirty) return;
    try { await cloudSaveSettings(); } catch (e) { /* se reintenta en el próximo cambio */ }
}

// Se llama en cada saveState(): guarda en la nube 1,5 s después del último cambio
function cloudSchedule() {
    if (Cloud.settingsAvailable === false) return;
    Cloud.dirty = true;
    clearTimeout(Cloud.saveTimer);
    Cloud.saveTimer = setTimeout(() => { cloudSaveSettings().catch(() => {}); }, 1500);
}

// Al salir de la app (o pasarla a segundo plano) guardar lo pendiente
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cloudFlush();
});
window.addEventListener('online', () => cloudFlush());

async function cloudSyncNow() {
    try {
        await cloudFlush();
        await loadUserDashboard({ keepTab: true });
        showToast('Datos actualizados');
    } catch (e) {
        console.error(e);
        setCloudStatus('Error con la base de datos: ' + describeSupabaseError(e), 'err');
        showToast('No se pudieron cargar los datos', 'error');
    }
}
