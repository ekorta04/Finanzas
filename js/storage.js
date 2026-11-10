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
        st.customCats = (Array.isArray(st.customCats) ? st.customCats : [])
            .filter(c => c && typeof c.n === 'string' && c.n.trim())
            .map(c => ({
                n: c.n.trim().slice(0, 30),
                ic: CAT_ICONS.includes(c.ic) ? c.ic : 'tag',
                col: CAT_COLORS.includes(c.col) ? c.col : '--gray'
            }));
        applyCustomCategories(st.customCats);
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