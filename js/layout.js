/* ==========================================================================
   DISEÑO DEL RESUMEN Y MODO PRIVADO
   ========================================================================== */

/* --------------------------------------------------------------------------
   MODO PRIVADO (ojito de arriba)
   Difumina saldos, patrimonio, proyección e inversión (todo lo que lleva la
   clase "priv") y deja a la vista gastos, categorías y estadísticas.
   Se recuerda en este dispositivo y no se sincroniza: así, ocultarlo en el
   iPhone no lo oculta en el ordenador.
   -------------------------------------------------------------------------- */
const PRIV_KEY = 'finanzas_priv';
let privOn = false;
try { privOn = localStorage.getItem(PRIV_KEY) === '1'; } catch (e) { /* sin almacenamiento */ }

function applyPrivacy() {
    document.body.classList.toggle('priv-on', privOn);
    const label = privOn ? 'Mostrar importes' : 'Ocultar importes';
    document.querySelectorAll('.priv-btn').forEach(b => {
        b.setAttribute('aria-pressed', String(privOn));
        b.title = label;
        b.setAttribute('aria-label', label);
        const ic = b.querySelector('.ic');
        if (ic) ic.className = 'ic ' + (privOn ? 'ic-eye-off' : 'ic-eye');
    });
}

function togglePrivacy() {
    privOn = !privOn;
    try { localStorage.setItem(PRIV_KEY, privOn ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
    applyPrivacy();
}

/* --------------------------------------------------------------------------
   ORDEN DE LOS BLOQUES DEL RESUMEN
   El orden se guarda en los ajustes (AppState.settings.dashOrder), que ya se
   sincronizan entre iPhone y ordenador.
   -------------------------------------------------------------------------- */
const DASH_WIDGETS = [
    ['saldo', 'Saldo actual'],
    ['kpis', 'Gastos, ingresos y ahorro'],
    ['forecast', 'Proyección de saldo'],
    ['mensual', 'Ingresos y gastos'],
    ['categorias', 'Por categoría'],
    ['shops', 'Dónde más gastas'],
    ['insights', 'Observaciones']
];

// Orden guardado, descartando bloques desconocidos y añadiendo al final los que falten
function dashOrder() {
    const ids = DASH_WIDGETS.map(w => w[0]);
    const saved = Array.isArray(AppState.settings.dashOrder) ? AppState.settings.dashOrder : [];
    const order = [...new Set(saved.filter(id => ids.includes(id)))];
    return order.concat(ids.filter(id => !order.includes(id)));
}

// Colocar los bloques en el orden guardado (solo toca el DOM si hace falta)
function applyDashOrder() {
    const box = document.getElementById('dash-widgets');
    if (!box) return;
    const order = dashOrder();
    const current = [...box.children].map(el => el.dataset.w);
    if (current.join() !== order.join()) {
        order.forEach(id => {
            const el = box.querySelector(':scope > [data-w="' + id + '"]');
            if (el) box.appendChild(el);
        });
    }
    refreshDashBars();
}

// Barra con las flechas de cada bloque (solo se ve en modo ordenar)
function buildDashBars() {
    DASH_WIDGETS.forEach(([id, name]) => {
        const el = document.querySelector('#dash-widgets > [data-w="' + id + '"]');
        if (!el || el.querySelector(':scope > .dw-bar')) return;
        const bar = document.createElement('div');
        bar.className = 'dw-bar';
        bar.innerHTML =
            '<span class="dw-name">' + name + '</span>' +
            '<span class="dw-btns">' +
            '<button type="button" class="dw-btn" data-dir="-1" aria-label="Subir ' + name + '"><i class="ic ic-arrow-up"></i></button>' +
            '<button type="button" class="dw-btn" data-dir="1" aria-label="Bajar ' + name + '"><i class="ic ic-arrow-down"></i></button>' +
            '</span>';
        bar.querySelectorAll('.dw-btn').forEach(b => {
            b.addEventListener('click', () => moveDashWidget(id, Number(b.dataset.dir)));
        });
        el.insertBefore(bar, el.firstChild);
    });
}

// Desactivar "subir" en el primero y "bajar" en el último
function refreshDashBars() {
    const box = document.getElementById('dash-widgets');
    if (!box) return;
    const items = [...box.children];
    items.forEach((el, i) => {
        const up = el.querySelector(':scope > .dw-bar .dw-btn[data-dir="-1"]');
        const down = el.querySelector(':scope > .dw-bar .dw-btn[data-dir="1"]');
        if (up) up.disabled = i === 0;
        if (down) down.disabled = i === items.length - 1;
    });
}

function moveDashWidget(id, dir) {
    const order = dashOrder();
    const i = order.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    AppState.settings.dashOrder = order;
    saveState();
    applyDashOrder();
    const el = document.querySelector('#dash-widgets > [data-w="' + id + '"]');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function resetDashOrder() {
    delete AppState.settings.dashOrder;
    saveState();
    applyDashOrder();
    showToast('Orden restablecido');
}

// Entrar o salir del modo ordenar
function toggleDashEdit(force) {
    const on = typeof force === 'boolean' ? force : !document.body.classList.contains('dash-edit');
    document.body.classList.toggle('dash-edit', on);
    const btn = document.getElementById('dash-edit-btn');
    if (btn) {
        btn.setAttribute('aria-pressed', String(on));
        btn.classList.toggle('on', on);
    }
    const hint = document.getElementById('dash-edit-hint');
    if (hint) hint.classList.toggle('hidden', !on);
}

function initDashLayout() {
    buildDashBars();
    applyDashOrder();
    applyPrivacy();
}

// El ojito se aplica ya al cargar, antes de que aparezca ningún importe
applyPrivacy();
