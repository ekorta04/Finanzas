/* ==========================================
   FINANZAS
   CONEXIÓN CON SUPABASE
   ========================================== */

const SUPABASE_URL = 'https://suhuvgoafcbgdsduxscb.supabase.co';

const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_s9lEFM2fuQf76q0miwdTjA_QkULdaKa';


/* ------------------------------------------
   "MANTENER SESIÓN INICIADA"
   - Sí: la sesión se guarda en localStorage y
     sobrevive a cerrar el navegador / la app.
   - No: se guarda en sessionStorage y se pierde
     al cerrar la pestaña o la app.
   ------------------------------------------ */

const REMEMBER_KEY = 'finanzas_remember_session';

function getRememberSession() {
    try {
        return localStorage.getItem(REMEMBER_KEY) !== '0';
    } catch (e) {
        return true;
    }
}

function setRememberSession(remember) {
    try {
        localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    } catch (e) { /* sin almacenamiento: se usa el valor por defecto */ }
}

// Almacenamiento de la sesión según la preferencia elegida
const sessionStore = {
    getItem(key) {
        try {
            return getRememberSession()
                ? localStorage.getItem(key)
                : sessionStorage.getItem(key);
        } catch (e) {
            return null;
        }
    },
    setItem(key, value) {
        try {
            if (getRememberSession()) {
                localStorage.setItem(key, value);
                sessionStorage.removeItem(key);
            } else {
                sessionStorage.setItem(key, value);
                localStorage.removeItem(key);   // nunca dejar la sesión en disco
            }
        } catch (e) { /* ignorar */ }
    },
    removeItem(key) {
        try { localStorage.removeItem(key); } catch (e) {}
        try { sessionStorage.removeItem(key); } catch (e) {}
    }
};

// Usuario de la sesión guardada en el dispositivo, leído al instante
// (sin esperar a internet). Devuelve null si no hay sesión.
function getStoredSessionUserId() {
    try {
        const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
        const raw = sessionStore.getItem(`sb-${ref}-auth-token`);
        const stored = raw ? JSON.parse(raw) : null;
        return (stored && stored.user && stored.user.id) || null;
    } catch (e) {
        return null;
    }
}

// Cliente de Supabase
const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            storage: sessionStore,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);
