
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

    return data;
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
    const preparedRows = rows.map(r => ({
        k: generateRowKey(r),
        d: r.d,
        v: r.v || r.d,
        c: r.c,
        i: r.i,
        s: r.s,
        cat: classifyConcept(r.c, AppState.rules),
        man: false
    }));

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
