
/* ==========================================================================
   5. INICIO Y NAVEGACIÓN
   ========================================================================== */

   function initApp() {
    loadState();

    populateCategorySelects();
    loadCompareMode();
    setupTabNavigation();
    initDashLayout();
    setupDropZone();
    setupInvDropZone();
    setupXRayDropZone();

    document.getElementById('inv-val-date').value =
        new Date().toISOString().slice(0, 10);

    renderAllViews();
    switchTab('v-dashboard');

    // Los datos se cargan desde Supabase al iniciar sesión (ver loadUserDashboard)
}

function renderAllViews() {
    populateCategorySelects();
    updateUnclassifiedAlert();
    updateStaleAlert();
    renderBizumSuggestions();
    populateMonthOptions();
    populateTagControls();
    renderDashboard();
    renderMovimientos();
    renderTags();
    renderInversion();
    renderReglas();
    renderImportHistory();
    renderSettings();
}

function setupTabNavigation() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.getAttribute('data-target'));
        });
    });
}

function switchTab(targetId) {
    // Etiquetas vive ahora dentro de Movimientos
    if (targetId === 'v-tags') { targetId = 'v-movs'; showMovsView('tags'); }

    const prev = document.querySelector('.tab-content:not(.hidden)');
    if (targetId !== 'v-dashboard') toggleDashEdit(false);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
    });

    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('hidden', c.id !== targetId);
    });

    if (!prev || prev.id !== targetId) window.scrollTo({ top: 0 });

    if (targetId === 'v-dashboard') {
        renderDashboard();
    }

    if (targetId === 'v-inversion') {
        renderInversion();
    }
}

// Movimientos / Etiquetas (control segmentado)
function showMovsView(view) {
    const tags = view === 'tags';
    document.getElementById('movs-view').classList.toggle('hidden', tags);
    document.getElementById('tags-view').classList.toggle('hidden', !tags);
    document.getElementById('seg-movs').classList.toggle('on', !tags);
    document.getElementById('seg-tags').classList.toggle('on', tags);
    if (tags) renderTags();
}

function toggleFilters(force) {
    const panel = document.getElementById('filters-panel');
    const open = typeof force === 'boolean' ? force : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    document.getElementById('filters-btn').setAttribute('aria-expanded', String(open));
}

function populateCategorySelects() {
    ['filter-cat', 'rule-category'].forEach(id => {
        const el = document.getElementById(id);
        const cur = el.value;

        el.innerHTML = id === 'filter-cat'
            ? '<option value="">Todas</option>'
            : '';

        el.innerHTML += catOptionsHtml(id === 'rule-category' ? ['Sin clasificar'] : []);

        if (cur) {
            el.value = cur;
        }
    });
}

function getUniqueMonths() {
    return [
        ...new Set(
            AppState.rows.map(r => r.d.slice(0, 7))
        )
    ].sort().reverse();
}

function populateMonthOptions() {
    const months = getUniqueMonths();
    const thisYear = todayIso().slice(0, 4);
    const years = [...new Set(months.map(m => m.slice(0, 4)))].filter(y => y < thisYear);   // años completos con datos

    ['dash-month', 'filter-month'].forEach(id => {
        const el = document.getElementById(id);
        const cur = el.value;
        const monthOpts = months.map(m => `<option value="${m}">${monthName(m)}</option>`).join('');

        el.innerHTML = id === 'dash-month'
            ? `<optgroup label="Rápidos"><option value="30d">Últimos 30 días</option><option value="90d">Últimos 90 días</option><option value="ytd">Este año</option><option value="">Todo</option></optgroup>`
              + (months.length ? `<optgroup label="Meses">${monthOpts}</optgroup>` : '')
              + (years.length ? `<optgroup label="Años">${years.map(y => `<option value="y:${y}">${y}</option>`).join('')}</optgroup>` : '')
            : '<option value="">Todos</option>' + monthOpts;

        // Se conserva la elección si sigue existiendo
        if ([...el.options].some(o => o.value === cur)) el.value = cur;
    });
}

// Recordatorio: si los movimientos llegan hasta hace más de una semana, toca importar otro CSV
const STALE_DAYS = 7;
const STALE_SNOOZE_KEY = 'finanzas_stale_snooze';

function updateStaleAlert() {
    const el = document.getElementById('stale-alert');
    if (!el) return;
    const last = AppState.rows.length ? lastDataDate() : null;
    const days = last ? daysBetween(last, todayIso()) : 0;
    let snoozed = false;
    try { snoozed = localStorage.getItem(STALE_SNOOZE_KEY) === todayIso(); } catch (e) { /* sin almacenamiento */ }
    if (!last || days < STALE_DAYS || snoozed) { el.classList.add('hidden'); return; }
    document.getElementById('stale-text').textContent =
        `Tus movimientos llegan hasta el ${formatDateEs(last)} (hace ${days} días).`;
    el.classList.remove('hidden');
}

// "Ahora no": no se vuelve a avisar hasta mañana
function snoozeStaleAlert() {
    try { localStorage.setItem(STALE_SNOOZE_KEY, todayIso()); } catch (e) { /* sin almacenamiento */ }
    updateStaleAlert();
}

function updateUnclassifiedAlert() {
    const count = AppState.rows.filter(
        r => r.cat === 'Sin clasificar'
    ).length;

    const el = document.getElementById('unclassified-alert');

    if (count > 0) {
        el.classList.remove('hidden');

        document.getElementById('unclassified-count').textContent =
            count === 1 ? 'Hay 1 movimiento por clasificar' : `Hay ${count} movimientos por clasificar`;
    } else {
        el.classList.add('hidden');
    }
}

// La aplicación arranca en auth.js: si hay sesión guardada,
// va directa al Dashboard; si no, muestra el inicio de sesión.
