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
        switchTab('v-movs'); showMovsView('list'); toggleFilters(true); renderMovimientos();
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
                    s.gasto += -r.i; s.cat[catGroup(r.cat)] = (s.cat[catGroup(r.cat)] || 0) - r.i;
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
            cont.innerHTML = `<div class="card center" style="padding:32px 20px">
                <span class="icon-tile round" style="background:var(--indigo);margin:0 auto 10px;width:48px;height:48px"><i class="ic ic-tags"></i></span>
                <div class="bold">Aún no hay etiquetas</div>
                <div class="small muted mt-1">Abre un movimiento y añade una etiqueta, o filtra por fechas y etiqueta en bloque (ej. ViajeMexico).</div>
            </div>`;
            return;
        }
        cont.innerHTML = stats.map(s => {
            const cats = Object.entries(s.cat).sort((a, b) => b[1] - a[1]).slice(0, 4);
            const max = cats.length ? cats[0][1] : 1;
            const et = encodeURIComponent(s.name);
            return `
            <div class="card">
                <div class="flex justify-between gap-3" style="align-items:flex-start">
                    <div class="grow">
                        <span class="tag-chip lg">#${esc(s.name)}</span>
                        <div class="small muted mt-2">${s.n} movimientos · ${shortDate(s.min)} – ${shortDate(s.max)}</div>
                    </div>
                    <div class="right">
                        <div class="xsmall muted bold" style="text-transform:uppercase">Coste real</div>
                        <div class="num" style="font-size:24px;font-weight:700;letter-spacing:-.03em">${formatEur(s.neto)}</div>
                    </div>
                </div>
                <div class="group mt-3" style="background:var(--fill-2);box-shadow:none">
                    <div class="row" style="min-height:36px;padding:7px 12px"><span class="row-main small">Gastado</span><span class="small bold num">${formatEur(s.gasto)}</span></div>
                    <div class="row" style="min-height:36px;padding:7px 12px;--sep-left:12px"><span class="row-main small">Bizums recuperados</span><span class="small bold num ${s.rec > 0 ? 'pos' : 'muted'}">${s.rec > 0 ? '−' : ''}${formatEur(s.rec)}</span></div>
                    <div class="row" style="min-height:36px;padding:7px 12px;--sep-left:12px"><span class="row-main small">Otros ingresos</span><span class="small bold num ${s.ingreso > 0 ? 'pos' : 'muted'}">${s.ingreso > 0 ? '−' : ''}${formatEur(s.ingreso)}</span></div>
                </div>
                ${cats.length ? `<div class="mt-3 stack-sm">${cats.map(([c, v]) => `
                    <div>
                        <div class="flex justify-between small"><span class="flex items-center gap-2"><span class="legend-dot" style="background:var(${catStyle(c)[1]})"></span>${esc(c)}</span><span class="bold num">${formatEur(v)}</span></div>
                        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, Math.round(v / max * 100))}%;background:var(${catStyle(c)[1]})"></div></div>
                    </div>`).join('')}</div>` : ''}
                <div class="flex justify-between mt-3">
                    <button onclick="viewTag('${et}')" class="btn sm tinted">Ver movimientos</button>
                    <button onclick="deleteTagEverywhere('${et}')" class="btn sm plain" style="color:var(--red)">Eliminar</button>
                </div>
            </div>`;
        }).join('');
    }