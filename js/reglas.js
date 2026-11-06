/* ==========================================================================
    12. REGLAS
    ========================================================================== */
    function renderReglas() {
        document.getElementById('rules-count').textContent = AppState.rules.length;
        const tb = document.getElementById('rules-table-body');
        if (!AppState.rules.length) { tb.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-slate-400">No hay reglas configuradas.</td></tr>`; return; }
        tb.innerHTML = AppState.rules.map((rule, idx) => `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td class="py-2.5 px-4 font-semibold">${esc(rule.p)}</td>
                <td class="py-2.5 px-4"><span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md font-medium">${esc(rule.c)}</span></td>
                <td class="py-2.5 px-4 text-right"><button onclick="deleteRule(${idx})" class="text-rose-500 hover:text-rose-700 p-1"><i class="fa-solid fa-trash-can"></i></button></td>
            </tr>`).join('');
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