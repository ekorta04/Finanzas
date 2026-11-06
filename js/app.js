/* ==========================================================================
    5. INICIO Y NAVEGACIÓN
    ========================================================================== */
function initApp() {
    loadState();
    populateCategorySelects();
    setupTabNavigation();
    setupDropZone();
    setupInvDropZone();
    document.getElementById('inv-val-date').value = new Date().toISOString().slice(0, 10);
    renderAllViews();
    switchTab('v-dashboard');
    const t0 = Date.now(); (function w() { if (window.google && google.accounts) initCloud(); else if (Date.now() - t0 < 8000) setTimeout(w, 200); else initCloud(); })();
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
    renderPresupuestos();
    renderReglas();
    renderImportHistory();
    renderSettings();
}

function setupTabNavigation() {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.getAttribute('data-target'))));
}

function switchTab(targetId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const on = btn.getAttribute('data-target') === targetId;
        ['bg-slate-100', 'dark:bg-slate-800', 'text-brand-600', 'dark:text-brand-400'].forEach(c => btn.classList.toggle(c, on));
        ['text-slate-600', 'dark:text-slate-400'].forEach(c => btn.classList.toggle(c, !on));
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('hidden', c.id !== targetId));
    if (targetId === 'v-dashboard') renderDashboard();
    if (targetId === 'v-inversion') renderInversion();
}

function populateCategorySelects() {
    ['filter-cat', 'rule-category'].forEach(id => {
        const el = document.getElementById(id);
        const cur = el.value;
        el.innerHTML = id === 'filter-cat' ? '<option value="">Todas</option>' : '';
        CATEGORIES.forEach(cat => { if (id === 'rule-category' && cat === 'Sin clasificar') return; el.innerHTML += `<option value="${cat}">${cat}</option>`; });
        if (cur) el.value = cur;
    });
}

function getUniqueMonths() { return [...new Set(AppState.rows.map(r => r.d.slice(0, 7)))].sort().reverse(); }

function populateMonthOptions() {
    const months = getUniqueMonths();
    ['dash-month', 'filter-month'].forEach(id => {
        const el = document.getElementById(id);
        const cur = el.value;
        el.innerHTML = '<option value="">Todo el Histórico</option>';
        months.forEach(m => { const [y, mm] = m.split('-'); el.innerHTML += `<option value="${m}">${mm}/${y}</option>`; });
        if (cur && months.includes(cur)) el.value = cur;
    });
}

function updateUnclassifiedAlert() {
    const count = AppState.rows.filter(r => r.cat === 'Sin clasificar').length;
    const el = document.getElementById('unclassified-alert');
    if (count > 0) { el.classList.remove('hidden'); document.getElementById('unclassified-count').textContent = `Tienes ${count} movimiento(s) asignado(s) como 'Sin clasificar'.`; }
    else el.classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', initApp);