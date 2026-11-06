/* ==========================================================================
    UI - MENSAJES Y CONFIRMACIONES
    ========================================================================== */

// Mostrar mensajes emergentes (Toast)
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast-message');

    document.getElementById('toast-text').textContent = msg;

    document.getElementById('toast-icon').className =
        type === 'error'
            ? 'fa-solid fa-circle-xmark text-rose-400 text-base'
            : 'fa-solid fa-circle-check text-emerald-400 text-base';

    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
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
