
/* ==========================================================================
   5. INICIO Y NAVEGACIÓN
   ========================================================================== */

   function initApp() {
    loadState();

    populateCategorySelects();
    setupTabNavigation();
    setupDropZone();
    setupInvDropZone();

    document.getElementById('inv-val-date').value =
        new Date().toISOString().slice(0, 10);

    renderAllViews();
    switchTab('v-dashboard');

    // Los datos se cargan desde Supabase al iniciar sesión (ver loadUserDashboard)
}

function renderAllViews() {
    updateUnclassifiedAlert();
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

        CATEGORIES.forEach(cat => {
            if (id === 'rule-category' && cat === 'Sin clasificar') {
                return;
            }

            el.innerHTML += `<option value="${cat}">${cat}</option>`;
        });

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

    ['dash-month', 'filter-month'].forEach(id => {
        const el = document.getElementById(id);
        const cur = el.value;

        el.innerHTML = id === 'dash-month' ? '<option value="">Todo</option>' : '<option value="">Todos</option>';

        months.forEach(m => {
            const [y, mm] = m.split('-');

            el.innerHTML +=
                `<option value="${m}">${monthName(m)}</option>`;
        });

        if (cur && months.includes(cur)) {
            el.value = cur;
        }
    });
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
