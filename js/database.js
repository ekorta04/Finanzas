/* =====================================================
   FINANZAS
   BASE DE DATOS SUPABASE
   ===================================================== */

// Obtener las cuentas bancarias del usuario conectado
async function getMyAccounts() {

    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user) {
        throw new Error('Debes iniciar sesión.');
    }

    const { data, error } = await supabaseClient
        .from('accounts')
        .select('id, name, bank_name, currency')
        .order('created_at', { ascending: true });

    if (error) {
        throw error;
    }

    return data || [];
}


/* =====================================================
   CREAR UNA CUENTA BANCARIA DEL USUARIO CONECTADO
   ===================================================== */

async function createMyAccount(name, bankName) {
    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user) {
        throw new Error('Debes iniciar sesión.');
    }

    name = String(name || '').trim();
    bankName = String(bankName || '').trim();

    if (!name) {
        throw new Error('Escribe un nombre para la cuenta.');
    }

    const { data, error } = await supabaseClient
        .from('accounts')
        .insert([{
            user_id: userData.user.id,   // la cuenta queda asociada a tu usuario (RLS)
            name,
            bank_name: bankName || 'Laboral Kutxa',
            currency: 'EUR'
        }])
        .select('id, name, bank_name, currency')
        .single();

    if (error) {
        throw error;
    }

    return data;
}


/* =====================================================
   EXPLICAR LOS ERRORES DE SUPABASE EN CASTELLANO
   ===================================================== */

function describeSupabaseError(error) {
    const msg = String((error && error.message) || error || '');
    const code = String((error && error.code) || '');

    if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
        return 'La base de datos no te da permiso sobre la tabla "accounts" ' +
            '(faltan políticas RLS para tu usuario).';
    }

    if (code === 'PGRST205' || code === '42P01' || /could not find the table|does not exist/i.test(msg)) {
        return 'La tabla "accounts" no existe en Supabase (o tiene otro nombre).';
    }

    if (code === '42703' || code === 'PGRST204' || /column/i.test(msg)) {
        return 'A la tabla "accounts" le falta una columna: ' + msg;
    }

    if (/failed to fetch|network|load failed/i.test(msg)) {
        return 'No hay conexión con Supabase. Revisa tu conexión a internet.';
    }

    if (/jwt|token|session/i.test(msg)) {
        return 'Tu sesión ha caducado. Cierra sesión y vuelve a entrar.';
    }

    return msg || 'Error desconocido.';
}


/* =====================================================
   CONSULTAR MOVIMIENTOS BANCARIOS
   ===================================================== */

   async function getAccountTransactions(accountId) {
    if (!accountId) {
        throw new Error('Debes indicar una cuenta bancaria.');
    }

    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user) {
        throw new Error('Debes iniciar sesión.');
    }

    const { data, error } = await supabaseClient
        .from('transactions')
        .select('*')
        .eq('account_id', accountId)
        .limit(100);

    if (error) {
        throw error;
    }

    return data;
}


/* =====================================================
   IMPORTAR MOVIMIENTOS A SUPABASE
   ===================================================== */

   async function importBankCSV(accountId, fileName, rows, badRows = 0) {

    // Comprobar que hay una sesión activa
    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user) {
        throw new Error('Debes iniciar sesión.');
    }

    // Validar los datos antes de enviarlos
    if (!accountId) {
        throw new Error('No se ha seleccionado una cuenta.');
    }

    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('No hay movimientos para importar.');
    }

    // Preparar los movimientos para PostgreSQL
    const preparedRows = rows.map(r => {
        // Utilizar la clave universal si ya existe.
        // Si no existe, mantener el sistema anterior.
        const key = r.k || (
            r.s !== null &&
            r.s !== undefined &&
            Number.isFinite(Number(r.s))
                ? generateRowKey(r)
                : null
        );

        if (!key) {
            throw new Error(
                'El movimiento no tiene un identificador válido.'
            );
        }

        if (
            !r.d ||
            !r.c ||
            !Number.isFinite(r.i) ||
            (r.s != null && !Number.isFinite(r.s))
        ) {
            throw new Error(
                'Hay movimientos con datos no válidos.'
            );
        }

        return {
            k: key,
            d: r.d,
            v: r.v || r.d,
            c: r.c,
            i: r.i,
            s: r.s ?? null,
            cat: classifyConcept(r.c, AppState.rules),
            man: false
        };
    });


    // Ejecutar la función SQL
    const { data, error } = await supabaseClient.rpc(
        'import_bank_csv',
        {
            p_account_id: accountId,
            p_file_name: fileName,
            p_rows: preparedRows,
            p_error_rows: badRows
        }
    );

    if (error) {
        throw error;
    }

    return data;
}


