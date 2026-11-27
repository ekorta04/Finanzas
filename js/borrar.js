/* ==========================================================================
   BORRAR MOVIMIENTOS E IMPORTACIONES
   · Un movimiento suelto (duplicado o que no hace falta).
   · Una importación entera (borra los movimientos que se guardaron con ella).
   Los movimientos del banco borrados a mano se apuntan en AppState.deleted
   (se sincroniza) para que no vuelvan al importar el mismo archivo otra vez.
   ========================================================================== */

const DELETED_MAX = 3000;

// Quitar movimientos de la memoria y limpiar lo que los apuntaba (Bizums agrupados, gastos en grupo)
function purgeRowsByKeys(keys) {
    const gone = new Set(keys);
    AppState.rows = AppState.rows.filter(r => !gone.has(r.k));
    AppState.rows.forEach(r => {
        if (r.bz) { r.bz = r.bz.filter(k => !gone.has(k)); if (!r.bz.length) delete r.bz; }
        if (r.lk && gone.has(r.lk)) delete r.lk;
    });
    if (Array.isArray(AppState.groups)) AppState.groups = AppState.groups.filter(g => !gone.has(g.exp));
    gone.forEach(k => OpenMovs.delete(k));
}

/* ---------- Un movimiento ---------- */

async function deleteMovement(encKey) {
    const key = decodeURIComponent(encKey);
    const row = AppState.rows.find(r => r.k === key);
    if (!row) return;

    const accountId = window.activeSupabaseAccountId;
    if (!accountId) { showToast('No hay una cuenta seleccionada', 'error'); return; }

    const manual = isManualRow(row);
    const what = manual ? (row.i > 0 ? 'el ingreso' : 'el gasto') : 'el movimiento';
    const ok = await askConfirm(`¿Eliminar ${what} «${row.c}» de ${formatEur(Math.abs(row.i))}?`
        + (manual ? '' : '\nNo volverá a entrar al importar el mismo archivo.'));
    if (!ok) return;

    try {
        const { error } = await supabaseClient
            .from('transactions')
            .delete()
            .eq('account_id', accountId)
            .eq('source_key', key);
        if (error) throw error;

        if (!manual) {
            AppState.deleted = Array.isArray(AppState.deleted) ? AppState.deleted : [];
            if (!AppState.deleted.includes(key)) AppState.deleted.push(key);
            if (AppState.deleted.length > DELETED_MAX) AppState.deleted.splice(0, AppState.deleted.length - DELETED_MAX);
        }
        purgeRowsByKeys([key]);
        dbImports = null;
        saveState();
        renderAllViews();
        showToast(manual ? (row.i > 0 ? 'Ingreso eliminado' : 'Gasto eliminado') : 'Movimiento eliminado');
    } catch (error) {
        console.error('Error eliminando movimiento:', error);
        showToast('No se pudo eliminar: ' + describeSupabaseError(error), 'error');
    }
}

/* ---------- Importaciones ---------- */

let dbImports = null;          // null = sin cargar · false = no se pudo leer · [] = lista de la base de datos
let dbImportsAccount = null;
let dbImportsLoading = false;

async function loadDbImports() {
    const accountId = window.activeSupabaseAccountId;
    if (dbImportsLoading || !accountId) return;
    dbImportsLoading = true;
    dbImportsAccount = accountId;
    try { dbImports = await getAccountImportHistory(accountId); }
    catch (e) { console.warn('No se pudo leer el historial de importaciones:', e); dbImports = false; }
    finally { dbImportsLoading = false; }
    renderImportHistory();
}

function renderImportHistory() {
    const tb = document.getElementById('import-history-body');
    if (!tb) return;

    if (dbImportsAccount !== window.activeSupabaseAccountId) dbImports = null;
    if (dbImports === null) loadDbImports();

    if (Array.isArray(dbImports)) {
        if (!dbImports.length) { tb.innerHTML = '<div class="row"><span class="muted small">Todavía no has importado nada.</span></div>'; return; }
        tb.innerHTML = dbImports.slice(0, 10).map(i => {
            const when = new Date(i.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
            const sub = [i.file_name, `${i.imported_rows} nuevos`, `${i.duplicate_rows} repetidos`].filter(Boolean).join(' · ');
            return `
            <div class="row">
                <div class="row-main"><div class="row-title" style="font-size:15px">${esc(when)}</div><div class="row-sub truncate">${esc(sub)}</div></div>
                <button type="button" class="link small" style="color:var(--red)" onclick="deleteImport('${esc(i.id)}')">Borrar</button>
            </div>`;
        }).join('');
        return;
    }

    // Mientras carga (o si no se puede leer): el resumen guardado en el dispositivo
    if (!AppState.imports.length) { tb.innerHTML = '<div class="row"><span class="muted small">Todavía no has importado nada.</span></div>'; return; }
    tb.innerHTML = AppState.imports.slice(-5).reverse().map(i => `
        <div class="row">
            <div class="row-main"><div class="row-title" style="font-size:15px">${esc(i.at)}</div><div class="row-sub">${i.dup} repetidos omitidos</div></div>
            <span class="bold pos num">+${i.added}</span>
        </div>`).join('');
}

async function deleteImport(id) {
    const accountId = window.activeSupabaseAccountId;
    const imp = Array.isArray(dbImports) && dbImports.find(i => i.id === id);
    if (!accountId || !imp) return;

    try {
        // Movimientos que se guardaron con esa importación
        const ids = [], keys = [];
        for (let from = 0; ; from += 500) {
            const { data, error } = await supabaseClient
                .from('transactions')
                .select('id, source_key')
                .eq('account_id', accountId)
                .eq('import_id', id)
                .order('id', { ascending: true })
                .range(from, from + 499);
            if (error) throw error;
            data.forEach(t => { ids.push(t.id); keys.push(t.source_key); });
            if (data.length < 500) break;
        }

        const when = new Date(imp.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
        const ok = await askConfirm(`¿Borrar la importación del ${when}?\n`
            + (ids.length ? `Se eliminarán los ${ids.length} movimientos que se guardaron con ella, con sus categorías y etiquetas.` : 'No tiene movimientos guardados: solo se quita del historial.'));
        if (!ok) return;

        await deleteTransactionsByIds(accountId, ids);
        const { error } = await supabaseClient.from('imports').delete().eq('id', id).eq('account_id', accountId);
        if (error) throw error;

        purgeRowsByKeys(keys);
        dbImports = null;
        saveState();
        renderAllViews();
        showToast(ids.length ? `Importación borrada (${ids.length} movimientos)` : 'Importación borrada');
    } catch (error) {
        console.error('Error borrando la importación:', error);
        showToast('No se pudo borrar: ' + describeSupabaseError(error), 'error');
        dbImports = null;
        renderImportHistory();
    }
}
