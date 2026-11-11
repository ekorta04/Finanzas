/* ==========================================================================
    9. MOVIMIENTOS
    ========================================================================== */
    // Reglas que el Resumen aplica al contar (no hay un desplegable para ellas): se muestran como chip y se quitan con su ✕
    const MovsExtra = { noInv: false };

    // Desde el Resumen: abre Movimientos con tipo, categoría y periodo ya aplicados
    function drillToMovs({ type, cat }) {
        const p = dashPeriod(document.getElementById('dash-month').value);
        movsLimit = 150;
        ['filter-search', 'filter-tag', 'filter-month'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('filter-type').value = type || 'all';
        const sel = document.getElementById('filter-cat');
        sel.value = '';
        if (cat) {
            if (![...sel.options].some(o => o.value === cat)) sel.add(new Option(cat, cat));
            sel.value = cat;
        }
        document.getElementById('filter-date-from').value = p.from || '';
        document.getElementById('filter-date-to').value = p.to || '';
        MovsExtra.noInv = true;
        switchTab('v-movs');
        showMovsView('list');
        toggleFilters(false);
        renderMovimientos();
    }
    function drillFromEl(el) { drillToMovs({ type: 'expense', cat: el.dataset.cat }); }

    function removeMovFilter(key) {
        movsLimit = 150;
        const clear = id => { document.getElementById(id).value = ''; };
        if (key === 'type') document.getElementById('filter-type').value = 'all';
        else if (key === 'cat') clear('filter-cat');
        else if (key === 'tag') clear('filter-tag');
        else if (key === 'month') clear('filter-month');
        else if (key === 'dates') { clear('filter-date-from'); clear('filter-date-to'); }
        else if (key === 'inv') MovsExtra.noInv = false;
        renderMovimientos();
    }

    function getFilteredRows() {
        const search = norm(document.getElementById('filter-search').value);
        const cat = document.getElementById('filter-cat').value;
        const tag = document.getElementById('filter-tag').value;
        const type = document.getElementById('filter-type').value;
        const month = document.getElementById('filter-month').value;
        const from = document.getElementById('filter-date-from').value;
        const to = document.getElementById('filter-date-to').value;
        const map = MovsExtra.noInv && type === 'income' ? byKeyMap() : null;
        return AppState.rows.filter(r => {
            if (MovsExtra.noInv && isInvCat(r.cat)) return false;
            if (map && r.lk && map.has(r.lk)) return false;   // un Bizum devuelto no es un ingreso: resta del gasto
            if (search && !norm(r.c).includes(search)) return false;
            if (cat && r.cat !== cat && !(CAT_TREE.some(m => m.n === cat) && catGroup(r.cat) === cat)) return false;
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

    // Movimientos desplegados y cuántos se muestran (se conservan al repintar)
    const OpenMovs = new Set();
    let movsLimit = 150;

    function activeFilterCount() {
        let n = 0;
        ['filter-cat', 'filter-tag', 'filter-month', 'filter-date-from', 'filter-date-to'].forEach(id => { if (document.getElementById(id).value) n++; });
        if (document.getElementById('filter-type').value !== 'all') n++;
        if (MovsExtra.noInv) n++;
        return n;
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

        const nf = activeFilterCount();
        document.getElementById('filters-count').textContent = nf ? `Filtros · ${nf}` : 'Filtros';
        document.getElementById('filters-btn').classList.toggle('tinted', nf > 0);
        document.getElementById('filters-btn').classList.toggle('gray', nf === 0);

        // Chips con los filtros activos, para verlos de un vistazo
        const g = id => document.getElementById(id).value;
        const chips = [];
        if (g('filter-type') !== 'all') chips.push(['type', g('filter-type') === 'expense' ? 'Gastos' : 'Ingresos']);
        if (g('filter-cat')) chips.push(['cat', g('filter-cat')]);
        if (g('filter-tag')) chips.push(['tag', '#' + g('filter-tag')]);
        if (g('filter-month')) chips.push(['month', monthName(g('filter-month'))]);
        if (g('filter-date-from') || g('filter-date-to')) {
            const f = g('filter-date-from'), t = g('filter-date-to');
            chips.push(['dates', f && t ? `${formatDateEs(f)} – ${formatDateEs(t)}` : f ? `Desde ${formatDateEs(f)}` : `Hasta ${formatDateEs(t)}`]);
        }
        if (MovsExtra.noInv) chips.push(['inv', 'Sin inversión']);
        const chipBar = document.getElementById('movs-chips');
        chipBar.classList.toggle('hidden', !chips.length);
        chipBar.innerHTML = chips.map(([k, label]) =>
            `<span class="tag-chip lg">${esc(label)}<button type="button" onclick="removeMovFilter('${k}')" aria-label="Quitar filtro ${esc(label)}">✕</button></span>`).join('');

        const total = groupLinkedRows(AppState.rows, map).length;
        let counter = grouped.length === total ? `${total} movimientos` : `${grouped.length} de ${total} movimientos`;
        if (nf) {   // suma de lo mostrado (con los Bizums ya restados): permite cotejarla con el Resumen
            const sum = grouped.reduce((a, r) => { const bg = bizumGroup(r, map); return a + (bg ? bg.net : r.i); }, 0);
            counter += ` · Total ${sum < -0.004 ? '−' : sum > 0.004 ? '+' : ''}${formatEur(Math.abs(sum))}`;
        }
        document.getElementById('movs-counter').textContent = counter;
        document.getElementById('bulk-tag-btn').textContent = `Aplicar a ${filtered.length}`;

        const cont = document.getElementById('movs-cards');
        if (!grouped.length) {
            cont.innerHTML = `<div class="card center muted" style="padding:32px 16px">No hay movimientos con estos filtros.</div>`;
            return;
        }

        const show = grouped.slice(0, movsLimit);
        const opts = catOptionsHtml() +
            `<option value="${NEW_CAT_VALUE}">＋ Nueva categoría…</option>`;

        // Agrupar por mes, como en Wallet
        const months = [];
        show.forEach(r => {
            const m = r.d.slice(0, 7);
            const last = months[months.length - 1];
            if (last && last.m === m) last.rows.push(r); else months.push({ m, rows: [r] });
        });

        const rowHtml = r => {
            const ek = enc(r.k);
            const g = bizumGroup(r, map);
            const amount = g ? g.net : r.i;
            const sign = amount > 0 ? '+' : '';
            const cls = amount > 0 ? 'pos' : 'neg';
            const chips = (r.t || []).map(t => `<span class="tag-chip">#${esc(t)}<button onclick="removeTag('${ek}','${enc(t)}')" aria-label="Quitar etiqueta">✕</button></span>`).join('');
            const sub = [r.cat, shortDate(r.d)];
            if (g) sub.push(`entre ${g.people}`);
            if (r.t && r.t.length) sub.push(r.t.map(t => '#' + t).join(' '));

            const split = g ? `
                <div class="split">
                    <div class="flex justify-between bold"><span>Pagaste</span><span class="num">${formatEur(-r.i)}</span></div>
                    <ul style="margin:4px 0 0;padding:0;list-style:none">
                        ${g.items.map(b => `<li><span class="truncate muted">${shortDate(b.d)} · ${esc(b.c)}</span><span class="num pos">+${formatEur(b.i)}</span></li>`).join('')}
                    </ul>
                    <div class="flex justify-between bold mt-1"><span>Tu parte</span><span class="num">${formatEur(g.net)}</span></div>
                    <button class="link small mt-1" onclick="unlinkBizums('${ek}')">Separar Bizums</button>
                </div>` : '';

            return `
            <details class="mov" data-k="${ek}" ${OpenMovs.has(r.k) ? 'open' : ''}>
                <summary class="row with-icon">
                    ${catIcon(r.cat)}
                    <span class="row-main">
                        <span class="row-title" style="display:block;white-space:nowrap">${esc(r.c)}</span>
                        <span class="row-sub" style="display:block;white-space:nowrap">${esc(sub.join(' · '))}</span>
                    </span>
                    <span class="mov-amount num ${cls}">${sign}${formatEur(amount)}${g ? `<small>de ${formatEur(-r.i)}</small>` : ''}</span>
                    <i class="ic ic-chevron-right row-chevron"></i>
                </summary>
                <div class="mov-edit">
                    ${split}
                    ${r.i < 0 && !isBizum(r) && !isInvCat(r.cat) ? `<button class="link small" style="margin:2px 0 8px" onclick="openBizumPicker('${ek}')">${g ? 'Editar Bizums del grupo' : 'Agrupar Bizums a mano…'}</button>` : ''}
                    <label>Categoría
                        <select class="field" onchange="updateRowCategory('${ek}', this.value)">${opts.replace(`value="${esc(r.cat)}"`, m => m + ' selected')}</select>
                    </label>
                    <div class="tags">
                        ${chips}
                        <input type="text" list="tag-list" placeholder="+ Añadir etiqueta" onchange="addTagFromInput(this,'${ek}')" class="field sm" style="width:160px">
                    </div>
                    <div class="xsmall muted num">Fecha ${formatDateEs(r.d)}${r.s != null ? ` · Saldo ${formatEur(r.s)}` : ''}</div>
                </div>
            </details>`;
        };

        const monthTotal = rows => rows.reduce((a, r) => { const g = bizumGroup(r, map); const v = g ? g.net : r.i; return v < 0 && !isInvCat(r.cat) ? a - v : a; }, 0);

        cont.innerHTML = months.map(({ m, rows }) => `
            <div class="mt-3">
                <h3 class="group-header flex justify-between"><span>${monthName(m)}</span><span class="num">Gastos ${formatEur(monthTotal(rows))}</span></h3>
                <div class="group">${rows.map(rowHtml).join('')}</div>
            </div>`).join('') +
            (grouped.length > movsLimit
                ? `<div class="center mt-3"><button class="btn sm gray" onclick="movsLimit += 300; renderMovimientos()">Mostrar más (${grouped.length - movsLimit})</button></div>`
                : '');

        cont.querySelectorAll('details.mov').forEach(d => d.addEventListener('toggle', () => {
            const k = decodeURIComponent(d.dataset.k);
            if (d.open) OpenMovs.add(k); else OpenMovs.delete(k);
        }));
    }
    
    
/* =====================================================
   CAMBIAR CATEGORÍA Y GUARDAR EN SUPABASE
   ===================================================== */

const NEW_CAT_VALUE = '__nueva__';

async function updateRowCategory(encKey, newCategory) {

    // Opción "Nueva categoría…": se crea primero y luego se asigna al movimiento
    if (newCategory === NEW_CAT_VALUE) {
        const created = await promptNewCategory();
        if (!created) {
            renderMovimientos();   // devolver el selector a la categoría anterior
            return;
        }
        newCategory = created;
    }

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

        showToast('Categoría guardada');

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
        return;
    }

    // Sugerir guardarlo como regla para el futuro
    await suggestRuleFor(row, newCategory, accountId);
}

/* =====================================================
   CREAR CATEGORÍAS PROPIAS
   Se guardan en AppState.customCats y se sincronizan
   entre dispositivos junto al resto de ajustes.
   ===================================================== */

function promptNewCategory() {
    return new Promise(resolve => {
        const modal = document.getElementById('cat-modal');
        const nameEl = document.getElementById('cat-new-name');
        const errEl = document.getElementById('cat-new-error');
        const iconsEl = document.getElementById('cat-new-icons');
        const colorsEl = document.getElementById('cat-new-colors');
        const previewEl = document.getElementById('cat-new-preview');
        const okBtn = document.getElementById('cat-new-ok');
        const cancelBtn = document.getElementById('cat-new-cancel');

        let icon = CAT_ICONS[0];
        let color = CAT_COLORS[0];

        const paint = () => {
            iconsEl.innerHTML = CAT_ICONS.map(i =>
                `<button type="button" data-v="${i}" class="${i === icon ? 'on' : ''}" aria-label="Icono ${i}"><i class="ic ic-${i}"></i></button>`
            ).join('');
            colorsEl.innerHTML = CAT_COLORS.map(c =>
                `<button type="button" data-v="${c}" class="${c === color ? 'on' : ''}" style="background:var(${c})" aria-label="Color ${c.slice(2)}"></button>`
            ).join('');
            previewEl.innerHTML =
                `<span class="icon-tile round" style="background:var(${color})"><i class="ic ic-${icon}"></i></span>`;
        };

        const done = value => {
            modal.classList.add('hidden');
            okBtn.onclick = cancelBtn.onclick = iconsEl.onclick = colorsEl.onclick = nameEl.onkeydown = null;
            resolve(value);
        };

        const submit = () => {
            const name = nameEl.value.trim().replace(/\s+/g, ' ');

            if (!name) { errEl.textContent = 'Escribe un nombre.'; return; }
            if (/[<>"'&]/.test(name)) { errEl.textContent = 'Evita los caracteres < > " \' &.'; return; }
            if (CATEGORIES.some(c => norm(c) === norm(name))) {
                errEl.textContent = 'Esa categoría ya existe.';
                return;
            }

            AppState.customCats.push({ n: name, ic: icon, col: color });
            applyCustomCategories(AppState.customCats);
            saveState();
            populateCategorySelects();
            done(name);
        };

        iconsEl.onclick = e => {
            const b = e.target.closest('button[data-v]');
            if (b) { icon = b.dataset.v; paint(); }
        };
        colorsEl.onclick = e => {
            const b = e.target.closest('button[data-v]');
            if (b) { color = b.dataset.v; paint(); }
        };
        okBtn.onclick = submit;
        cancelBtn.onclick = () => done(null);
        nameEl.onkeydown = e => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') done(null);
        };

        nameEl.value = '';
        errEl.textContent = '';
        paint();
        modal.classList.remove('hidden');
        nameEl.focus();
    });
}


async function suggestRuleFor(row, newCategory, accountId) {
    const cn = norm(row.c);
    const generic = /^(SIN CONCEPTO|ENVIO DE DINERO CON BIZUM|BIZUM)/.test(cn);

    if (generic || newCategory === 'Sin clasificar' ||
        AppState.rules.some(x => norm(x.p) === cn)) {
        return;
    }

    const same = AppState.rows.filter(x =>
        norm(x.c) === cn && x.k !== row.k && !x.man
    );

    const msg = `¿Recordar "${row.c}" → ${newCategory} para siempre?` +
        (same.length > 0
            ? `\nSe aplicará automáticamente a otros ${same.length} movimientos iguales.`
            : '');

    if (!(await askConfirm(msg))) return;

    AppState.rules.unshift({ p: row.c, c: newCategory });
    same.forEach(x => { x.cat = newCategory; });
    saveState();
    renderAllViews();

    try {
        if (same.length) {
            await updateTransactionsAutoCategory(
                accountId,
                same.map(x => x.k),
                newCategory
            );
        }
        showToast('Regla guardada y movimientos actualizados');
    } catch (error) {
        console.error('Error aplicando la regla en Supabase:', error);
        showToast('Regla guardada, pero no se pudieron actualizar todos los movimientos en la base de datos', 'error');
    }
}


    function clearMovFilters() {
        movsLimit = 150;
        ['filter-search', 'filter-cat', 'filter-tag', 'filter-month', 'filter-date-from', 'filter-date-to'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('filter-type').value = 'all';
        MovsExtra.noInv = false;
        renderMovimientos();
    }
    function filterUnclassified() { showMovsView('list'); clearMovFilters(); document.getElementById('filter-cat').value = 'Sin clasificar'; renderMovimientos(); }