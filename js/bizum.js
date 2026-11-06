/* ==========================================================================
    6. BIZUMS: DETECCIÓN Y VINCULACIÓN
    ========================================================================== */
    function computeBizumSuggestions() {
        const { bizumMin, bizumDays } = AppState.settings;
        const dismissed = new Set(AppState.dismissed);
        const used = new Set(AppState.rows.filter(r => r.lk).map(r => r.k));
        const exps = AppState.rows
            .filter(r => r.i <= -bizumMin && r.cat !== 'Inversión' && !isBizum(r) && !(r.bz && r.bz.length) && !dismissed.has(r.k))
            .sort((a, b) => a.d.localeCompare(b.d));
        const incomes = AppState.rows.filter(r => r.i > 0 && isBizum(r) && !r.lk);
        const out = [];
    
        for (const e of exps) {
            const total = Math.abs(e.i);
            const end = addDays(e.d, bizumDays);
            const cands = incomes.filter(b => !used.has(b.k) && b.d >= e.d && b.d <= end).sort((a, b) => a.d.localeCompare(b.d));
            if (!cands.length) continue;
            let best = null;
            for (let n = 2; n <= 6; n++) {
                const share = total / n;
                const match = cands.filter(b => Math.abs(b.i - share) <= 0.021);
                const need = n === 2 ? 1 : 2;
                if (match.length < need) continue;
                const chosen = match.slice(0, n - 1);
                if (!best || chosen.length > best.bz.length) best = { exp: e, bz: chosen, n, share };
            }
            if (best) { best.bz.forEach(b => used.add(b.k)); out.push(best); }
        }
        return out;
    }
    
    function renderBizumSuggestions() {
        BizumSugg = computeBizumSuggestions();
        const el = document.getElementById('bizum-alert');
        if (!BizumSugg.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
        el.classList.remove('hidden');
        el.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                    <i class="fa-solid fa-people-arrows text-sky-600 dark:text-sky-400 text-lg"></i>
                    <h4 class="font-semibold text-sky-900 dark:text-sky-200 text-sm">${BizumSugg.length} sugerencia(s) de vinculación Bizum</h4>
                </div>
            </div>
            <div class="space-y-2 max-h-72 overflow-y-auto">
                ${BizumSugg.map((s, idx) => `
                    <div class="bg-white dark:bg-slate-900 rounded-xl border border-sky-100 dark:border-sky-900/60 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div class="text-xs">
                            <p class="font-semibold">¿Quieres vincular estos ${s.bz.length} Bizum(s) al gasto en <span class="text-brand-600 dark:text-brand-400">${esc(s.exp.c)}</span>?</p>
                            <p class="text-slate-500 mt-0.5">Gasto ${formatDateEs(s.exp.d)}: <strong>${formatEur(s.exp.i)}</strong> · cada Bizum ≈ 1/${s.n} (${formatEur(s.share)})</p>
                            <p class="text-slate-400 mt-0.5">${s.bz.map(b => `${formatDateEs(b.d)} +${formatEur(b.i)}`).join(' · ')}</p>
                        </div>
                        <div class="flex gap-2 shrink-0">
                            <button onclick="applyBizumLink(${idx})" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg">Vincular</button>
                            <button onclick="dismissBizum(${idx})" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold rounded-lg">Descartar</button>
                        </div>
                    </div>`).join('')}
            </div>`;
    }
    
    function applyBizumLink(idx) {
        const s = BizumSugg[idx]; if (!s) return;
        s.exp.bz = s.bz.map(b => b.k);
        s.bz.forEach(b => { b.lk = s.exp.k; });
        saveState(); renderAllViews();
        showToast(`${s.bz.length} Bizum(s) vinculados al gasto`);
    }
    function dismissBizum(idx) {
        const s = BizumSugg[idx]; if (!s) return;
        if (!AppState.dismissed.includes(s.exp.k)) AppState.dismissed.push(s.exp.k);
        saveState(); renderAllViews();
    }
    function unlinkBizums(encKey) {
        const k = decodeURIComponent(encKey);
        const e = AppState.rows.find(r => r.k === k); if (!e) return;
        const map = byKeyMap();
        (e.bz || []).forEach(bk => { const b = map.get(bk); if (b) delete b.lk; });
        delete e.bz;
        if (!AppState.dismissed.includes(k)) AppState.dismissed.push(k);
        saveState(); renderAllViews(); showToast('Bizums desvinculados');
    }
    function saveBizumSettings() {
        const min = parseFloat(document.getElementById('set-bizum-min').value);
        const days = parseInt(document.getElementById('set-bizum-days').value, 10);
        AppState.settings.bizumMin = isNaN(min) || min < 1 ? 30 : min;
        AppState.settings.bizumDays = isNaN(days) || days < 1 ? 4 : Math.min(14, days);
        saveState(); renderAllViews();
    }
    function resetDismissed() { AppState.dismissed = []; saveState(); renderAllViews(); showToast('Sugerencias descartadas recuperadas'); }
    function renderSettings() {
        document.getElementById('set-bizum-min').value = AppState.settings.bizumMin;
        document.getElementById('set-bizum-days').value = AppState.settings.bizumDays;
    }