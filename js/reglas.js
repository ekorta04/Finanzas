/* ==========================================================================
    12. REGLAS
    ========================================================================== */
    function renderReglas() {
        const q = norm((document.getElementById('rule-search') || {}).value || '');
        const list = AppState.rules.map((rule, idx) => ({ rule, idx }))
            .filter(({ rule }) => !q || norm(rule.p).includes(q) || norm(rule.c).includes(q));
        document.getElementById('rules-count').textContent = q ? `${list.length} de ${AppState.rules.length}` : AppState.rules.length;
        const tb = document.getElementById('rules-table-body');
        if (!list.length) { tb.innerHTML = `<div class="row"><span class="muted small">${q ? 'Ninguna regla coincide.' : 'No hay reglas.'}</span></div>`; return; }
        tb.innerHTML = list.map(({ rule, idx }) => `
            <div class="row with-icon">
                ${catIcon(rule.c, false)}
                <div class="row-main">
                    <div class="row-title truncate">${esc(rule.p)}</div>
                    <div class="row-sub">${esc(rule.c)}</div>
                </div>
                <button onclick="deleteRule(${idx})" class="btn xs danger" aria-label="Eliminar regla ${esc(rule.p)}"><i class="ic ic-trash-2"></i></button>
            </div>`).join('');
    }
    function addRuleFromInput() {
        const p = document.getElementById('rule-pattern').value.trim();
        const c = document.getElementById('rule-category').value;
        if (!p) { showToast('Escribe un texto o palabra clave', 'error'); return; }
        AppState.rules.unshift({ p, c });
        AppState.rows.forEach(r => { if (!r.man) r.cat = classifyConcept(r.c, AppState.rules); });
        saveState(); renderAllViews();
        document.getElementById('rule-pattern').value = '';
        showToast('Nueva regla añadida y aplicada');
    }
    function deleteRule(idx) { AppState.rules.splice(idx, 1); saveState(); renderAllViews(); showToast('Regla eliminada'); }