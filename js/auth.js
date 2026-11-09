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

// Obtener usuario autenticado (comprueba con el servidor)
async function getCurrentUser() {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error) return null;
    return data.user;
}

// Sesión guardada en el dispositivo (no necesita red)
async function getStoredSession() {
    const { data } = await supabaseClient.auth.getSession();
    return data && data.session ? data.session : null;
}

// Mostrar exclusivamente la pantalla de login
function showLoginScreen() {
    document.getElementById('app-root').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
}

// Tras iniciar sesión: directo al Dashboard
async function enterApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-root').classList.remove('hidden');

    try {
        await loadUserDashboard();
    } catch (error) {
        console.error('Error cargando el Dashboard:', error);
        setCloudStatus('Error con la base de datos: ' + describeSupabaseError(error), 'err');
        showToast(
            'No se pudieron cargar tus movimientos: ' +
            describeSupabaseError(error),
            'error'
        );
    }
}

// Configurar formulario de autenticación
function setupAuthScreen() {
    const form = document.getElementById('auth-form');
    const switchBtn = document.getElementById('auth-switch');
    const message = document.getElementById('auth-message');
    const submitBtn = document.getElementById('auth-submit');
    const remember = document.getElementById('auth-remember');

    if (!form || !switchBtn || !message || !submitBtn) {
        console.error('Faltan elementos del formulario de acceso.');
        return;
    }

    if (remember) {
        remember.checked = getRememberSession();
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

        // Guardar la elección ANTES de iniciar sesión, para que
        // la sesión se almacene en el sitio correcto.
        setRememberSession(!remember || remember.checked);

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
                    await enterApp();
                }

            } else {
                await signIn(email, password);
                document.getElementById('auth-password').value = '';
                await enterApp();
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
    setupAuthScreen();

    try {
        // Si hay una sesión guardada, entrar sin pedir login
        const session = await getStoredSession();

        if (session) {
            await enterApp();
        } else {
            showLoginScreen();
        }

    } catch (error) {
        console.error('Error comprobando sesión:', error);
        showLoginScreen();
    }

    // Si la sesión caduca o se cierra en otra pestaña
    supabaseClient.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') {
            showLoginScreen();
        }
    });
});


/* =====================================================
   CERRAR SESIÓN DE FINANZAS KUTXA
   ===================================================== */

async function logoutFinanzas() {
    try {
        // Ocultar inmediatamente los datos financieros
        document.getElementById('app-root')
            .classList.add('hidden');

        // Cerrar la sesión de Supabase
        await signOut();

        // Limpiar los datos financieros de la memoria
        AppState = defaultState();
        BizumSugg = [];
        window.activeSupabaseAccountId = null;

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
