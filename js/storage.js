/* ==========================================================================
    3. PERSISTENCIA
    ========================================================================== */
    function normalizeState(p) {
        const base = defaultState();
        const st = Object.assign(base, p || {});
        st.settings = Object.assign({ bizumMin: 30, bizumDays: 4 }, (p && p.settings) || {});
        if (!Array.isArray(st.rules)) st.rules = DEFAULT_RULES.slice();
        ['rows', 'imports', 'inv', 'invValues', 'dismissed'].forEach(k => { if (!Array.isArray(st[k])) st[k] = []; });
        if (!st.budgets || typeof st.budgets !== 'object') st.budgets = {};
        return st;
    }
    function loadState() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            AppState = normalizeState(stored ? JSON.parse(stored) : null);
        } catch (e) { console.error(e); AppState = defaultState(); }
    }
    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState)); } catch (e) { /* sin almacenamiento local: sigue la nube */ }
        cloudSchedule();
    }