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
    
    // Un gasto pagado por ti y los Bizums que te devolvieron se muestran
    // juntos, como un único movimiento con el importe neto.
    function groupLinkedRows(rows, map) {
        return rows.filter(r => !(r.lk && map.has(r.lk)));
    }

    function bizumGroup(r, map) {
        if (!(r.bz && r.bz.length)) return null;
        const items = r.bz.map(bk => map.get(bk)).filter(Boolean);
        const sum = items.reduce((a, b) => a + (b.i || 0), 0);
        return { items, sum, net: r.i + sum, people: items.length + 1 };
    }

    function renderMovimientos() {
        const map = byKeyMap();
        const filtered = getFilteredRows();
        // Si un Bizum vinculado cumple el filtro, mostrar su gasto agrupado
        const shown = new Set();
        const grouped = [];
        for (const r of filtered) {
            const row = (r.lk && map.has(r.lk)) ? map.get(r.lk) : r;
            if (shown.has(row.k)) continue;
            shown.add(row.k);
            grouped.push(row);
        }
        const LIMIT = 250;
        document.getElementById('movs-counter').textContent = `Mostrando ${Math.min(grouped.length, LIMIT)} de ${grouped.length} filtrados (${groupLinkedRows(AppState.rows, map).length} en total)`;
        document.getElementById('bulk-tag-btn').textContent = `Aplicar a ${filtered.length}`;
        const tbody = document.getElementById('movs-table-body');
        const cards = document.getElementById('movs-cards');
        const show = grouped.slice(0, LIMIT);
        if (!show.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">No se encontraron movimientos que coincidan con los filtros.</td></tr>`;
            if (cards) cards.innerHTML = `<p class="py-6 text-center text-xs text-slate-400">No se encontraron movimientos que coincidan con los filtros.</p>`;
            return;
        }

        const parts = show.map(r => {
            const ek = enc(r.k);
            const g = bizumGroup(r, map);
            const amount = g ? g.net : r.i;
            const exp = amount < 0;
            const amountCls = exp ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';
            const opts = CATEGORIES.map(c => `<option value="${c}" ${c === r.cat ? 'selected' : ''}>${c}</option>`).join('');
            const select = `<select onchange="updateRowCategory('${ek}', this.value)" aria-label="Categoría" class="max-w-full text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-lg py-1 pl-2 pr-7 focus:ring-2 focus:ring-brand-500 font-medium">${opts}</select>`;
            const chips = (r.t || []).map(t => `<span class="tag-chip">#${esc(t)}<button onclick="removeTag('${ek}','${enc(t)}')" title="Quitar">✕</button></span>`).join('');
            const tagInput = `<input type="text" list="tag-list" placeholder="+ #etiqueta" onchange="addTagFromInput(this,'${ek}')" class="w-24 px-2 py-0.5 text-[11px] rounded-lg bg-slate-100 dark:bg-slate-800 border-none focus:ring-2 focus:ring-brand-500">`;

            let detail = '';
            if (g) {
                detail = `
                <details class="mt-1 text-[11px] text-sky-700 dark:text-sky-300">
                    <summary class="cursor-pointer font-semibold select-none"><i class="fa-solid fa-link mr-1"></i>Entre ${g.people} · pagaste ${formatEur(r.i)} · ${g.items.length} Bizum${g.items.length > 1 ? 's' : ''} +${formatEur(g.sum)}</summary>
                    <ul class="mt-1 space-y-0.5 pl-4 text-slate-500 dark:text-slate-400 font-normal">
                        ${g.items.map(b => `<li class="flex justify-between gap-3"><span class="truncate">${formatDateEs(b.d)} · ${esc(b.c)}</span><span class="font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap">+${formatEur(b.i)}</span></li>`).join('')}
                    </ul>
                    <button onclick="unlinkBizums('${ek}')" class="mt-1 ml-4 text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:underline">Separar Bizums</button>
                </details>`;
            }

            const row = `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors align-top">
                <td class="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">${formatDateEs(r.d)}</td>
                <td class="py-2.5 px-4 font-medium">${esc(r.c)}${detail}</td>
                <td class="py-2.5 px-4">${select}</td>
                <td class="py-2.5 px-4">
                    <div class="flex flex-wrap items-center gap-1 min-w-[140px]">${chips}${tagInput}</div>
                </td>
                <td class="py-2.5 px-4 text-right font-bold font-mono whitespace-nowrap ${amountCls}">${formatEur(amount)}</td>
                <td class="py-2.5 px-4 text-right font-mono text-slate-400 whitespace-nowrap">${formatEur(r.s)}</td>
            </tr>`;

            const card = `
            <div class="px-4 py-3 space-y-1.5">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <p class="text-sm font-semibold leading-snug break-words">${esc(r.c)}</p>
                        <p class="text-[11px] font-mono text-slate-400">${formatDateEs(r.d)}</p>
                    </div>
                    <p class="shrink-0 text-sm font-bold font-mono ${amountCls}">${formatEur(amount)}</p>
                </div>
                ${detail}
                <div class="flex flex-wrap items-center gap-1.5">${select}${chips}${tagInput}</div>
            </div>`;

            return { row, card };
        });

        tbody.innerHTML = parts.map(p => p.row).join('');
        if (cards) cards.innerHTML = parts.map(p => p.card).join('');
    }
    
    
/* =====================================================
   CAMBIAR CATEGORÍA Y GUARDAR EN SUPABASE
   ===================================================== */

async function updateRowCategory(encKey, newCategory) {

    const key = decodeURIComponent(encKey);

    const row = AppState.rows.find(r => r.k === key);

    if (!row) {
        showToast('No se encontró el movimiento', 'error');
        return;
    }

    const accountId = window.activeSupabaseAccountId;

    if (!accountId) {
        showToast('No hay una cuenta seleccionada', 'error');
        renderMovimientos();
        return;
    }

    try {
        // Guardar primero en PostgreSQL
        await updateTransactionCategory(
            accountId,
            key,
            newCategory
        );

        // Actualizar la interfaz solo si Supabase confirma
        row.cat = newCategory;
        row.man = true;

        renderAllViews();

        showToast('Categoría guardada en Supabase');

    } catch (error) {
        console.error(
            'Error actualizando categoría:',
            error
        );

        // Restaurar visualmente la categoría anterior
        renderMovimientos();

        showToast(
            'No se pudo guardar la categoría',
            'error'
        );
    }
}

    
    function clearMovFilters() {
        ['filter-search', 'filter-cat', 'filter-tag', 'filter-month', 'filter-date-from', 'filter-date-to'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('filter-type').value = 'all';
        renderMovimientos();
    }
    function filterUnclassified() { clearMovFilters(); document.getElementById('filter-cat').value = 'Sin clasificar'; renderMovimientos(); }