/* =====================================================
   FINANZAS KUTXA
   AUTENTICACIÓN CON SUPABASE
   ===================================================== */

// Registrar usuario
async function signUp(email, password) {
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
    });

    if (error) throw error;
    return data;
}

// Iniciar sesión
async function signIn(email, password) {
    const { data, error } =
        await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

    if (error) throw error;
    return data;
}

// Cerrar sesión
async function signOut() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) throw error;
}

// Obtener usuario autenticado
async function getCurrentUser() {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error) return null;
    return data.user;
}

// Mostrar exclusivamente la pantalla de login
function showLoginScreen() {
    document.getElementById('app-root').classList.add('hidden');

    document.getElementById('supabase-import-screen')
        .classList.add('hidden');

    document.getElementById('auth-screen')
        .classList.remove('hidden');
}

// Mostrar la pantalla de importación
async function showSupabaseImportScreen() {
    const user = await getCurrentUser();

    if (!user) {
        showLoginScreen();
        return;
    }

    const selector =
        document.getElementById('supabase-import-account');

    const importButton =
        document.getElementById('supabase-import-button');

    // Mantener el Dashboard antiguo bloqueado
    document.getElementById('app-root').classList.add('hidden');

    // Ocultar login y mostrar importador
    document.getElementById('auth-screen').classList.add('hidden');

    document.getElementById('supabase-import-screen')
        .classList.remove('hidden');

    // Todavía no permitimos importar archivos
    importButton.disabled = true;

    setupAccountSelectorOnce();
    await reloadAccountSelector(user);
}


// Rellena el desplegable de cuentas y explica qué pasa si no se puede
async function reloadAccountSelector(user, selectId) {
    const selector = document.getElementById('supabase-import-account');
    const errorBox = document.getElementById('account-load-error');
    const createBox = document.getElementById('account-create-box');

    selector.disabled = true;
    selector.replaceChildren(new Option('Cargando cuentas...', ''));
    errorBox.classList.add('hidden');
    createBox.classList.add('hidden');
    updateOpenDashboardButton();

    try {
        const accounts = await getMyAccounts();

        // Verificar que la sesión no ha cambiado
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.id !== user.id) {
            showLoginScreen();
            return;
        }

        if (accounts.length === 0) {
            // Antes el desplegable se quedaba bloqueado sin explicación
            selector.replaceChildren(
                new Option('No tienes cuentas bancarias', '')
            );
            createBox.classList.remove('hidden');
            document.getElementById('account-create-name').focus();
            return;
        }

        selector.replaceChildren(
            new Option('Selecciona una cuenta bancaria', '')
        );

        accounts.forEach(account => {
            selector.add(
                new Option(
                    account.bank_name
                        ? `${account.name} — ${account.bank_name}`
                        : account.name,
                    account.id
                )
            );
        });

        selector.disabled = false;

        // Elegir la cuenta recién creada, la última usada
        // o, si solo hay una, esa misma.
        const lastAccountId = localStorage.getItem(
            dashboardAccountKey(user.id)
        );

        const preferred =
            accounts.find(a => a.id === selectId) ||
            accounts.find(a => a.id === lastAccountId) ||
            (accounts.length === 1 ? accounts[0] : null);

        if (preferred) {
            selector.value = preferred.id;
        }

    } catch (error) {
        console.error('Error cargando cuentas:', error);

        selector.replaceChildren(
            new Option('Error al cargar las cuentas', '')
        );

        selector.disabled = true;

        errorBox.textContent =
            'No se pudieron cargar tus cuentas: ' +
            describeSupabaseError(error);

        errorBox.classList.remove('hidden');

    } finally {
        updateOpenDashboardButton();
        selector.dispatchEvent(new Event('change'));   // actualiza también el botón de importar
    }
}


// "Abrir Dashboard" solo se activa con una cuenta elegida
function updateOpenDashboardButton() {
    const selector = document.getElementById('supabase-import-account');
    const button = document.getElementById('open-dashboard-button');

    if (button && selector) {
        button.disabled = selector.disabled || !selector.value;
    }
}

function setupAccountSelectorOnce() {
    if (window.accountSelectorReady) return;
    window.accountSelectorReady = true;

    document.getElementById('supabase-import-account')
        .addEventListener('change', updateOpenDashboardButton);

    document.getElementById('account-create-name')
        .addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                createAccountFromForm();
            }
        });
}