/* =====================================================
   HISTORIAL DE IMPORTACIONES
   ===================================================== */

   async function getAccountImportHistory(accountId) {
    if (!accountId) {
        throw new Error('Debes seleccionar una cuenta bancaria.');
    }

    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user) {
        throw new Error('Debes iniciar sesión.');
    }

    const { data, error } = await supabaseClient
        .from('imports')
        .select(
            'id, file_name, created_at, total_rows, imported_rows, duplicate_rows, error_rows, status'
        )
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        throw error;
    }

    return data;
}


/* =====================================================
   CARGAR MOVIMIENTOS PARA EL DASHBOARD
   ===================================================== */

// Recuperar todos los movimientos de una cuenta,
// utilizando paginación para evitar límites de consulta.

async function getAllAccountTransactions(accountId) {
    if (!accountId) {
        throw new Error('Debes indicar una cuenta bancaria.');
    }

    const PAGE_SIZE = 500;
    const allTransactions = [];
    let offset = 0;

    while (true) {
        const { data, error } = await supabaseClient
            .from('transactions')
            .select(
                'id, account_id, user_id, source_key, ' +
                'operation_date, value_date, description, ' +
                'amount, balance, category, manual_category'
            )
            .eq('account_id', accountId)
            .order('operation_date', { ascending: false })
            .order('id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
            throw error;
        }

        allTransactions.push(...data);

        if (data.length < PAGE_SIZE) {
            break;
        }

        offset += PAGE_SIZE;
    }

    return allTransactions;
}


// Convertir un movimiento de Supabase al formato
// utilizado por Finanzas KUTXA.

function transactionToAppRow(transaction) {
    return {
        k: transaction.source_key,
        d: transaction.operation_date,
        v: transaction.value_date ||
           transaction.operation_date,
        c: transaction.description,
        i: Number(transaction.amount),
        s: transaction.balance == null
            ? null
            : Number(transaction.balance),
        cat: transaction.category || 'Sin clasificar',
        man: transaction.manual_category || false,
        t: [],
        bz: [],
        lk: ''
    };
}


// Preparar los movimientos de una cuenta para
// utilizarlos posteriormente en el Dashboard.

async function prepareAccountDashboard(accountId) {
    const transactions =
        await getAllAccountTransactions(accountId);

    return transactions.map(transactionToAppRow);
}


/* =====================================================
   DASHBOARD DESDE SUPABASE
   ===================================================== */

// Recordar la cuenta elegida para cada usuario.
// Solo guardamos el ID de la cuenta, nunca datos financieros.

function dashboardAccountKey(userId) {
    return `finanzas_dashboard_account_${userId}`;
}

// Cuenta que se muestra: la última usada, o la primera.
// Si el usuario no tiene ninguna y se pide, se crea una.

async function resolveActiveAccount(userId, createIfMissing = false) {
    const accounts = await getMyAccounts();
    let lastId = null;

    try { lastId = localStorage.getItem(dashboardAccountKey(userId)); } catch (e) {}

    let account =
        accounts.find(a => a.id === window.activeSupabaseAccountId) ||
        accounts.find(a => a.id === lastId) ||
        accounts[0] ||
        null;

    if (!account && createIfMissing) {
        account = await createMyAccount('Cuenta principal', 'Laboral Kutxa');
        accounts.push(account);
    }

    return { accounts, account };
}

