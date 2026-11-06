/* ==========================================================================
    9. MOVIMIENTOS
    ========================================================================== */
    function getFilteredRows() {
        const search = norm(document.getElementById('filter-search').value);
        const cat = document.getElementById('filter-cat').value;
        const tag = document.getElementById('filter-tag').value;
        const type = document.getElementById('filter-type').value;
        const month = document.getElementById('filter-month').value;
        const from = document.getElementById('filter-date-from').value;
        const to = document.getElementById('filter-date-to').value;
        return AppState.rows.filter(r => {
            if (search && !norm(r.c).includes(search)) return false;
            if (cat && r.cat !== cat) return false;
            if (tag && !(r.t || []).some(x => x.toLowerCase() === tag.toLowerCase())) return false;
            if (type === 'expense' && r.i >= 0) return false;
            if (type === 'income' && r.i <= 0) return false;
            if (month && !r.d.startsWith(month)) return false;
            if (from && r.d < from) return false;
            if (to && r.d > to) return false;
            return true;
        });
    }
    
    function renderMovimientos() {
        const filtered = getFilteredRows();
        document.getElementById('movs-counter').textContent = `Mostrando ${Math.min(filtered.length, 250)} de ${filtered.length} filtrados (${AppState.rows.length} en total)`;
        document.getElementById('bulk-tag-btn').textContent = `Aplicar a ${filtered.length}`;
        const tbody = document.getElementById('movs-table-body');
        const show = filtered.slice(0, 250);
        if (!show.length) { tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">No se encontraron movimientos que coincidan con los filtros.</td></tr>`; return; }
        const map = byKeyMap();
    
        tbody.innerHTML = show.map(r => {
            const ek = enc(r.k);
            const exp = r.i < 0;
            const opts = CATEGORIES.map(c => `<option value="${c}" ${c === r.cat ? 'selected' : ''}>${c}</option>`).join('');
            let badge = '';
            if (r.bz && r.bz.length) {
                const sum = r.bz.reduce((a, bk) => a + ((map.get(bk) || {}).i || 0), 0);
                badge = `<div class="mt-0.5"><button onclick="unlinkBizums('${ek}')" title="Desvincular" class="text-[10px] font-semibold text-sky-600 dark:text-sky-400 hover:underline"><i class="fa-solid fa-link mr-1"></i>${r.bz.length} Bizums (+${formatEur(sum)}) · neto ${formatEur(r.i + sum)} ✕</button></div>`;
            } else if (r.lk) {
                const e = map.get(r.lk);
                badge = `<div class="mt-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400"><i class="fa-solid fa-link mr-1"></i>Vinculado a ${esc(e ? e.c : 'gasto')}</div>`;
            }
            const chips = (r.t || []).map(t => `<span class="tag-chip">#${esc(t)}<button onclick="removeTag('${ek}','${enc(t)}')" title="Quitar">✕</button></span>`).join('');
            return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors align-top">
                <td class="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">${formatDateEs(r.d)}</td>
                <td class="py-2.5 px-4 font-medium">${esc(r.c)}${badge}</td>
                <td class="py-2.5 px-4">
                    <select onchange="updateRowCategory('${ek}', this.value)" class="text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-lg py-1 px-2 focus:ring-2 focus:ring-brand-500 font-medium">${opts}</select>
                </td>
                <td class="py-2.5 px-4">
                    <div class="flex flex-wrap items-center gap-1 min-w-[140px]">${chips}
                        <input type="text" list="tag-list" placeholder="+ #etiqueta" onchange="addTagFromInput(this,'${ek}')" class="w-24 px-2 py-0.5 text-[11px] rounded-lg bg-slate-100 dark:bg-slate-800 border-none focus:ring-2 focus:ring-brand-500">
                    </div>
                </td>
                <td class="py-2.5 px-4 text-right font-bold font-mono whitespace-nowrap ${exp ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">${formatEur(r.i)}</td>
                <td class="py-2.5 px-4 text-right font-mono text-slate-400 hidden sm:table-cell whitespace-nowrap">${formatEur(r.s)}</td>
            </tr>`;
        }).join('');
    }
    
    async function updateRowCategory(encKey, newCategory) {
        const key = decodeURIComponent(encKey);
        const row = AppState.rows.find(r => r.k === key); if (!row) return;
        row.cat = newCategory; row.man = true;
    
        const cn = norm(row.c);
        const generic = /^(SIN CONCEPTO|ENVIO DE DINERO CON BIZUM|BIZUM)/.test(cn);
        if (!generic && newCategory !== 'Sin clasificar' && !AppState.rules.some(x => norm(x.p) === cn)) {
            const same = AppState.rows.filter(x => norm(x.c) === cn && x.k !== key && !x.man).length;
            const msg = `¿Recordar "${row.c}" -> ${newCategory} para siempre?` + (same > 0 ? `\nSe aplicará automáticamente a otros ${same} movimientos iguales.` : '');
            saveState(); renderAllViews();
            if (await askConfirm(msg)) {
                AppState.rules.unshift({ p: row.c, c: newCategory });
                AppState.rows.forEach(x => { if (!x.man && norm(x.c) === cn) x.cat = newCategory; });
                showToast('Regla guardada y movimientos actualizados');
            }
        }
        saveState(); renderAllViews();
    }
    
    function clearMovFilters() {
        ['filter-search', 'filter-cat', 'filter-tag', 'filter-month', 'filter-date-from', 'filter-date-to'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('filter-type').value = 'all';
        renderMovimientos();
    }
    function filterUnclassified() { clearMovFilters(); document.getElementById('filter-cat').value = 'Sin clasificar'; renderMovimientos(); }