// Crear una cuenta bancaria desde la pantalla de inicio
async function createAccountFromForm() {
    const nameInput = document.getElementById('account-create-name');
    const bankInput = document.getElementById('account-create-bank');
    const button = document.getElementById('account-create-btn');
    const message = document.getElementById('account-create-message');

    const name = nameInput.value.trim();

    if (!name) {
        message.textContent = 'Escribe un nombre para la cuenta.';
        message.className = 'text-xs text-red-600 dark:text-red-400';
        nameInput.focus();
        return;
    }

    button.disabled = true;
    button.textContent = 'Creando...';
    message.classList.add('hidden');

    try {
        const user = await getCurrentUser();

        if (!user) {
            showLoginScreen();
            return;
        }

        const account = await createMyAccount(name, bankInput.value);

        nameInput.value = '';
        await reloadAccountSelector(user, account.id);

    } catch (error) {
        console.error('Error creando la cuenta:', error);

        message.textContent =
            'No se pudo crear la cuenta: ' +
            describeSupabaseError(error);

        message.className = 'text-xs text-red-600 dark:text-red-400';

    } finally {
        button.disabled = false;
        button.textContent = 'Crear cuenta';
    }
}

// Configurar formulario de autenticación
function setupAuthScreen() {
    const form = document.getElementById('auth-form');
    const switchBtn = document.getElementById('auth-switch');
    const message = document.getElementById('auth-message');
    const submitBtn = document.getElementById('auth-submit');

    if (!form || !switchBtn || !message || !submitBtn) {
        console.error('Faltan elementos del formulario de acceso.');
        return;
    }

    let isRegister = false;

    function showMessage(text, isError = false) {
        message.textContent = text;

        message.className = isError
            ? 'text-sm text-center text-red-600'
            : 'text-sm text-center text-green-600';
    }

    switchBtn.addEventListener('click', () => {
        isRegister = !isRegister;

        submitBtn.textContent = isRegister
            ? 'Crear cuenta'
            : 'Iniciar sesión';

        document.getElementById('auth-switch-text').textContent =
            isRegister
                ? '¿Ya tienes cuenta?'
                : '¿No tienes cuenta?';

        switchBtn.textContent = isRegister
            ? 'Inicia sesión'
            : 'Regístrate';

        document.getElementById('auth-password').autocomplete =
            isRegister ? 'new-password' : 'current-password';

        message.classList.add('hidden');
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();

        const email = document.getElementById('auth-email')
            .value.trim();

        const password = document.getElementById('auth-password')
            .value;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Procesando...';

        try {
            if (isRegister) {
                const data = await signUp(email, password);

                if (!data.session) {
                    showMessage(
                        'Revisa tu correo para confirmar tu cuenta.'
                    );
                } else {
                    await showSupabaseImportScreen();
                }

            } else {
                await signIn(email, password);
                await showSupabaseImportScreen();
            }

        } catch (error) {
            showMessage(error.message, true);
        } finally {
            submitBtn.disabled = false;

            submitBtn.textContent = isRegister
                ? 'Crear cuenta'
                : 'Iniciar sesión';
        }
    });
}

// Inicializar autenticación al abrir la aplicación
document.addEventListener('DOMContentLoaded', async () => {
    showLoginScreen();
    setupAuthScreen();

    try {
        // Si ya existe una sesión, no pedir login de nuevo
        const user = await getCurrentUser();

        if (user) {
            await showSupabaseImportScreen();
        }

    } catch (error) {
        console.error('Error comprobando sesión:', error);
        showLoginScreen();
    }
});


/* =====================================================
   CERRAR SESIÓN DE FINANZAS KUTXA
   ===================================================== */

   async function logoutFinanzas() {
    try {
        // Ocultar inmediatamente los datos financieros
        document.getElementById('app-root')
            .classList.add('hidden');

        document.getElementById('supabase-import-screen')
            .classList.add('hidden');

        // Cerrar la sesión de Supabase
        await signOut();

        // Limpiar los datos financieros de la memoria
        AppState = defaultState();
        BizumSugg = [];

        // Limpiar selección y archivo de importación
        const selector = document.getElementById(
            'supabase-import-account'
        );

        const file = document.getElementById(
            'supabase-import-file'
        );

        if (selector) {
            selector.replaceChildren(
                new Option('Selecciona una cuenta', '')
            );
        }

        if (file) {
            file.value = '';
        }

        // Regresar al inicio de sesión
        window.location.replace(
            window.location.pathname
        );

    } catch (error) {
        console.error('Error al cerrar sesión:', error);

        // No volver a mostrar el Dashboard
        alert('No se pudo cerrar la sesión. Recarga la aplicación.');
    }
}