// Rellenar el selector de cuenta de "Datos & Sync"

function renderImportAccountSelector(accounts, activeId) {
    const selector = document.getElementById('import-account');

    if (!selector) return;

    if (!accounts.length) {
        selector.replaceChildren(
            new Option('Se creará "Cuenta principal" al importar', '')
        );
        selector.disabled = true;
        return;
    }

    selector.replaceChildren(...accounts.map(a => new Option(
        a.bank_name ? `${a.name} — ${a.bank_name}` : a.name,
        a.id
    )));

    selector.value = activeId || accounts[0].id;
    selector.disabled = accounts.length < 2;
}

// Inicializar la interfaz principal una única vez

function initMainUIOnce() {
    if (window.mainUIInitialized) return;
    window.mainUIInitialized = true;

    populateCategorySelects();
    setupTabNavigation();
    setupDropZone();
    setupInvDropZone();

    const invDate = document.getElementById('inv-val-date');
    if (invDate) invDate.value = new Date().toISOString().slice(0, 10);

    // Cambiar de cuenta desde "Datos & Sync"
    const selector = document.getElementById('import-account');

    if (selector) {
        selector.addEventListener('change', async () => {
            if (!selector.value) return;
            window.activeSupabaseAccountId = selector.value;

            try {
                await loadUserDashboard({ keepTab: true });
            } catch (error) {
                showToast('No se pudo cambiar de cuenta: ' + describeSupabaseError(error), 'error');
            }
        });
    }
}

// Dueño de los datos guardados en el dispositivo, para no mostrar
// los movimientos de otro usuario que usó el mismo navegador.
const CACHE_OWNER_KEY = 'finanzas_cache_owner';

// Mostrar el Dashboard con los datos guardados en el dispositivo.
// Devuelve true si había datos de este usuario que mostrar.
function showCachedDashboard() {
    try {
        const userId = getStoredSessionUserId();

        if (!userId || localStorage.getItem(CACHE_OWNER_KEY) !== userId) return false;

        initMainUIOnce();
        loadState();
        if (!AppState.rows.length) return false;

        renderAllViews();
        switchTab('v-dashboard');
        setCloudStatus('Actualizando…', 'busy');
        return true;
    } catch (e) {
        console.warn('No se pudieron mostrar los datos guardados:', e);
        return false;
    }
}

// Cargar los movimientos del usuario y mostrar el Dashboard.
// Los movimientos vienen de la base de datos; reglas, presupuestos,
// etiquetas, inversión y ajustes se conservan del dispositivo.

async function loadUserDashboard(options = {}) {
    const session = await getStoredSession();

    if (!session) {
        showLoginScreen();
        return;
    }

    const user = session.user;

    initMainUIOnce();
    setCloudUser(user);
    setCloudStatus('Cargando datos…', 'busy');

    // Subir antes cualquier cambio pendiente para no pisarlo
    await cloudFlush();

    // Datos locales (reglas, etiquetas, presupuestos, inversión…)
    loadState();
    const localByKey = new Map(AppState.rows.map(r => [r.k, r]));

    const [{ accounts, account }, cloudData] = await Promise.all([
        resolveActiveAccount(user.id),
        fetchCloudSettings(user.id)
    ]);
    renderImportAccountSelector(accounts, account && account.id);

    let rows = [];

    if (account) {
        window.activeSupabaseAccountId = account.id;

        try { localStorage.setItem(dashboardAccountKey(user.id), account.id); } catch (e) {}

        rows = (await prepareAccountDashboard(account.id)).map(row => {
            const local = localByKey.get(row.k);

            if (local) {
                if (local.t) row.t = local.t;
                if (local.bz) row.bz = local.bz;
                if (local.lk) row.lk = local.lk;
            }

            return row;
        });
    }

    rows.sort((a, b) => b.d.localeCompare(a.d) || (b.s ?? 0) - (a.s ?? 0));
    AppState.rows = rows;

    if (cloudData) {
        // Lo guardado en la nube manda (lo último hecho en cualquier dispositivo)
        applyCloudData(cloudData);
    } else if (cloudData === null) {
        // Primera vez: subir lo que había en este dispositivo
        Cloud.dirty = true;
        await cloudFlush();
    }

    // Guardar en el dispositivo sin volver a subir nada
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState));
        localStorage.setItem(CACHE_OWNER_KEY, user.id);
    } catch (e) {}

    renderAllViews();

    if (!options.keepTab) {
        switchTab('v-dashboard');
    }

    if (Cloud.settingsAvailable === false) {
        setCloudStatus('Movimientos al día. Falta crear la tabla "user_settings" en Supabase para sincronizar reglas, etiquetas y Bizums.', 'err');
    } else {
        setCloudOk();
    }
}


