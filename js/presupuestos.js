/* ==========================================================================
    11. PRESUPUESTOS
    ========================================================================== */
    function renderPresupuestos() {
        const cont = document.getElementById('budgets-container');
        const month = getUniqueMonths()[0] || new Date().toISOString().slice(0, 7);
        const spentByCat = netTotals(AppState.rows.filter(r => r.d.startsWith(month))).cat;
        cont.innerHTML = CATEGORIES.filter(c => !['Nómina', 'Inversión', 'Sin clasificar'].includes(c)).map(cat => {
            const limit = AppState.budgets[cat] || 0, spent = spentByCat[cat] || 0;
            const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
            let bar = 'bg-emerald-500', txt = 'text-emerald-600 dark:text-emerald-400';
            if (pct >= 100) { bar = 'bg-rose-500'; txt = 'text-rose-600 dark:text-rose-400'; }
            else if (pct >= 80) { bar = 'bg-amber-500'; txt = 'text-amber-600 dark:text-amber-400'; }
            return `
            <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div class="flex items-center justify-between">
                    <h4 class="font-bold text-xs">${cat}</h4>
                    <div class="flex items-center space-x-1">
                        <span class="text-xs text-slate-400">Límite:</span>
                        <input type="number" step="10" placeholder="Sin límite" value="${limit || ''}" onchange="updateBudgetLimit('${cat}', this.value)" class="w-24 px-2 py-1 text-xs text-right rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold">
                        <span class="text-xs font-bold">€</span>
                    </div>
                </div>
                <div>
                    <div class="flex justify-between text-xs font-semibold mb-1"><span class="text-slate-500">Gastado: ${formatEur(spent)}</span><span class="${txt} font-bold">${limit > 0 ? pct + '%' : 'N/A'}</span></div>
                    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden"><div class="${bar} h-2.5 rounded-full transition-all duration-300" style="width:${limit > 0 ? pct : 0}%"></div></div>
                </div>
            </div>`;
        }).join('');
    }
    function updateBudgetLimit(category, value) {
        const v = parseFloat(value);
        if (isNaN(v) || v <= 0) delete AppState.budgets[category]; else AppState.budgets[category] = v;
        saveState(); renderPresupuestos(); showToast(`Presupuesto para ${category} actualizado`);
    }