/* ==========================================================================
    3. PERSISTENCIA
    ========================================================================== */
    // Pasar categorías de versiones anteriores a las nuevas (reglas, movimientos y presupuestos)
    function migrateRowCats(rows) {
        (rows || []).forEach(r => {
            if (!r || !(LEGACY_CATS[r.cat] || (r.cat === 'Transporte' && !r.man))) return;
            if (!r.man) {
                const nc = classifyConcept(r.c, AppState.rules);
                r.cat = nc !== 'Sin clasificar' ? nc : migrateCat(r.cat);
            } else r.cat = migrateCat(r.cat);
        });
    }
    function normalizeState(p) {
        const base = defaultState();
        const st = Object.assign(base, p || {});
        st.settings = Object.assign({ bizumMin: 30, bizumDays: 4 }, (p && p.settings) || {});
        if (!Array.isArray(st.rules)) st.rules = DEFAULT_RULES.slice();
        ['rows', 'imports', 'inv', 'invValues', 'dismissed'].forEach(k => { if (!Array.isArray(st[k])) st[k] = []; });
        st.invXray = (Array.isArray(st.invXray) ? st.invXray : [])
            .filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.d) && typeof x.v === 'number' && Array.isArray(x.assets))
            .map(x => Object.assign({ countries: [], sectors: [], top: [], funds: [], rent: {} }, x))
            .sort((a, b) => a.d.localeCompare(b.d)).slice(-36);
        st.rules = st.rules.filter(r => r && typeof r.p === 'string').map(r => {
            const d = DEFAULT_RULES.find(x => x.p === r.p);
            if (!LEGACY_CATS[r.c] && !(r.c === 'Transporte' && d && d.c !== r.c)) return r;
            return { p: r.p, c: d ? d.c : migrateCat(r.c) };
        });
        if (!st.budgets || typeof st.budgets !== 'object') st.budgets = {};
        st.customCats = (Array.isArray(st.customCats) ? st.customCats : [])
            .filter(c => c && typeof c.n === 'string' && c.n.trim())
            .map(c => ({
                n: c.n.trim().slice(0, 30),
                ic: CAT_ICONS.includes(c.ic) ? c.ic : 'tag',
                col: CAT_COLORS.includes(c.col) ? c.col : '--gray'
            }));
        applyCustomCategories(st.customCats);
        if (Array.isArray(st.rows)) {
            const prev = AppState; AppState = st;      // classifyConcept usa las reglas ya migradas
            try { migrateRowCats(st.rows); } finally { AppState = prev; }
        }
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