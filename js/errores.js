/* ==========================================================================
    REGISTRO DE ERRORES
    Cuando algo falla en la app, se apunta en la tabla "app_errors" de
    Supabase (ver supabase/app_errors.sql). La comprobación diaria la lee y
    avisa por correo. Nunca se guardan importes ni movimientos, solo el
    mensaje del error.
    ========================================================================== */
const ErrorLog = {
    MAX: 15,              // tope de errores registrados por sesión
    count: 0,
    seen: new Set(),
    queue: [],
    busy: false,
    available: null       // false = la tabla no existe todavía en Supabase
};

function errorLogText(value) {
    if (value == null) return '';
    if (value instanceof Error) return value.message || String(value);
    if (typeof value === 'object') {
        const code = value.code ? ` [${value.code}]` : '';
        if (value.message) return String(value.message) + code;
        try { return JSON.stringify(value); } catch (e) { return String(value); }
    }
    return String(value);
}

function logAppError(kind, message, stack) {
    try {
        message = String(message || '').trim().slice(0, 500);
        if (!message || message === 'Script error.') return;
        // Quedarse sin conexión no es un fallo de la app
        if (/failed to fetch|load failed|networkerror|network request failed|sin conexión/i.test(message)) return;
        if (ErrorLog.available === false || ErrorLog.count >= ErrorLog.MAX) return;

        const id = kind + '|' + message;
        if (ErrorLog.seen.has(id)) return;
        ErrorLog.seen.add(id);
        ErrorLog.count++;

        ErrorLog.queue.push({
            kind,
            message,
            stack: stack ? String(stack).slice(0, 2000) : null,
            page: (document.querySelector('.tab-content:not(.hidden)') || {}).id || null,
            user_agent: navigator.userAgent.slice(0, 300)
        });
        flushErrorLog();
    } catch (e) { /* registrar un error nunca debe romper la app */ }
}

async function errorLogVersion() {
    try {
        const keys = await caches.keys();
        return keys.find(k => k.startsWith('finanzas-')) || null;
    } catch (e) { return null; }
}

async function flushErrorLog() {
    if (ErrorLog.busy || !ErrorLog.queue.length || !navigator.onLine) return;
    if (typeof supabaseClient === 'undefined') return;

    const userId = getStoredSessionUserId();
    if (!userId) return;   // se enviará tras iniciar sesión

    ErrorLog.busy = true;
    const batch = ErrorLog.queue.splice(0);

    try {
        const version = await errorLogVersion();
        const { error } = await supabaseClient
            .from('app_errors')
            .insert(batch.map(b => Object.assign({ user_id: userId, app_version: version }, b)));

        if (error) {
            const code = String(error.code || '');
            if (code === 'PGRST205' || code === '42P01' || /does not exist|could not find the table/i.test(error.message || '')) {
                ErrorLog.available = false;
            }
        }
    } catch (e) { /* sin conexión: se pierde este aviso, no pasa nada */ }
    finally {
        ErrorLog.busy = false;
        // Lo que haya llegado mientras se enviaba
        if (ErrorLog.queue.length && ErrorLog.available !== false) setTimeout(flushErrorLog, 0);
    }
}

// Errores no controlados y archivos de la app que no cargan
window.addEventListener('error', e => {
    const t = e.target;
    if (t && t !== window && (t.src || t.href)) {
        if (navigator.onLine) logAppError('recurso', 'No se pudo cargar ' + (t.src || t.href));
        return;
    }
    const where = e.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno})` : '';
    logAppError('error', (e.message || 'Error desconocido') + where, e.error && e.error.stack);
}, true);

window.addEventListener('unhandledrejection', e => {
    logAppError('promesa', errorLogText(e.reason), e.reason && e.reason.stack);
});

// Errores que la app ya controla y escribe en la consola
(() => {
    const original = console.error;
    console.error = function (...args) {
        original.apply(console, args);
        const err = args.find(a => a instanceof Error);
        logAppError('consola', args.map(errorLogText).join(' '), err && err.stack);
    };
})();

window.addEventListener('online', flushErrorLog);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flushErrorLog();
});
