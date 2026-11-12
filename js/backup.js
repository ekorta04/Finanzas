/* ==========================================================================
    14. COPIA DE SEGURIDAD
    La copia contiene TODO lo guardado en la base de datos (cuentas,
    importaciones, movimientos y ajustes sincronizados), en el mismo formato
    que la copia automática semanal. Restaurarla vuelve a escribir esos datos
    en Supabase, así que sirve aunque la base de datos se haya perdido.
    ========================================================================== */
const BACKUP_FORMAT = 'finanzas-backup';
const BACKUP_TABLES = [
    { name: 'accounts', key: 'id' },
    { name: 'imports', key: 'id' },
    { name: 'transactions', key: 'id' },
    { name: 'user_settings', key: 'user_id' }
];

// Leer una tabla entera (por páginas, para no chocar con el límite de filas)
async function backupFetchTable(table, key) {
    const PAGE = 500, out = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabaseClient
            .from(table).select('*').order(key, { ascending: true }).range(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...data);
        if (data.length < PAGE) break;
    }
    return out;
}

async function buildFullBackup() {
    await cloudFlush();   // que la copia incluya el último cambio
    const tables = {};
    for (const t of BACKUP_TABLES) tables[t.name] = await backupFetchTable(t.name, t.key);
    return { format: BACKUP_FORMAT, version: 2, created_at: new Date().toISOString(), source: 'app', tables };
}

function downloadJSON(obj, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function exportBackupJSON() {
    const name = `finanzas_backup_${new Date().toISOString().slice(0, 10)}.json`;
    try {
        const backup = await buildFullBackup();
        downloadJSON(backup, name);
        showToast(`Copia descargada (${backup.tables.transactions.length} movimientos)`);
    } catch (err) {
        // Sin conexión: al menos guardar lo que hay en este dispositivo
        console.warn('Copia completa no disponible, se usa la del dispositivo:', err);
        downloadJSON(AppState, name);
        showToast('Sin conexión: copia hecha con los datos de este dispositivo');
    }
}

// Copias antiguas (solo los datos del dispositivo) → mismo formato que las nuevas
function legacyBackupToTables(json, accountId) {
    const prev = AppState;
    let data, rows;
    try {
        AppState = normalizeState(json);
        data = buildCloudData();
        rows = AppState.rows;
    } finally {
        AppState = prev;
        applyCustomCategories(prev.customCats);
    }
    return {
        accounts: [], imports: [],
        transactions: rows.filter(r => r && r.k && r.d && r.c && Number.isFinite(r.i)).map(r => ({
            account_id: accountId,
            source_key: r.k,
            operation_date: r.d,
            value_date: r.v || r.d,
            description: r.c,
            amount: r.i,
            balance: r.s == null ? null : r.s,
            category: r.cat || 'Sin clasificar',
            manual_category: !!r.man
        })),
        user_settings: [{ data }]
    };
}

async function backupUpsert(table, rows, onConflict) {
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabaseClient.from(table).upsert(rows.slice(i, i + 500), { onConflict });
        if (error) throw error;
    }
}

// Escribir en la base de datos el contenido de una copia.
// No borra nada: lo que haya en la copia se recupera, lo posterior se conserva.
async function restoreBackupTables(tables, userId) {
    const list = k => (Array.isArray(tables[k]) ? tables[k] : []);

    // Una copia automática puede traer filas de otro usuario: quedarse con las propias
    // (o, si la base de datos es nueva, con las del usuario que tenía más movimientos).
    const owners = {};
    ['transactions', 'accounts', 'user_settings'].forEach(k => list(k).forEach(r => {
        if (r.user_id) owners[r.user_id] = (owners[r.user_id] || 0) + 1;
    }));
    const source = owners[userId] ? userId : Object.keys(owners).sort((a, b) => owners[b] - owners[a])[0];
    const mine = k => list(k)
        .filter(r => !r.user_id || !source || r.user_id === source)
        .map(r => Object.assign({}, r, { user_id: userId }));

    const accounts = mine('accounts'), imports = mine('imports'), settings = mine('user_settings');
    const importIds = new Set(imports.map(r => r.id));
    const transactions = mine('transactions').map(r => {
        const row = Object.assign({}, r);
        delete row.id;   // lo genera la base de datos
        if ('import_id' in row && !importIds.has(row.import_id)) row.import_id = null;
        return row;
    });

    if (accounts.length) await backupUpsert('accounts', accounts, 'id');
    if (imports.length) await backupUpsert('imports', imports, 'id');
    if (transactions.length) await backupUpsert('transactions', transactions, 'account_id,source_key');
    if (settings.length && settings[0].data) {
        await backupUpsert('user_settings', [{ user_id: userId, data: settings[0].data, updated_at: new Date().toISOString() }], 'user_id');
    }
    return { transactions: transactions.length };
}

async function importBackupJSON(e) {
    const input = e.target;
    try {
        const file = input.files[0]; if (!file) return;

        let json;
        try { json = JSON.parse(await file.text()); }
        catch (err) { showToast('Archivo JSON de backup no válido', 'error'); return; }

        const isFull = json && json.format === BACKUP_FORMAT && json.tables && Array.isArray(json.tables.transactions);
        const isLegacy = json && Array.isArray(json.rows);
        if (!isFull && !isLegacy) { showToast('Archivo JSON de backup no válido', 'error'); return; }

        const session = await getStoredSession();
        if (!session) { showToast('Inicia sesión para restaurar la copia', 'error'); return; }

        const n = isFull ? json.tables.transactions.length : json.rows.length;
        const when = isFull && json.created_at ? ' del ' + formatDateEs(String(json.created_at).slice(0, 10)) : '';
        if (!(await askConfirm(`¿Restaurar la copia${when}? Se recuperan ${n} movimientos y los ajustes guardados en ella (reglas, etiquetas, Bizums, inversión). Los movimientos añadidos después no se borran.`))) return;

        setCloudStatus('Restaurando copia…', 'busy');

        // Que un guardado pendiente no pise lo que se va a restaurar
        clearTimeout(Cloud.saveTimer); Cloud.saveTimer = null; Cloud.dirty = false;

        let tables = json.tables;
        if (!isFull) {
            const { account } = await resolveActiveAccount(session.user.id, true);
            tables = legacyBackupToTables(json, account.id);
        }

        const done = await restoreBackupTables(tables, session.user.id);
        await loadUserDashboard({ keepTab: true });
        showToast(`Copia restaurada (${done.transactions} movimientos)`);
    } catch (err) {
        console.error('Error restaurando la copia:', err);
        setCloudStatus('No se pudo restaurar la copia: ' + describeSupabaseError(err), 'err');
        showToast('No se pudo restaurar la copia', 'error');
    } finally {
        input.value = '';
    }
}

async function wipeAllData() {
    if (!(await askConfirm('¿Seguro que quieres BORRAR TODOS los datos (movimientos, etiquetas, reglas, inversión)? No se puede deshacer.'))) return;
    AppState = defaultState(); saveState(); renderAllViews(); showToast('Todos los datos han sido borrados');
}
