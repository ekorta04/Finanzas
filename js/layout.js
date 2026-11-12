/* ==========================================================================
   DISEÑO DEL RESUMEN Y MODO PRIVADO
   ========================================================================== */

/* --------------------------------------------------------------------------
   MODO PRIVADO (ojito de arriba)
   Oculta las cifras en euros (clase "priv": se difuminan) y deja a la vista
   las gráficas (sin escala ni valores al tocarlas) y los porcentajes.
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
    // Las gráficas dibujan escala y valores en el propio lienzo: hay que repintarlas
    if (typeof renderDashboard === 'function' && AppState.rows.length) renderDashboard();
}

/* --------------------------------------------------------------------------
   ORDEN DE LOS BLOQUES DEL RESUMEN
   Se mantiene pulsado un bloque (como en la pantalla de inicio del iPhone),
   los bloques se mueven y se arrastra a su sitio. El orden se guarda en los
   ajustes (AppState.settings.dashOrder), que ya se sincronizan entre iPhone
   y ordenador.
   -------------------------------------------------------------------------- */
const DASH_IDS = ['saldo', 'kpis', 'cierre', 'forecast', 'mensual', 'categorias', 'shops', 'insights'];
const DRAG_HOLD_MS = 380;    // tiempo de pulsación para empezar a arrastrar
const DRAG_SLOP = 10;        // si el dedo se mueve más, era un desplazamiento (scroll)

// Orden guardado, descartando bloques desconocidos y añadiendo al final los que falten
function dashOrder() {
    const saved = Array.isArray(AppState.settings.dashOrder) ? AppState.settings.dashOrder : [];
    const order = [...new Set(saved.filter(id => DASH_IDS.includes(id)))];
    return order.concat(DASH_IDS.filter(id => !order.includes(id)));
}

function currentDashOrder() {
    const box = document.getElementById('dash-widgets');
    return box ? [...box.children].map(el => el.dataset.w) : [];
}

// Colocar los bloques en el orden guardado (solo toca el DOM si hace falta)
function applyDashOrder() {
    const box = document.getElementById('dash-widgets');
    if (!box || drag) return;   // nunca reordenar mientras se arrastra
    const order = dashOrder();
    if (currentDashOrder().join() === order.join()) return;
    order.forEach(id => {
        const el = box.querySelector(':scope > [data-w="' + id + '"]');
        if (el) box.appendChild(el);
    });
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

/* ---------- Arrastrar ---------- */
let pend = null;             // pulsación en espera: { el, x, y, id, type, timer }
let drag = null;             // arrastre en curso: { el, pid, gx, gy, tx, ty, px, py, raf }
let suppressClick = false;   // tras arrastrar, el "clic" de soltar no debe abrir nada

function cancelPend() {
    if (pend) { clearTimeout(pend.timer); pend = null; }
}

function onDashDown(e) {
    if (drag || pend) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest && e.target.closest('.dw');
    if (!el || el.parentElement.id !== 'dash-widgets') return;
    const editing = document.body.classList.contains('dash-edit');
    // Fuera del modo ordenar, los controles del propio bloque siguen funcionando con normalidad
    if (!editing && e.target.closest('select, input, textarea, a, label, button, .seg, .switch')) return;
    pend = {
        el, x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType,
        timer: setTimeout(startDashDrag, DRAG_HOLD_MS)
    };
}

function onDashMove(e) {
    if (pend && e.pointerId === pend.id) {
        if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > DRAG_SLOP) {
            // Con ratón y en modo ordenar se arrastra al instante; con el dedo, mover antes de tiempo es hacer scroll
            if (pend.type === 'mouse' && document.body.classList.contains('dash-edit')) startDashDrag();
            else cancelPend();
        }
        return;
    }
    if (drag && e.pointerId === drag.pid) {
        drag.px = e.clientX;
        drag.py = e.clientY;
        e.preventDefault();
    }
}

function onDashUp(e) {
    if (pend && e.pointerId === pend.id) cancelPend();
    if (drag && e.pointerId === drag.pid) endDashDrag();
}

function startDashDrag() {
    if (!pend) return;
    const { el, x, y, id } = pend;
    cancelPend();
    if (!document.body.classList.contains('dash-edit')) toggleDashEdit(true);
    const r = el.getBoundingClientRect();
    drag = { el, pid: id, gx: x - r.left, gy: y - r.top, tx: 0, ty: 0, px: x, py: y, raf: 0, before: currentDashOrder().join() };
    el.classList.add('dragging');
    el.style.transition = 'none';
    try { el.setPointerCapture(id); } catch (err) { /* sin captura: se sigue con el documento */ }
    suppressClick = true;
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch (err) { /* sin vibración */ } }
    dragFrame();
}

