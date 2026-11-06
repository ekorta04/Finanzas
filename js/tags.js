/* ==========================================================================
    7. ETIQUETAS
    ========================================================================== */
    const cleanTag = s => String(s || '').trim().replace(/^#+/, '').replace(/\s+/g, '').slice(0, 30);

    function allTags() {
        const m = new Map();
        AppState.rows.forEach(r => (r.t || []).forEach(t => { if (!m.has(t.toLowerCase())) m.set(t.toLowerCase(), t); }));
        return [...m.values()].sort((a, b) => a.localeCompare(b, 'es'));
    }
    function canonicalTag(tag, tagsList) { return (tagsList || allTags()).find(x => x.toLowerCase() === tag.toLowerCase()) || tag; }
    function rowAddTag(r, tag) {
        r.t = r.t || [];
        if (r.t.some(x => x.toLowerCase() === tag.toLowerCase())) return false;
        r.t.push(tag); return true;
    }
    function populateTagControls() {
        const tags = allTags();
        document.getElementById('tag-list').innerHTML = tags.map(t => `<option value="#${esc(t)}"></option>`).join('');
        const sel = document.getElementById('filter-tag');
        const cur = sel.value;
        sel.innerHTML = '<option value="">Todas</option>' + tags.map(t => `<option value="${esc(t)}">#${esc(t)}</option>`).join('');
        if (cur && tags.some(t => t === cur)) sel.value = cur;
    }
    function addTagFromInput(input, encKey) {
        const tag = cleanTag(input.value);
        input.value = '';
        if (!tag) return;
        const k = decodeURIComponent(encKey);
        const r = AppState.rows.find(x => x.k === k); if (!r) return;
        if (rowAddTag(r, canonicalTag(tag))) { saveState(); renderAllViews(); }
    }
    function removeTag(encKey, encTag) {
        const k = decodeURIComponent(encKey), tag = decodeURIComponent(encTag);
        const r = AppState.rows.find(x => x.k === k); if (!r) return;
        r.t = (r.t || []).filter(x => x !== tag);
        if (!r.t.length) delete r.t;
        saveState(); renderAllViews();
    }
    async function bulkTagFiltered() {
        const tag = cleanTag(document.getElementById('bulk-tag').value);
        if (!tag) { showToast('Escribe una etiqueta, ej. #ViajeMexico', 'error'); return; }
        const rows = getFilteredRows();
        if (!rows.length) { showToast('No hay movimientos filtrados', 'error'); return; }
        if (rows.length === AppState.rows.length && !(await askConfirm(`Vas a etiquetar TODOS los movimientos (${rows.length}) con #${tag}. ¿Continuar?`))) return;
        const canon = canonicalTag(tag);
        let n = 0;
        rows.forEach(r => { if (rowAddTag(r, canon)) n++; });
        document.getElementById('bulk-tag').value = '';
        saveState(); renderAllViews();
        showToast(`#${canon} aplicada a ${n} movimiento(s)`);
    }
    async function deleteTagEverywhere(encTag) {
        const tag = decodeURIComponent(encTag);
        if (!(await askConfirm(`¿Quitar la etiqueta #${tag} de todos los movimientos? (No se borra ningún movimiento)`))) return;
        AppState.rows.forEach(r => { if (r.t) { r.t = r.t.filter(x => x.toLowerCase() !== tag.toLowerCase()); if (!r.t.length) delete r.t; } });
        saveState(); renderAllViews(); showToast('Etiqueta eliminada');
    }
    function viewTag(encTag) {
        const tag = decodeURIComponent(encTag);
        clearMovFilters();
        document.getElementById('filter-tag').value = tag;
        switchTab('v-movs'); renderMovimientos();
    }
    
    function tagStats() {
        const map = byKeyMap();
        const stats = new Map();
        AppState.rows.forEach(r => {
            (r.t || []).forEach(t => {
                const lk = t.toLowerCase();
                const s = stats.get(lk) || { name: t, n: 0, gasto: 0, ingreso: 0, rec: 0, cat: {}, min: '9999-99-99', max: '0000-00-00' };
                s.n++;
                if (r.d < s.min) s.min = r.d;
                if (r.d > s.max) s.max = r.d;
                if (r.i < 0) {
                    s.gasto += -r.i; s.cat[r.cat] = (s.cat[r.cat] || 0) - r.i;
                    (r.bz || []).forEach(bk => {
                        const b = map.get(bk);
                        if (b && !(b.t || []).some(x => x.toLowerCase() === lk)) s.rec += b.i;
                    });
                } else if (r.lk) s.rec += r.i;
                else s.ingreso += r.i;
                stats.set(lk, s);
            });
        });
        return [...stats.values()].map(s => ({ ...s, neto: s.gasto - s.rec - s.ingreso })).sort((a, b) => b.neto - a.neto);
    }
    
    function renderTags() {
        const cont = document.getElementById('tags-container');
        const stats = tagStats();
        if (!stats.length) {
            cont.innerHTML = `<div class="md:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-400">Aún no hay etiquetas. Ve a Movimientos, escribe una en la columna "Etiquetas" o filtra por fechas y etiqueta en bloque (ej. #ViajeMexico).</div>`;
            return;
        }
        cont.innerHTML = stats.map(s => {
            const cats = Object.entries(s.cat).sort((a, b) => b[1] - a[1]).slice(0, 4);
            const max = cats.length ? cats[0][1] : 1;
            const et = encodeURIComponent(s.name);
            return `
            <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <div class="flex items-start justify-between">
                    <div>
                        <span class="tag-chip text-sm">#${esc(s.name)}</span>
                        <p class="text-[11px] text-slate-400 mt-1">${s.n} movimientos · ${formatDateEs(s.min)} – ${formatDateEs(s.max)}</p>
                    </div>
                    <div class="text-right">
                        <div class="text-[10px] uppercase text-slate-400 font-semibold">Coste neto</div>
                        <div class="text-xl font-bold ${s.neto >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">${formatEur(s.neto)}</div>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-lg py-1.5"><div class="text-slate-400">Gasto bruto</div><div class="font-bold text-rose-600 dark:text-rose-400">${formatEur(s.gasto)}</div></div>
                    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-lg py-1.5"><div class="text-slate-400">Bizums recuperados</div><div class="font-bold text-sky-600 dark:text-sky-400">${formatEur(s.rec)}</div></div>
                    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-lg py-1.5"><div class="text-slate-400">Otros ingresos</div><div class="font-bold text-emerald-600 dark:text-emerald-400">${formatEur(s.ingreso)}</div></div>
                </div>
                <div class="space-y-1.5">
                    ${cats.map(([c, v]) => `
                        <div class="text-[11px]">
                            <div class="flex justify-between"><span>${esc(c)}</span><span class="font-semibold">${formatEur(v)}</span></div>
                            <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5"><div class="bg-indigo-500 h-1.5 rounded-full" style="width:${Math.round(v / max * 100)}%"></div></div>
                        </div>`).join('')}
                </div>
                <div class="flex gap-3 text-xs pt-1">
                    <button onclick="viewTag('${et}')" class="text-brand-600 hover:underline font-semibold">Ver movimientos</button>
                    <button onclick="deleteTagEverywhere('${et}')" class="text-rose-600 hover:underline font-semibold">Eliminar etiqueta</button>
                </div>
            </div>`;
        }).join('');
    }