/* ==========================================================================
    ESTADO DE LA BASE DE DATOS (SUPABASE)
    Los datos ya no se envían a Google Sheets.
    ========================================================================== */
const Cloud = { state: 'off' };

function setCloudStatus(txt, kind) {
    Cloud.state = kind;
    const el = document.getElementById('cloud-status-text'); if (el) el.textContent = txt;
    const dot = document.getElementById('cloud-dot-i'), dt = document.getElementById('cloud-dot-t');
    if (dot) {
        dot.className = 'inline-block w-2.5 h-2.5 rounded-full ' + (kind === 'ok' ? 'bg-emerald-500' : kind === 'busy' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500');
        dt.textContent = kind === 'ok' ? 'Sincronizado' : kind === 'busy' ? 'Cargando…' : kind === 'err' ? 'Error: toca' : 'Sin conexión';
        document.getElementById('cloud-dot').title = txt;
    }
}

function setCloudOk() {
    setCloudStatus('Datos cargados de la base de datos a las ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), 'ok');
}

function setCloudUser(user) {
    const u = document.getElementById('cloud-user'); if (u) u.textContent = (user && user.email) || '';
    const r = document.getElementById('cloud-remember');
    if (r) r.textContent = getRememberSession() ? 'Sesión mantenida en este dispositivo' : 'La sesión se cerrará al cerrar la app';
}

function cloudDotClick() {
    if (Cloud.state === 'err') { cloudSyncNow(); return; }
    switchTab('v-datos');
}

// Los movimientos se guardan directamente en la base de datos al importar
// o al cambiar una categoría; no hay nada pendiente de subir.
function cloudSchedule() {}

async function cloudSyncNow() {
    try {
        await loadUserDashboard({ keepTab: true });
        showToast('Datos actualizados');
    } catch (e) {
        console.error(e);
        setCloudStatus('Error con la base de datos: ' + describeSupabaseError(e), 'err');
        showToast('No se pudieron cargar los datos', 'error');
    }
}
