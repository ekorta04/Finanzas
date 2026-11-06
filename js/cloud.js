/* ==========================================================================
    NUBE: Google Sheets (inicio de sesión con Google, scope drive.file)
    ========================================================================== */
    const GOOGLE_CLIENT_ID = '797986917764-ptbtkb45epmnuqjr2nvnh26e4vvt7g3r.apps.googleusercontent.com'; // <- pega aquí tu ID de cliente de Google (ver GUIA.md)
    const SHEET_TITLE = 'Finanzas KUTXA';
    const LS_CID = 'finanzas_gclient', LS_SID = 'finanzas_sheet_id', LS_CONN = 'finanzas_gconn';
    const MOV_HEAD = ['Clave', 'Fecha', 'Fecha valor', 'Concepto', 'Importe', 'Saldo', 'Categoría', 'Manual', 'Etiquetas', 'Bizums vinculados', 'Vinculado a'];
    const INV_HEAD = ['Clave', 'Fecha', 'Concepto', 'Importe', 'Saldo'];
    const Cloud = { token: null, exp: 0, sid: null, state: 'off', timer: null, busy: false, dirty: false, client: null };
    const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const clientId = () => GOOGLE_CLIENT_ID || lsGet(LS_CID);
    
    function setCloudStatus(txt, kind) {
        Cloud.state = kind;
        const el = document.getElementById('cloud-status-text'); if (el) el.textContent = txt;
        const pill = document.getElementById('cloud-pill');
        if (pill) { pill.textContent = txt; pill.classList.toggle('hidden', kind === 'ok' || kind === 'off'); }
        const dot = document.getElementById('cloud-dot-i'), dt = document.getElementById('cloud-dot-t');
        if (dot) {
            dot.className = 'inline-block w-2.5 h-2.5 rounded-full ' + (kind === 'ok' ? 'bg-emerald-500' : kind === 'busy' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500');
            dt.textContent = kind === 'ok' ? 'Sincronizado' : kind === 'busy' ? 'Sincronizando…' : kind === 'login' ? 'Toca para conectar' : kind === 'err' ? 'Error: toca' : 'Sin conexión';
            document.getElementById('cloud-dot').title = txt;
        }
        const btn = document.getElementById('cloud-sync-btn');
        if (btn) btn.lastChild.textContent = (kind === 'login' || kind === 'off') ? 'Conectar con Google' : 'Sincronizar ahora';
    }
    function cloudDotClick() {
        if (Cloud.state === 'ok' || Cloud.state === 'busy') { switchTab('v-datos'); return; }
        if (!clientId()) { switchTab('v-datos'); return; }
        cloudSyncNow();
    }
    setInterval(() => { if (Cloud.token && Date.now() > Cloud.exp && Cloud.state !== 'login') setCloudStatus('Sesión caducada: toca el punto para reconectar', 'login'); }, 15000);
    function saveClientIdFromInput() {
        const v = document.getElementById('cloud-cid').value.trim();
        if (!v) return; lsSet(LS_CID, v); showToast('ID guardado'); initCloud();
    }
    function initCloud() {
        const box = document.getElementById('cloud-cid-box');
        if (box) box.classList.toggle('hidden', !!GOOGLE_CLIENT_ID);
        if (!clientId()) { setCloudStatus('Falta el ID de cliente de Google (mira la guía)', 'off'); return; }
        if (!window.google || !google.accounts) { setCloudStatus('No se pudo cargar el inicio de sesión de Google', 'off'); return; }
        Cloud.client = google.accounts.oauth2.initTokenClient({
            client_id: clientId(), scope: 'https://www.googleapis.com/auth/drive.file', callback: () => {},
            error_callback: e => { if (Cloud.rej) Cloud.rej(new Error((e && e.type) || 'auth')); }
        });
        Cloud.sid = lsGet(LS_SID) || null;
        setCloudStatus(lsGet(LS_CONN) ? 'Pulsa para reconectar con Google' : 'Conecta tu cuenta de Google para sincronizar', 'login');
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Cloud.token && Date.now() < Cloud.exp) cloudPull(false); });
    }
    function getToken() {   // debe llamarse desde un gesto del usuario la primera vez
        if (Cloud.token && Date.now() < Cloud.exp - 30000) return Promise.resolve(Cloud.token);
        return new Promise((res, rej) => {
            Cloud.rej = rej; const to = setTimeout(() => rej(new Error('auth: Google no respondió')), 90000);
            Cloud.client.callback = r => {
                clearTimeout(to);
                if (r.error) return rej(new Error(r.error));
                Cloud.token = r.access_token; Cloud.exp = Date.now() + (r.expires_in || 3600) * 1000; lsSet(LS_CONN, '1'); res(Cloud.token);
            };
            setCloudStatus('Esperando a Google…', 'busy');
            Cloud.client.requestAccessToken({ prompt: lsGet(LS_CONN) ? '' : 'consent' });
        });
    }
    async function gfetch(url, opts) {
        const tok = await getToken();
        const r = await fetch(url, { ...(opts || {}), headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' } });
        if (r.status === 401) { Cloud.token = null; throw new Error('auth'); }
        if (!r.ok) throw new Error('http ' + r.status + ' ' + (await r.text()).slice(0, 200));
        return r.json();
    }
    async function ensureSheet() {
        if (Cloud.sid) return Cloud.sid;
        const q = encodeURIComponent(`name='${SHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
        const f = await gfetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=createdTime`);
        if (f.files && f.files.length) Cloud.sid = f.files[0].id;
        else {
            const c = await gfetch('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', body: JSON.stringify({
                properties: { title: SHEET_TITLE }, sheets: [{ properties: { title: 'Movimientos' } }, { properties: { title: 'Inversion' } }, { properties: { title: 'Config' } }] }) });
            Cloud.sid = c.spreadsheetId;
        }
        lsSet(LS_SID, Cloud.sid); return Cloud.sid;
    }
    const jparse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
    function stateToSheets() {
        const mov = [MOV_HEAD].concat(AppState.rows.map(r => [r.k, r.d, r.v || r.d, r.c, r.i, r.s, r.cat, r.man ? 'sí' : '', (r.t || []).join(','), (r.bz && r.bz.length) ? JSON.stringify(r.bz) : '', r.lk || '']));
        const inv = [INV_HEAD].concat(AppState.inv.map(r => [r.k, r.d, r.c, r.i, r.s == null ? '' : r.s]));
        const cfg = [['clave', 'valor']].concat(['rules', 'budgets', 'invMap', 'invSign', 'invValues', 'dismissed', 'settings'].map(k => [k, JSON.stringify(AppState[k] == null ? null : AppState[k])]),
            [['imports', JSON.stringify((AppState.imports || []).slice(-30))]]);
        return { mov, inv, cfg };
    }
    function sheetsToState(mov, inv, cfg) {
        const st = {};
        (cfg || []).slice(1).forEach(([k, v]) => { if (k) st[k] = jparse(v, null); });
        const num = x => (typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.')));
        const rows = (mov || []).slice(1).filter(r => r[0]).map(r => {
            const o = { k: String(r[0]), d: String(r[1]), v: String(r[2] || r[1]), c: String(r[3] == null ? '' : r[3]), i: num(r[4]), s: num(r[5]), cat: String(r[6] || 'Sin clasificar'), man: r[7] === 'sí' };
            if (r[8]) o.t = String(r[8]).split(',').filter(Boolean);
            if (r[9]) o.bz = jparse(r[9], []);
            if (r[10]) o.lk = String(r[10]);
            return o;
        });
        const invr = (inv || []).slice(1).filter(r => r[0]).map(r => ({ k: String(r[0]), d: String(r[1]), c: String(r[2] || ''), i: num(r[3]), s: (r[4] === '' || r[4] == null) ? null : num(r[4]) }));
        return normalizeState({ ...st, rows, inv: invr });
    }
    async function cloudPull(first) {
        if (Cloud.busy || Cloud.dirty) return;
        Cloud.busy = true; setCloudStatus('Sincronizando…', 'busy');
        try {
            const sid = await ensureSheet();
            const q = ['Movimientos!A1:K20000', 'Inversion!A1:E20000', 'Config!A1:B30'].map(r => 'ranges=' + encodeURIComponent(r)).join('&');
            const d = await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE`);
            const [mov, inv, cfg] = d.valueRanges.map(v => v.values || []);
            if (mov.length > 1 || inv.length > 1) {
                const next = sheetsToState(mov, inv, cfg);
                if (JSON.stringify(next) !== JSON.stringify(AppState)) {
                    AppState = next;
                    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState)); } catch (e) {}
                    renderAllViews(); if (!first) showToast('Datos actualizados desde Google Sheets');
                }
                setCloudOk();
            } else if (AppState.rows.length || AppState.inv.length) { Cloud.busy = false; await cloudPush(); return; }
            else setCloudStatus('Conectado a Google Sheets (aún sin datos)', 'ok');
        } catch (e) { cloudFail(e); }
        Cloud.busy = false;
    }
    function setCloudOk() { setCloudStatus('Sincronizado ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), 'ok'); }
    function cloudFail(e) {
        console.error(e);
        if (String(e.message).startsWith('auth') || e.message === 'popup_closed' || e.message === 'popup_failed_to_open' || e.message === 'access_denied') setCloudStatus('Pulsa el punto rojo para reconectar con Google', 'login');
        else setCloudStatus('Error con Google: ' + String(e.message).slice(0, 160), 'err');
    }
    function cloudSchedule() {
        if (!Cloud.token) return;
        Cloud.dirty = true; clearTimeout(Cloud.timer); Cloud.timer = setTimeout(cloudPush, 1500);
    }
    async function cloudPush() {
        if (Cloud.busy) { Cloud.timer = setTimeout(cloudPush, 800); return; }
        Cloud.busy = true; setCloudStatus('Guardando en Google Sheets…', 'busy');
        try {
            const sid = await ensureSheet(); const { mov, inv, cfg } = stateToSheets();
            await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values:batchClear`, { method: 'POST', body: JSON.stringify({ ranges: ['Movimientos', 'Inversion', 'Config'] }) });
            await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({
                valueInputOption: 'RAW', data: [{ range: 'Movimientos!A1', values: mov }, { range: 'Inversion!A1', values: inv }, { range: 'Config!A1', values: cfg }] }) });
            Cloud.dirty = false; setCloudOk();
        } catch (e) { cloudFail(e); }
        Cloud.busy = false;
    }
    async function cloudSyncNow() {
        if (!Cloud.client) { initCloud(); if (!Cloud.client) { showToast('Configura primero el ID de cliente de Google', 'error'); return; } }
        setCloudStatus('Conectando con Google…', 'busy');
        try { await getToken(); } catch (e) { cloudFail(e); showToast('No se pudo conectar con Google', 'error'); return; }
        if (Cloud.dirty) await cloudPush(); else await cloudPull(false);
        showToast(Cloud.state === 'ok' ? 'Sincronizado' : 'No se pudo sincronizar', Cloud.state === 'ok' ? 'success' : 'error');
    }
    
    /* Confirmación propia (el visor bloquea confirm()) */
    function askConfirm(msg) {
        return new Promise(res => {
            const m = document.getElementById('confirm-modal');
            document.getElementById('confirm-text').textContent = msg;
            m.classList.remove('hidden');
            const done = v => { m.classList.add('hidden'); yes.onclick = no.onclick = null; res(v); };
            const yes = document.getElementById('confirm-yes'), no = document.getElementById('confirm-no');
            yes.onclick = () => done(true); no.onclick = () => done(false);
        });
    }