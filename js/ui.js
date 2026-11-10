/* ==========================================================================
    UI - MENSAJES Y CONFIRMACIONES
    ========================================================================== */

// Mostrar mensajes emergentes (Toast)
let toastTimer = null;
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast-message');

    document.getElementById('toast-text').textContent = msg;

    const icon = document.getElementById('toast-icon');
    icon.className = type === 'error' ? 'ic ic-circle-x' : 'ic ic-circle-check';
    icon.style.color = type === 'error' ? '#ff453a' : '#30d158';

    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}


// Mostrar ventana de confirmación personalizada
function askConfirm(msg) {
    return new Promise(res => {
        const m = document.getElementById('confirm-modal');

        document.getElementById('confirm-text').textContent = msg;
        m.classList.remove('hidden');

        const done = v => {
            m.classList.add('hidden');
            yes.onclick = no.onclick = null;
            res(v);
        };

        const yes = document.getElementById('confirm-yes');
        const no = document.getElementById('confirm-no');

        yes.onclick = () => done(true);
        no.onclick = () => done(false);
    });
}