// Rectángulo de un bloque donde "le toca estar" (sin la animación de desplazamiento en curso)
function naturalRect(el) {
    const r = el.getBoundingClientRect();
    let tx = 0, ty = 0;
    const t = getComputedStyle(el).transform;
    if (t && t !== 'none') { const m = new DOMMatrixReadOnly(t); tx = m.m41; ty = m.m42; }
    return { left: r.left - tx, right: r.right - tx, top: r.top - ty, bottom: r.bottom - ty };
}

// Subir o bajar un puesto el bloque arrastrado: se mueve el vecino, no el bloque que llevas en el dedo
function swapToward(target) {
    const el = drag.el, box = el.parentElement;
    const kids = [...box.children];
    const i = kids.indexOf(el), j = kids.indexOf(target);
    if (i < 0 || j < 0 || i === j) return;
    const neighbour = kids[i + (j > i ? 1 : -1)];
    const sibs = kids.filter(k => k !== el);
    const first = new Map(sibs.map(s => [s, s.getBoundingClientRect()]));   // dónde se ven ahora
    sibs.forEach(s => { s.style.transition = 'none'; s.style.transform = ''; });
    if (j > i) box.insertBefore(neighbour, el); else box.insertBefore(el, neighbour);
    sibs.forEach(s => {   // FLIP: cada bloque se desliza desde donde estaba hasta su nuevo sitio
        const a = first.get(s), b = s.getBoundingClientRect();
        const dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) s.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    });
    void box.offsetHeight;
    sibs.forEach(s => {
        if (s.style.transform) { s.style.transition = 'transform .22s ease'; s.style.transform = ''; }
        else s.style.transition = '';
    });
}

function dragFrame() {
    if (!drag) return;
    const vh = window.innerHeight;
    // Autodesplazamiento al acercarse al borde de arriba o de abajo
    let dy = 0;
    if (drag.py < 110) dy = -Math.min(18, Math.ceil((110 - drag.py) / 5));
    else if (drag.py > vh - 130) dy = Math.min(18, Math.ceil((drag.py - (vh - 130)) / 5));
    if (dy) window.scrollBy(0, dy);

    // El bloque sigue al dedo
    const el = drag.el, r = el.getBoundingClientRect();
    drag.tx += (drag.px - drag.gx) - r.left;
    drag.ty += (drag.py - drag.gy) - r.top;
    el.style.transform = 'translate(' + drag.tx + 'px,' + drag.ty + 'px)';

    // ¿Está el dedo sobre otro bloque? Entonces se intercambian
    const sibs = [...el.parentElement.children].filter(s => s !== el);
    const hit = sibs.find(s => {
        const n = naturalRect(s);
        return drag.px >= n.left && drag.px <= n.right && drag.py >= n.top && drag.py <= n.bottom;
    });
    if (hit) swapToward(hit);

    drag.raf = requestAnimationFrame(dragFrame);
}

function endDashDrag() {
    const d = drag;
    cancelAnimationFrame(d.raf);
    drag = null;
    const el = d.el, box = el.parentElement;
    try { el.releasePointerCapture(d.pid); } catch (err) { /* ya liberado */ }
    el.style.transition = 'transform .2s ease';
    el.style.transform = '';   // se asienta en su hueco
    setTimeout(() => {
        el.classList.remove('dragging');
        [...box.children].forEach(s => { s.style.transition = ''; s.style.transform = ''; });
    }, 230);
    setTimeout(() => { suppressClick = false; }, 60);
    const order = currentDashOrder();
    if (order.join() !== d.before) {
        AppState.settings.dashOrder = order;
        saveState();
    }
}

function initDashDrag() {
    const box = document.getElementById('dash-widgets');
    if (!box || box.dataset.drag) return;
    box.dataset.drag = '1';
    box.addEventListener('pointerdown', onDashDown);
    box.addEventListener('contextmenu', e => { if (pend || drag || document.body.classList.contains('dash-edit')) e.preventDefault(); });
    box.addEventListener('click', e => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); } }, true);
    document.addEventListener('pointermove', onDashMove);
    document.addEventListener('pointerup', onDashUp);
    document.addEventListener('pointercancel', onDashUp);
    // Mientras se arrastra, el dedo no debe hacer scroll de la página
    document.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleDashEdit(false); });
}

function initDashLayout() {
    applyDashOrder();
    initDashDrag();
    applyPrivacy();
}

// El ojito se aplica ya al cargar, antes de que aparezca ningún importe
applyPrivacy();
