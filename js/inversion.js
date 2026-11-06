/* ==========================================================================
    10. CUENTA DE INVERSIÓN
    ========================================================================== */
    function invFlow(r) { return r.i * (AppState.invSign || 1); }

    function invSummary() {
        let ap = 0, ret = 0;
        AppState.inv.forEach(r => { const f = invFlow(r); if (f > 0) ap += f; else ret += -f; });
        const neto = ap - ret;
        let valor = null, label = 'Valor actual', fecha = null;
        if (AppState.invValues.length) {
            const last = [...AppState.invValues].sort((a, b) => a.d.localeCompare(b.d)).pop();
            valor = last.v; fecha = last.d; label = `Valor al ${formatDateEs(last.d)}`;
        } else {
            const withBal = AppState.inv.find(r => r.s != null);
            if (withBal) { valor = withBal.s; label = 'Saldo según CSV'; }
        }
        return { ap, ret, neto, valor, label, fecha };
    }
    
    function renderInversion() {
        const sum = invSummary();
        document.getElementById('inv-kpi-neto').textContent = formatEur(sum.neto);
        document.getElementById('inv-kpi-in').textContent = formatEur(sum.ap);
        document.getElementById('inv-kpi-out').textContent = formatEur(sum.ret);
        document.getElementById('inv-kpi-valor-label').textContent = sum.label;
        const vEl = document.getElementById('inv-kpi-valor'), rEl = document.getElementById('inv-kpi-rent'), pEl = document.getElementById('inv-kpi-rent-pct');
        if (sum.valor != null) {
            vEl.textContent = formatEur(sum.valor); vEl.className = 'text-lg font-bold text-brand-600 dark:text-brand-400';
            const rent = sum.valor - sum.neto;
            rEl.textContent = (rent >= 0 ? '+' : '') + formatEur(rent);
            rEl.className = `text-lg font-bold ${rent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
            pEl.textContent = sum.neto > 0 ? `${rent >= 0 ? '+' : ''}${(rent / sum.neto * 100).toFixed(2)}% sobre lo aportado` : '';
        } else { vEl.textContent = '—'; vEl.className = 'text-lg font-bold'; rEl.textContent = '—'; rEl.className = 'text-lg font-bold'; pEl.textContent = 'Añade el valor actual de la cartera'; }
    
        document.getElementById('inv-sign').value = String(AppState.invSign || 1);
    
        // Lista de valores
        const vl = document.getElementById('inv-values-list');
        const vals = [...AppState.invValues].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 5);
        vl.innerHTML = vals.length ? vals.map(v => `<div class="flex justify-between items-center bg-slate-50 dark:bg-slate-800/40 rounded-lg px-2 py-1"><span>${formatDateEs(v.d)}</span><span class="font-bold">${formatEur(v.v)}</span><button onclick="deleteInvValue('${v.d}')" class="text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button></div>`).join('') : '<p class="text-slate-400">Sin valores guardados.</p>';
    
        // Tabla
        document.getElementById('inv-counter').textContent = `${AppState.inv.length} movimientos de inversión` + (AppState.inv.length > 200 ? ' (mostrando los 200 más recientes)' : '');
        const tb = document.getElementById('inv-table-body');
        tb.innerHTML = AppState.inv.length ? AppState.inv.slice(0, 200).map(r => {
            const f = invFlow(r);
            return `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td class="py-2 px-4 font-mono text-slate-500 whitespace-nowrap">${formatDateEs(r.d)}</td>
                <td class="py-2 px-4 font-medium">${esc(r.c)}</td>
                <td class="py-2 px-4 text-right font-bold font-mono ${f >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${formatEur(r.i)}</td>
                <td class="py-2 px-4 text-right font-mono text-slate-400 hidden sm:table-cell">${r.s != null ? formatEur(r.s) : ''}</td></tr>`;
        }).join('') : `<tr><td colspan="4" class="py-6 text-center text-slate-400">Importa el CSV de tu cuenta de inversión para empezar.</td></tr>`;
    
        // Gráfico (solo si la pestaña está visible)
        if (document.getElementById('v-inversion').classList.contains('hidden')) return;
        const monthSet = new Set([...AppState.inv.map(r => r.d.slice(0, 7)), ...AppState.invValues.map(v => v.d.slice(0, 7))]);
        const months = [...monthSet].sort();
        const asc = [...AppState.inv].sort((a, b) => a.d.localeCompare(b.d));
        let acc = 0, idx = 0; const cum = [], valSeries = [];
        months.forEach(m => {
            while (idx < asc.length && asc[idx].d.slice(0, 7) <= m) { acc += invFlow(asc[idx]); idx++; }
            cum.push(+acc.toFixed(2));
            const inM = AppState.invValues.filter(v => v.d.slice(0, 7) === m).sort((a, b) => a.d.localeCompare(b.d));
            valSeries.push(inM.length ? inM[inM.length - 1].v : null);
        });
        if (chartInvInstance) chartInvInstance.destroy();
        chartInvInstance = new Chart(document.getElementById('chart-inv').getContext('2d'), {
            type: 'line',
            data: {
                labels: months.map(m => { const [y, mm] = m.split('-'); return `${mm}/${y.slice(2)}`; }),
                datasets: [
                    { label: 'Aportado neto acumulado', data: cum, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)', fill: true, tension: 0.25 },
                    { label: 'Valor de la cartera', data: valSeries, borderColor: '#10b981', backgroundColor: '#10b981', spanGaps: true, tension: 0.25, pointRadius: 4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${formatEur(c.raw)}` } } }, scales: { y: { ticks: { callback: v => v + ' €' } } } }
        });
    }
    
    function setInvSign(v) { AppState.invSign = parseInt(v, 10) === -1 ? -1 : 1; saveState(); renderAllViews(); }
    function addInvValue() {
        const d = document.getElementById('inv-val-date').value;
        const v = parseFloat(document.getElementById('inv-val-amount').value);
        if (!d || isNaN(v)) { showToast('Indica fecha y valor', 'error'); return; }
        AppState.invValues = AppState.invValues.filter(x => x.d !== d);
        AppState.invValues.push({ d, v });
        document.getElementById('inv-val-amount').value = '';
        saveState(); renderAllViews(); showToast('Valor de cartera guardado');
    }
    function deleteInvValue(d) { AppState.invValues = AppState.invValues.filter(x => x.d !== d); saveState(); renderAllViews(); }
    function forgetInvMap() { AppState.invMap = null; saveState(); showToast('Mapeo olvidado: se te preguntará en la próxima importación'); }
    async function wipeInvData() {
        if (!(await askConfirm('¿Borrar todos los movimientos y valores de la cuenta de inversión?'))) return;
        AppState.inv = []; AppState.invValues = []; saveState(); renderAllViews(); showToast('Datos de inversión borrados');
    }
    
    // CSV genérico con comillas y separador autodetectado
    function parseGenericCSV(text) {
        text = text.replace(/^\uFEFF/, '');
        const first = text.split(/\r?\n/).find(l => l.trim()) || '';
        const delim = [';', '\t', ','].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
        const rows = []; let cur = [], f = '', q = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
            else if (ch === '"') q = true;
            else if (ch === delim) { cur.push(f); f = ''; }
            else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; cur.push(f); f = ''; if (cur.some(x => x.trim())) rows.push(cur); cur = []; }
            else f += ch;
        }
        if (f !== '' || cur.length) { cur.push(f); if (cur.some(x => x.trim())) rows.push(cur); }
        const header = (rows.shift() || []).map(h => h.trim());
        return { header, rows };
    }
    
    function setupInvDropZone() {
        const dz = document.getElementById('inv-drop'), fi = document.getElementById('inv-file-input');
        dz.addEventListener('click', () => fi.click());
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('border-brand-500'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('border-brand-500'));
        dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('border-brand-500'); if (e.dataTransfer.files.length) processInvFile(e.dataTransfer.files[0]); });
    }
    function handleInvFile(e) { const f = e.target.files[0]; if (f) processInvFile(f); e.target.value = ''; }
    
    async function processInvFile(file) {
        try {
            const parsed = parseGenericCSV(await file.text());
            if (!parsed.header.length || !parsed.rows.length) { showInvResult('El archivo está vacío o no se pudo leer.', 'error'); return; }
            pendingInv = parsed;
            const m = AppState.invMap;
            if (m && [m.date, m.concept, m.amount].every(h => !h || parsed.header.includes(h)) && m.date && m.amount && (!m.balance || parsed.header.includes(m.balance))) runInvImport(m);
            else showInvMapping();
        } catch (err) { console.error(err); showInvResult('Error al leer el archivo.', 'error'); }
    }
    
    function guessCol(header, regex) { const i = header.findIndex(h => regex.test(norm(h))); return i >= 0 ? header[i] : ''; }
    
    function showInvMapping() {
        const h = pendingInv.header;
        const guess = {
            date: guessCol(h, /FECHA|DATE|OPERACION/),
            concept: guessCol(h, /CONCEPTO|DESCRIP|PRODUCTO|MOVIMIENTO|DETALLE|NOMBRE|TIPO/),
            amount: guessCol(h, /IMPORTE|AMOUNT|EFECTIVO|CANTIDAD/),
            balance: guessCol(h, /SALDO|BALANCE/)
        };
        const sel = (id, label, g, optional) => `<label class="block"><span class="text-slate-500">${label}</span>
            <select id="${id}" class="w-full mt-0.5 py-1 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            ${optional ? '<option value="">— ninguna —</option>' : ''}${h.map(x => `<option value="${esc(x)}" ${x === g ? 'selected' : ''}>${esc(x) || '(vacía)'}</option>`).join('')}</select></label>`;
        document.getElementById('inv-map-selects').innerHTML = sel('map-date', 'Fecha', guess.date) + sel('map-concept', 'Concepto', guess.concept, true) + sel('map-amount', 'Importe', guess.amount) + sel('map-balance', 'Saldo (opcional)', guess.balance, true);
        document.getElementById('inv-map-preview').innerHTML = `<thead><tr>${h.map(x => `<th class="text-left px-2 py-1 text-slate-500">${esc(x)}</th>`).join('')}</tr></thead><tbody>${pendingInv.rows.slice(0, 3).map(r => `<tr>${h.map((_, i) => `<td class="px-2 py-1 whitespace-nowrap">${esc(r[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody>`;
        document.getElementById('inv-map-panel').classList.remove('hidden');
    }
    function cancelInvMapping() { pendingInv = null; document.getElementById('inv-map-panel').classList.add('hidden'); }
    function confirmInvMapping() {
        const m = { date: document.getElementById('map-date').value, concept: document.getElementById('map-concept').value, amount: document.getElementById('map-amount').value, balance: document.getElementById('map-balance').value };
        if (!m.date || !m.amount) { showToast('Fecha e Importe son obligatorios', 'error'); return; }
        AppState.invMap = m;
        runInvImport(m);
    }
    
    function runInvImport(m) {
        const h = pendingInv.header;
        const ci = { d: h.indexOf(m.date), c: m.concept ? h.indexOf(m.concept) : -1, i: h.indexOf(m.amount), s: m.balance ? h.indexOf(m.balance) : -1 };
        const existing = new Set(AppState.inv.map(r => r.k));
        const occ = {}; let added = 0, dup = 0, bad = 0;
        pendingInv.rows.forEach(cols => {
            const d = parseFlexDate(cols[ci.d]), i = parseFlexNum(cols[ci.i]);
            if (!d || isNaN(i)) { bad++; return; }
            const c = ci.c >= 0 ? String(cols[ci.c] || '').trim() : '';
            let s = ci.s >= 0 ? parseFlexNum(cols[ci.s]) : NaN; if (isNaN(s)) s = null;
            let base = [d, i.toFixed(2), norm(c), s == null ? '' : s.toFixed(2)].join('|');
            const n = occ[base] = (occ[base] == null ? 0 : occ[base] + 1);
            const k = n ? `${base}#${n}` : base;
            if (existing.has(k)) { dup++; return; }
            existing.add(k); added++;
            AppState.inv.push({ k, d, c, i, s });
        });
        AppState.inv.sort((a, b) => b.d.localeCompare(a.d));
        pendingInv = null;
        document.getElementById('inv-map-panel').classList.add('hidden');
        saveState(); renderAllViews();
        showInvResult(`Importación completada: <strong>${added} nuevos</strong>, ${dup} duplicados omitidos` + (bad ? `, ${bad} filas ilegibles.` : '.'), added || !bad ? 'success' : 'error');
        showToast(`+${added} movimientos de inversión`);
    }
    
    function showInvResult(msg, type) {
        const el = document.getElementById('inv-result');
        el.className = 'p-3 rounded-xl text-xs font-medium border ' + (type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200');
        el.innerHTML = msg;
    }