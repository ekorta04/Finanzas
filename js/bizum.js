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
        // 1) Posibles repartos para cada gasto (entre 2 y 6 personas)
        const options = [];
        for (const e of exps) {
            const total = Math.abs(e.i);
            const end = addDays(e.d, bizumDays);
            const start = addDays(e.d, -1);   // a veces el Bizum llega el día antes de que se cargue el pago
            const cands = incomes.filter(b => !used.has(b.k) && b.d >= start && b.d <= end).sort((a, b) => a.d.localeCompare(b.d));
            if (!cands.length) continue;
            for (let n = 2; n <= 6; n++) {
                const share = total / n;
                // Los amigos suelen redondear (24,60 € → 25 €): se admite un pequeño margen
                const tol = Math.max(0.021, share * (n === 2 ? 0.01 : 0.03));
                const match = cands.filter(b => Math.abs(b.i - share) <= tol);
                const need = n === 2 ? 1 : 2;
                if (match.length >= need) options.push({ exp: e, n, share, need, match });
            }
        }

        // 2) Primero los repartos con más Bizums (una cena entre 4 con
        //    3 Bizums es más fiable que un gasto a medias con 1 Bizum)
        const fit = o => Math.min(o.match.length, o.n - 1);
        options.sort((a, b) => fit(b) - fit(a) || a.exp.d.localeCompare(b.exp.d));

        const out = [];
        const usedExp = new Set();
        for (const o of options) {
            if (usedExp.has(o.exp.k)) continue;
            const avail = o.match.filter(b => !used.has(b.k));
            if (avail.length < o.need) continue;
            const chosen = avail.slice(0, o.n - 1);
            usedExp.add(o.exp.k);
            chosen.forEach(b => used.add(b.k));
            out.push({ exp: o.exp, bz: chosen, n: o.n, share: o.share });
        }
        out.sort((a, b) => a.exp.d.localeCompare(b.exp.d));
        return out;
    }
    
    function renderBizumSuggestions() {
        BizumSugg = computeBizumSuggestions();
        const el = document.getElementById('bizum-alert');
        if (!BizumSugg.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
        el.classList.remove('hidden');
        el.innerHTML = `
            <h3 class="group-header">Gastos compartidos</h3>
            <div class="group">
                ${BizumSugg.map((s, idx) => `
                    <div class="row with-icon" style="align-items:flex-start">
                        <span class="icon-tile round" style="background:var(--teal)"><i class="ic ic-users"></i></span>
                        <div class="row-main">
                            <div class="row-title bold" style="font-size:15px">${esc(s.exp.c)} entre ${s.n}</div>
                            <div class="row-sub" style="white-space:normal">Pagaste ${formatEur(-s.exp.i)} el ${shortDate(s.exp.d)} y te llegaron ${s.bz.length} Bizum${s.bz.length > 1 ? 's' : ''} por ${formatEur(s.bz.reduce((a, b) => a + b.i, 0))}. Tu parte quedaría en ${formatEur(-s.exp.i - s.bz.reduce((a, b) => a + b.i, 0))}. ¿Los agrupo?</div>
                            <div class="flex gap-2 mt-2">
                                <button onclick="applyBizumLink(${idx})" class="btn xs">Agrupar</button>
                                <button onclick="dismissBizum(${idx})" class="btn xs gray">Ahora no</button>
                            </div>
                        </div>
                    </div>`).join('')}
            </div>`;
    }
    
    function applyBizumLink(idx) {
        const s = BizumSugg[idx]; if (!s) return;
        s.exp.bz = s.bz.map(b => b.k);
        s.bz.forEach(b => { b.lk = s.exp.k; });
        saveState(); renderAllViews();
        showToast('Gasto compartido agrupado');
    }
    /* ----------------------------------------------------------------------
       Agrupar a mano: elegir qué ingresos forman parte de un gasto compartido
       (sirve cuando cada amigo paga un importe distinto)
       ---------------------------------------------------------------------- */
    let BizumPick = null;   // { k: clave del gasto, sel: Set de claves, all: bool }

    function openBizumPicker(encKey) {
        const k = decodeURIComponent(encKey);
        const e = AppState.rows.find(r => r.k === k);
        if (!e || e.i >= 0) return;
        BizumPick = { k, sel: new Set(e.bz || []), all: false };
        document.getElementById('bizum-pick-all').checked = false;
        paintBizumPicker();
        document.getElementById('bizum-modal').classList.remove('hidden');
    }

    function bizumPickCandidates() {
        const e = AppState.rows.find(r => r.k === BizumPick.k);
        const from = addDays(e.d, -3), to = addDays(e.d, 14);
        return AppState.rows.filter(b =>
            b.i > 0 && b.k !== e.k && (
                BizumPick.sel.has(b.k) ||
                (!b.lk && b.d >= from && b.d <= to && (BizumPick.all || isBizum(b)))
            )
        ).sort((a, b) => a.d.localeCompare(b.d) || a.k.localeCompare(b.k));
    }

    function updateBizumPickSummary() {
        const e = AppState.rows.find(r => r.k === BizumPick.k);
        const sum = AppState.rows.filter(b => BizumPick.sel.has(b.k)).reduce((a, b) => a + b.i, 0);
        document.getElementById('bizum-pick-sum').innerHTML =
            `Recibido ${formatEur(sum)} · <b>Tu parte ${formatEur(-e.i - sum)}</b>`;
    }

    function paintBizumPicker() {
        const e = AppState.rows.find(r => r.k === BizumPick.k);
        const list = bizumPickCandidates();
        document.getElementById('bizum-pick-title').textContent = e.c;
        document.getElementById('bizum-pick-sub').textContent =
            `Pagaste ${formatEur(-e.i)} el ${shortDate(e.d)}. Marca los ingresos que te devolvieron.`;
        document.getElementById('bizum-pick-list').innerHTML = list.length
            ? list.map(b => `
                <label class="pick-row">
                    <input type="checkbox" data-k="${enc(b.k)}" ${BizumPick.sel.has(b.k) ? 'checked' : ''}>
                    <span class="truncate">${shortDate(b.d)} · ${esc(b.c)}</span>
                    <span class="num pos">+${formatEur(b.i)}</span>
                </label>`).join('')
            : '<div class="muted small" style="padding:14px 0">No hay ingresos cerca de esa fecha.</div>';
        updateBizumPickSummary();
    }

    function onBizumPickToggle(ev) {
        const cb = ev.target.closest('input[data-k]');
        if (!cb || !BizumPick) return;
        const k = decodeURIComponent(cb.dataset.k);
        if (cb.checked) BizumPick.sel.add(k); else BizumPick.sel.delete(k);
        updateBizumPickSummary();
    }

    function onBizumPickAll(checked) {
        if (!BizumPick) return;
        BizumPick.all = checked;
        paintBizumPicker();
    }

    function closeBizumPicker() {
        document.getElementById('bizum-modal').classList.add('hidden');
        BizumPick = null;
    }

    function applyBizumPick() {
        if (!BizumPick) return;
        const map = byKeyMap();
        const e = map.get(BizumPick.k);
        if (!e) { closeBizumPicker(); return; }

        // Soltar los anteriores y vincular los marcados
        (e.bz || []).forEach(bk => { const b = map.get(bk); if (b) delete b.lk; });
        const chosen = [...BizumPick.sel].filter(bk => map.has(bk));
        if (chosen.length) {
            e.bz = chosen;
            chosen.forEach(bk => { map.get(bk).lk = e.k; });
        } else {
            delete e.bz;
            if (!AppState.dismissed.includes(e.k)) AppState.dismissed.push(e.k);
        }

        closeBizumPicker();
        saveState(); renderAllViews();
        showToast(chosen.length ? 'Gasto compartido agrupado' : 'Bizums desvinculados');
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