/* =====================================================
   ACTUALIZAR CATEGORÍA DE UN MOVIMIENTO
   ===================================================== */

   async function updateTransactionCategory(accountId, sourceKey, newCategory) {

    const user = await getCurrentUser();

    if (!user) {
        throw new Error('Debes iniciar sesión.');
    }

    if (!accountId || !sourceKey) {
        throw new Error('No se ha identificado el movimiento.');
    }

    if (!CATEGORIES.includes(newCategory)) {
        throw new Error('Categoría no válida.');
    }

    const { data, error } = await supabaseClient
        .from('transactions')
        .update({
            category: newCategory,
            manual_category: true
        })
        .eq('account_id', accountId)
        .eq('source_key', sourceKey)
        .select('id, category, manual_category');

    if (error) {
        throw error;
    }

    if (!data || data.length !== 1) {
        throw new Error(
            'No se pudo confirmar la actualización del movimiento.'
        );
    }

    return data[0];
}


/* =====================================================
   DETECTAR MOVIMIENTOS POTENCIALMENTE REPETIDOS
   ===================================================== */

   async function findPotentialDuplicates(accountId, incomingRows) {
    if (!accountId) {
        throw new Error('Selecciona una cuenta bancaria.');
    }

    if (!Array.isArray(incomingRows)) {
        throw new Error('Movimientos no válidos.');
    }

    // Recuperar movimientos existentes de la cuenta
    const existing = await getAllAccountTransactions(accountId);

    // Identificador de comparación, no de unicidad
    function comparisonKey(row) {
        const date = row.operation_date || row.d;
        const amount = Number(
            row.amount !== undefined ? row.amount : row.i
        );
        const description = row.description || row.c;

        return [
            date,
            amount.toFixed(2),
            norm(description)
        ].join('|');
    }

    const existingCounts = new Map();

    existing.forEach(row => {
        const key = comparisonKey(row);

        existingCounts.set(
            key,
            (existingCounts.get(key) || 0) + 1
        );
    });

    const incomingCounts = new Map();

    const results = incomingRows.map(row => {
        const key = comparisonKey(row);

        const occurrence =
            (incomingCounts.get(key) || 0) + 1;

        incomingCounts.set(key, occurrence);

        const existingCount =
            existingCounts.get(key) || 0;

        return {
            ...row,
            possibleDuplicate: existingCount > 0,
            existingMatches: existingCount,
            incomingOccurrence: occurrence,
            requiresReview: existingCount > 0
        };
    });

    return results;
}


/* =====================================================
   APLICAR UNA REGLA A VARIOS MOVIMIENTOS
   Solo afecta a movimientos no clasificados a mano.
   ===================================================== */

async function updateTransactionsAutoCategory(accountId, sourceKeys, newCategory) {
    if (!accountId || !sourceKeys.length) return;

    if (!CATEGORIES.includes(newCategory)) {
        throw new Error('Categoría no válida.');
    }

    for (let i = 0; i < sourceKeys.length; i += 100) {
        const { error } = await supabaseClient
            .from('transactions')
            .update({ category: newCategory })
            .eq('account_id', accountId)
            .eq('manual_category', false)
            .in('source_key', sourceKeys.slice(i, i + 100));

        if (error) throw error;
    }
}
