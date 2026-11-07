/* =====================================================
   FINANZAS KUTXA
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
   CARGAR CUENTAS EN EL SELECTOR DE IMPORTACIÓN
   ===================================================== */

   async function loadImportAccounts() {
    const selector = document.getElementById('import-account');

    if (!selector) {
        throw new Error('No existe el selector de cuentas.');
    }

    selector.disabled = true;
    selector.replaceChildren(
        new Option('Cargando cuentas...', '')
    );

    try {
        // Obtener las cuentas del usuario autenticado
        const accounts = await getMyAccounts();

        // Limpiar el selector
        selector.replaceChildren(
            new Option('Selecciona una cuenta bancaria', '')
        );

        // Añadir las cuentas obtenidas de Supabase
        accounts.forEach(account => {
            const option = new Option(
                `${account.name} — ${account.bank_name}`,
                account.id
            );

            selector.add(option);
        });

        if (accounts.length === 0) {
            selector.replaceChildren(
                new Option('No tienes cuentas bancarias', '')
            );
        }

        selector.disabled = accounts.length === 0;

        return accounts;

    } catch (error) {
        selector.replaceChildren(
            new Option('Error al cargar las cuentas', '')
        );

        console.error('Error cargando cuentas:', error);
        throw error;
    }
}


/* =====================================================
   IMPORTADOR CSV - INTERFAZ SUPABASE
   ===================================================== */

   function setupSupabaseCSVImport() {
    const selector = document.getElementById(
        'supabase-import-account'
    );

    const fileInput = document.getElementById(
        'supabase-import-file'
    );

    const button = document.getElementById(
        'supabase-import-button'
    );

    const message = document.getElementById(
        'supabase-import-message'
    );

    if (!selector || !fileInput || !button || !message) {
        console.error('Faltan elementos del importador.');
        return;
    }

    let importing = false;

    // Activar el botón solamente cuando haya cuenta y archivo
    function updateButton() {
        button.disabled =
            importing ||
            !selector.value ||
            fileInput.files.length === 0;
    }

    selector.addEventListener('change', updateButton);
    fileInput.addEventListener('change', updateButton);

    button.addEventListener('click', async () => {
        if (importing || !selector.value || !fileInput.files.length) {
            return;
        }

        const accountId = selector.value;
        const file = fileInput.files[0];

        importing = true;
        button.disabled = true;
        button.textContent = 'Importando movimientos...';

        message.classList.add('hidden');

        try {
            const { parsedRows, badRows } =
                parseLaboralKutxaCSV(await file.text());

            if (!parsedRows.length) {
                throw new Error(
                    'El CSV no contiene movimientos válidos.'
                );
            }

            // Guardar en PostgreSQL mediante la función RPC
            const result = await importBankCSV(
                accountId,
                file.name,
                parsedRows,
                badRows
            );

            message.textContent =
                `Importación completada: ` +
                `${result.imported_rows} nuevos, ` +
                `${result.duplicate_rows} duplicados, ` +
                `${result.error_rows} filas con errores.`;

            message.className =
                'text-sm text-green-700 dark:text-green-400';

            // Limpiar el archivo para evitar importaciones accidentales
            fileInput.value = '';
        
            // Limpiar el archivo para evitar importaciones accidentales
            fileInput.value = '';

            // Abrir automáticamente el Dashboard con los datos
            // de la cuenta bancaria seleccionada.
            await previewSupabaseDashboard(accountId);

            const usuarioImportacion = await getCurrentUser();

            if (usuarioImportacion) {
                localStorage.setItem(
                    dashboardAccountKey(usuarioImportacion.id),
                    accountId
                );
            }


        } catch (error) {
            console.error('Error importando CSV:', error);

            message.textContent =
                'Error al importar: ' + error.message;

            message.className =
                'text-sm text-red-600 dark:text-red-400';

        } finally {
            importing = false;
            button.textContent = 'Importar movimientos';
            updateButton();
        }
    });

    updateButton();
}

document.addEventListener('DOMContentLoaded', () => {
    setupSupabaseCSVImport();
});


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
   VISTA PRELIMINAR DEL DASHBOARD DESDE SUPABASE
   Solo lectura durante la migración
   ===================================================== */

   async function previewSupabaseDashboard(accountId) {
    const user = await getCurrentUser();

    if (!user) {
        throw new Error('Debes iniciar sesión.');
    }

    const accounts = await getMyAccounts();
    const account = accounts.find(a => a.id === accountId);

    if (!account) {
        throw new Error('Cuenta bancaria no autorizada.');
    }

    const rows = await prepareAccountDashboard(accountId);

    // Recordar qué cuenta estamos visualizando
    window.activeSupabaseAccountId = accountId;

    // La vista preliminar no utiliza el almacenamiento antiguo.
    AppState = normalizeState({
        rows,
        rules: DEFAULT_RULES.slice(),
        imports: [],
        inv: [],
        invValues: [],
        budgets: {},
        dismissed: []
    });

    // Mostrar la interfaz principal
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('supabase-import-screen').classList.add('hidden');
    document.getElementById('app-root').classList.remove('hidden');

    // Inicializar la navegación una única vez
    if (!window.supabasePreviewInitialized) {
        populateCategorySelects();
        setupTabNavigation();
        window.supabasePreviewInitialized = true;
    }

    renderAllViews();
    switchTab('v-dashboard');

    console.log(
        'Dashboard de prueba cargado:',
        rows.length,
        'movimientos'
    );
}


/* =====================================================
   ACCESO AL DASHBOARD DESDE SUPABASE
   ===================================================== */

// Recordar la cuenta elegida para cada usuario.
// Solo guardamos el ID de la cuenta, nunca datos financieros.

function dashboardAccountKey(userId) {
    return `finanzas_dashboard_account_${userId}`;
}


// Abrir el Dashboard sin importar un CSV.

async function openSelectedDashboard() {
    const selector = document.getElementById(
        'supabase-import-account'
    );

    const button = document.getElementById(
        'open-dashboard-button'
    );

    if (!selector.value) {
        alert('Selecciona primero una cuenta bancaria.');
        return;
    }

    button.disabled = true;
    button.textContent = 'Cargando Dashboard...';

    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new Error('Debes iniciar sesión.');
        }

        const accountId = selector.value;

        await previewSupabaseDashboard(accountId);

        // Recordar la cuenta para próximos accesos
        localStorage.setItem(
            dashboardAccountKey(user.id),
            accountId
        );

    } catch (error) {
        console.error(error);
        alert('No se pudo cargar el Dashboard: ' + error.message);

    } finally {
        button.disabled = false;
        button.textContent = 'Abrir Dashboard';
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
