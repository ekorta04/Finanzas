/* ==========================================================================
   GASTO MANUAL (botón «+» flotante)
   Para apuntar a mano gastos que no salen en el banco (efectivo, etc.).
   Se guarda en la tabla "transactions" como cualquier otro movimiento, con
   clave "manual|…" y sin saldo, así que se sincroniza y entra en las copias.
   ========================================================================== */

const MANUAL_LAST_CAT_KEY = 'finanzas_manual_last_cat';
const MANUAL_LAST_INC_KEY = 'finanzas_manual_last_inc_cat';

// ---------- Base de datos ----------

async function insertManualExpense({ amount, name, cat, date, income }) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Debes iniciar sesión.');

    let accountId = window.activeSupabaseAccountId;
    if (!accountId) {
        const { account } = await resolveActiveAccount(user.id, true);
        accountId = window.activeSupabaseAccountId = account.id;
    }

    const key = 'manual|' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

    const { data, error } = await supabaseClient
        .from('transactions')
        .insert([{
            account_id: accountId,
            user_id: user.id,
            source_key: key,
            operation_date: date,
            value_date: date,
            description: name,
            amount: income ? Math.abs(amount) : -Math.abs(amount),
            balance: null,
            category: cat,
            manual_category: true
        }])
        .select('source_key, operation_date, value_date, description, amount, balance, category, manual_category')
        .single();

    if (error) throw error;
    return transactionToAppRow(data);
}

async function deleteManualExpenseRow(key) {
    const accountId = window.activeSupabaseAccountId;
    if (!accountId || !isManualRow({ k: key })) throw new Error('No se puede borrar este movimiento.');

    const { error } = await supabaseClient
        .from('transactions')
        .delete()
        .eq('account_id', accountId)
        .eq('source_key', key);

    if (error) throw error;
}

async function deleteManualExpense(encKey) {
    const key = decodeURIComponent(encKey);
    const row = AppState.rows.find(r => r.k === key);
    if (!row || !isManualRow(row)) return;

    if (!(await askConfirm(`¿Eliminar ${row.i > 0 ? 'el ingreso' : 'el gasto'} «${row.c}» de ${formatEur(Math.abs(row.i))}?`))) return;

    try {
        await deleteManualExpenseRow(key);
        AppState.rows = AppState.rows.filter(r => r.k !== key);
        saveState();
        renderAllViews();
        showToast(row.i > 0 ? 'Ingreso eliminado' : 'Gasto eliminado');
    } catch (error) {
        console.error('Error eliminando gasto manual:', error);
        showToast('No se pudo eliminar el gasto', 'error');
    }
}

// ---------- Formulario ----------

function manualCategoryOptions(selected, income) {
    const exclude = income
        ? ['Sin clasificar', ...CATEGORIES.filter(c => catGroup(c) !== 'Ingreso')]
        : ['Sin clasificar', ...CATEGORIES.filter(c => catGroup(c) === 'Ingreso')];
    const html = catOptionsHtml(exclude)
        + `<optgroup label="Más"><option value="${NEW_CAT_VALUE}">＋ Nueva categoría…</option></optgroup>`;
    return html.replace(`value="${esc(selected)}"`, m => m + ' selected');
}

function openManualExpense() {
    const modal = document.getElementById('manual-modal');
    const amountEl = document.getElementById('manual-amount');
    const nameEl = document.getElementById('manual-name');
    const catEl = document.getElementById('manual-cat');
    const dateEl = document.getElementById('manual-date');
    const errEl = document.getElementById('manual-error');
    const okBtn = document.getElementById('manual-ok');
    const cancelBtn = document.getElementById('manual-cancel');

    const segExp = document.getElementById('manual-seg-exp');
    const segInc = document.getElementById('manual-seg-inc');
    const titleEl = document.getElementById('manual-modal-title');
    let income = false;
    let current = 'Otros';

    const lastCat = () => {
        const def = income ? 'Ingreso › Salario, facturas' : 'Otros';
        let v = def;
        try { v = localStorage.getItem(income ? MANUAL_LAST_INC_KEY : MANUAL_LAST_CAT_KEY) || def; } catch (e) { /* sin almacenamiento */ }
        return CATEGORIES.includes(v) && (catGroup(v) === 'Ingreso') === income ? v : def;
    };
    const setKind = inc => {
        income = inc;
        segExp.classList.toggle('on', !inc);
        segInc.classList.toggle('on', inc);
        titleEl.textContent = inc ? 'Añadir ingreso' : 'Añadir gasto';
        nameEl.placeholder = inc ? 'Ej. Venta, regalo…' : 'Ej. Café en efectivo';
        current = lastCat();
        catEl.innerHTML = manualCategoryOptions(current, income);
    };
    segExp.onclick = () => setKind(false);
    segInc.onclick = () => setKind(true);
    setKind(false);
    amountEl.value = '';
    nameEl.value = '';
    dateEl.value = todayIso();
    dateEl.max = todayIso();
    errEl.textContent = '';
    okBtn.disabled = false;

    const close = () => {
        modal.classList.add('hidden');
        okBtn.onclick = cancelBtn.onclick = catEl.onchange = modal.onkeydown = modal.onclick = segExp.onclick = segInc.onclick = null;
    };

    catEl.onchange = async () => {
        if (catEl.value !== NEW_CAT_VALUE) { current = catEl.value; return; }
        const created = await promptNewCategory();
        if (created) current = created;
        catEl.innerHTML = manualCategoryOptions(current, income);
        amountEl.focus();
    };

    const submit = async () => {
        const amount = Math.abs(parseFlexNum(amountEl.value));
        const name = nameEl.value.trim().replace(/\s+/g, ' ');
        const date = dateEl.value;

        if (!Number.isFinite(amount) || amount <= 0) { errEl.textContent = 'Escribe una cantidad mayor que 0.'; amountEl.focus(); return; }
        if (amount >= 1e9) { errEl.textContent = 'La cantidad es demasiado grande.'; amountEl.focus(); return; }
        if (!name) { errEl.textContent = income ? 'Escribe de qué es el ingreso.' : 'Escribe en qué ha sido el gasto.'; nameEl.focus(); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errEl.textContent = 'Elige una fecha válida.'; return; }
        if (!catEl.value || catEl.value === NEW_CAT_VALUE) { errEl.textContent = 'Elige una categoría.'; return; }

        errEl.textContent = '';
        okBtn.disabled = true;

        try {
            const row = await insertManualExpense({
                amount: Math.round(amount * 100) / 100,
                name,
                cat: catEl.value,
                date,
                income
            });

            AppState.rows.push(row);
            AppState.rows.sort((a, b) => b.d.localeCompare(a.d) || (b.s ?? 0) - (a.s ?? 0));
            saveState();
            try { localStorage.setItem(income ? MANUAL_LAST_INC_KEY : MANUAL_LAST_CAT_KEY, catEl.value); } catch (e) { /* sin almacenamiento */ }

            close();
            renderAllViews();
            showToast(income ? 'Ingreso añadido' : 'Gasto añadido');
        } catch (error) {
            console.error('Error añadiendo gasto manual:', error);
            errEl.textContent = 'No se pudo guardar: ' + describeSupabaseError(error);
            okBtn.disabled = false;
        }
    };

    okBtn.onclick = submit;
    cancelBtn.onclick = close;
    modal.onclick = e => { if (e.target === modal) close(); };
    modal.onkeydown = e => {
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') { e.preventDefault(); submit(); }
    };

    modal.classList.remove('hidden');
    amountEl.focus();
}
