
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

    // Cargar las cuentas desde PostgreSQL
    selector.disabled = true;
    selector.replaceChildren(
        new Option('Cargando cuentas...', '')
    );

    try {
        const accounts = await getMyAccounts();

        // Verificar que la sesión no ha cambiado
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.id !== user.id) {
            showLoginScreen();
            return;
        }

        selector.replaceChildren(
            new Option('Selecciona una cuenta bancaria', '')
        );

        accounts.forEach(account => {
            selector.add(
                new Option(
                    `${account.name} — ${account.bank_name}`,
                    account.id
                )
            );
        });

        if (accounts.length === 0) {
            selector.replaceChildren(
                new Option('No tienes cuentas bancarias', '')
            );
        }

        selector.disabled = accounts.length === 0;

    } catch (error) {
        console.error('Error cargando cuentas:', error);

        selector.replaceChildren(
            new Option('Error al cargar las cuentas', '')
        );

        selector.disabled = true;
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
