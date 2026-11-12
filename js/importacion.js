/* ==========================================================================
    13. IMPORTACIÓN KUTXA
    ========================================================================== */
    function setupDropZone() {
        const dz = document.getElementById('drop-zone'), fi = document.getElementById('csv-file-input');
        dz.addEventListener('click', () => fi.click());
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
        dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files.length) processCSVFile(e.dataTransfer.files[0]); });
        setupGlobalDrop();
    }
    function handleFileSelect(e) { if (e.target.files.length) processCSVFile(e.target.files[0]); e.target.value = ''; }

    // Soltar el CSV en cualquier pestaña: se va a Datos y se prepara la importación
    function setupGlobalDrop() {
        const overlay = document.getElementById('drop-overlay');
        if (!overlay || overlay.dataset.ready) return;
        overlay.dataset.ready = '1';
        const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
        const inOwnZone = e => e.target.closest && e.target.closest('.drop');   // X-Ray e Inversión tienen su zona
        const loggedIn = () => !document.getElementById('app-root').classList.contains('hidden');
        let depth = 0;
        window.addEventListener('dragenter', e => {
            if (!hasFiles(e) || !loggedIn()) return;
            depth++;
            if (!inOwnZone(e)) overlay.classList.remove('hidden');
        });
        window.addEventListener('dragover', e => {
            if (!hasFiles(e)) return;
            e.preventDefault();   // si no, el navegador abriría el archivo y saldría de la app
            overlay.classList.toggle('hidden', !loggedIn() || !!inOwnZone(e));
        });
        window.addEventListener('dragleave', e => {
            if (!hasFiles(e)) return;
            depth = Math.max(0, depth - 1);
            if (!depth) overlay.classList.add('hidden');
        });
        window.addEventListener('drop', e => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth = 0;
            overlay.classList.add('hidden');
            if (!loggedIn() || inOwnZone(e)) return;
            const file = e.dataTransfer.files[0];
            if (!file) return;
            if (/\.csv$|\.txt$/i.test(file.name) || /csv/.test(file.type)) { switchTab('v-datos'); processCSVFile(file); }
            else if (/\.pdf$/i.test(file.name)) showToast('Los informes X-Ray se suben en la pestaña Inversión', 'error');
            else showToast('Suelta el CSV de Laboral Kutxa', 'error');
        });
    }

    // Los movimientos se guardan en la base de datos (Supabase),
    // en la cuenta seleccionada. Los duplicados los omite el servidor.
    // Primero se enseña una vista previa y solo se guarda al confirmar.
    let csvImporting = false;
    let pendingImport = null;   // { file, account, fresh, exact, similar, badRows }

    function hideImportPreview() {
        pendingImport = null;
        const el = document.getElementById('import-preview');
        if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
    }

    async function processCSVFile(file) {
        if (csvImporting) return;
        csvImporting = true;
        hideImportPreview();
        showImportResult('Leyendo el archivo…', 'success');

        try {
            const { parsedRows, badRows } = parseLaboralKutxaCSV(await file.text());
            if (!parsedRows.length) { showImportResult('No se encontraron movimientos válidos en el archivo.', 'error'); return; }

            const session = await getStoredSession();
            if (!session) { showLoginScreen(); return; }

            const { account } = await resolveActiveAccount(session.user.id, true);
            window.activeSupabaseAccountId = account.id;

            const rowsWithKeys = parsedRows.map(r => ({ ...r, k: generateRowKey(r) }));

            // Se compara con lo guardado por fecha + importe + concepto, no solo por la clave:
            // así un movimiento que llega con otro saldo o texto no se guarda dos veces.
            const existing = await getAllAccountTransactions(account.id);
            const { exact, similar, fresh } = splitRepeatedRows(existing, rowsWithKeys);

            // Sin nada nuevo no hay que decidir: se registra y se cuenta
            if (!fresh.length) { await commitImport({ file, account, fresh, exact, similar, badRows }); return; }

            const gap = analyzeImportGap(
                existing.map(t => ({ d: t.operation_date, i: Number(t.amount), s: t.balance == null ? null : Number(t.balance) })),
                parsedRows);
            pendingImport = { file, account, fresh, exact, similar, badRows, gap, allRows: parsedRows };
            renderImportPreview();
            document.getElementById('import-result').classList.add('hidden');
        } catch (err) {
            console.error(err);
            showImportResult('Error al importar: ' + esc(describeSupabaseError(err)), 'error');
        } finally {
            csvImporting = false;
        }
    }

    // Mensaje sobre si el archivo encaja con lo que ya hay guardado
    function importGapHtml(g) {
        if (g.status === 'gap') {
            return `<div class="import-flag warn"><i class="ic ic-triangle-alert"></i><span>Faltan movimientos entre el <b>${formatDateEs(g.from)}</b> y el <b>${formatDateEs(g.to)}</b>: el saldo no cuadra en <b class="priv">${formatEur(Math.abs(g.diff))}</b>. Descarga un CSV que incluya esas fechas (o este archivo es de otra cuenta).</span></div>`;
        }
        if (g.status === 'contiguous') return '<div class="import-flag ok"><i class="ic ic-circle-check"></i><span>Encaja con lo que ya tenías: los saldos cuadran, no falta nada.</span></div>';
        if (g.status === 'overlap') return '<div class="import-flag ok"><i class="ic ic-circle-check"></i><span>Se solapa con lo que ya tenías: solo se guardan los movimientos nuevos.</span></div>';
        if (g.status === 'first') return '<div class="import-flag ok"><i class="ic ic-circle-check"></i><span>Primera importación en esta cuenta.</span></div>';
        return '';
    }

    function renderImportPreview() {
        const el = document.getElementById('import-preview');
        const pi = pendingImport;
        if (!el || !pi) return;
        const dates = pi.allRows.map(r => r.d).sort();
        const unclassified = pi.fresh.filter(r => classifyConcept(r.c, AppState.rules) === 'Sin clasificar').length;
        const dup = pi.exact.length + pi.similar.length;
        const sample = [...pi.fresh].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 5);
        const stat = (n, label) => `<div class="import-stat"><div class="import-stat-n">${n}</div><div class="import-stat-l">${label}</div></div>`;
        const gapBad = pi.gap.status === 'gap';
        el.innerHTML = `
            <div class="card import-card">
                <div class="bold" style="font-size:16px">Vista previa</div>
                <div class="small muted" style="margin:2px 0 12px;word-break:break-word">${esc(pi.file.name)} · ${formatDateEs(dates[0])} – ${formatDateEs(dates[dates.length - 1])} · ${esc(pi.account.name)}</div>
                <div class="import-stats">
                    ${stat(pi.fresh.length, pi.fresh.length === 1 ? 'nuevo' : 'nuevos')}
                    ${stat(dup, dup === 1 ? 'repetido' : 'repetidos')}
                    ${stat(unclassified, 'sin clasificar')}
                </div>
                ${importGapHtml(pi.gap)}
                ${pi.badRows ? `<div class="small muted" style="margin-top:8px">${pi.badRows} ${pi.badRows === 1 ? 'fila ilegible' : 'filas ilegibles'} que no se importarán.</div>` : ''}
                <h3 class="group-header" style="margin-top:14px">Los más recientes</h3>
                <div class="group">${sample.map(r => `
                    <div class="row"><span class="row-main"><span class="row-title" style="display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.c)}</span>
                    <span class="row-sub" style="display:block">${formatDateEs(r.d)}</span></span>
                    <span class="row-value num priv ${r.i > 0 ? 'pos' : ''}" style="font-size:15px">${r.i > 0 ? '+' : ''}${formatEur(r.i)}</span></div>`).join('')}
                </div>
                ${pi.fresh.length > sample.length ? `<div class="small muted" style="margin-top:6px">y ${pi.fresh.length - sample.length} más</div>` : ''}
                <div class="import-actions">
                    <button type="button" class="btn ${gapBad ? 'gray' : ''}" onclick="confirmImport()">${gapBad ? 'Guardar igualmente' : `Guardar ${pi.fresh.length} ${pi.fresh.length === 1 ? 'movimiento' : 'movimientos'}`}</button>
                    <button type="button" class="btn ${gapBad ? '' : 'gray'}" onclick="cancelImport()">Cancelar</button>
                </div>
            </div>`;
        el.classList.remove('hidden');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function cancelImport() {
        hideImportPreview();
        showImportResult('Importación cancelada: no se ha guardado nada.', 'success');
    }

    async function confirmImport() {
        if (!pendingImport || csvImporting) return;
        const pi = pendingImport;
        csvImporting = true;
        hideImportPreview();
        showImportResult('Guardando movimientos…', 'success');
        try { await commitImport(pi); }
        finally { csvImporting = false; }
    }

    // Va a Movimientos con solo lo que falta por clasificar
    function goClassifyNew() { switchTab('v-movs'); filterUnclassified(); }

    async function commitImport({ file, account, fresh, exact, similar, badRows }) {
        try {
            const result = fresh.length
                ? await importBankCSV(account.id, file.name, fresh, badRows)
                : { imported_rows: 0, duplicate_rows: 0, error_rows: badRows };

            const added = (result && result.imported_rows) || 0;
            const dup = ((result && result.duplicate_rows) || 0) + exact.length + similar.length;
            const errs = ((result && result.error_rows) || 0);

            await loadUserDashboard({ keepTab: true });

            AppState.imports.push({ at: new Date().toLocaleString('es-ES'), added, dup });
            saveState();
            renderImportHistory();

            const newKeys = new Set(fresh.map(r => r.k));
            const unc = added ? AppState.rows.filter(r => newKeys.has(r.k) && r.cat === 'Sin clasificar').length : 0;
            const sug = BizumSugg.length;
            showImportResult(`<b>${added} ${added === 1 ? 'movimiento nuevo' : 'movimientos nuevos'}</b> en ${esc(account.name)}` + (dup ? ` · ${dup} repetidos omitidos` + (similar.length ? ` (${similar.length} con otro saldo o texto)` : '') : '') + (errs ? ` · ${errs} filas ilegibles` : '') + (sug ? `<br>Hay ${sug} ${sug === 1 ? 'gasto compartido' : 'gastos compartidos'} para agrupar en Resumen.` : '')
                + (unc ? `<div class="import-actions"><button type="button" class="btn sm" onclick="goClassifyNew()">Clasificar ${unc} ${unc === 1 ? 'nuevo' : 'nuevos'}</button></div>` : ''), 'success');
            showToast(added ? `${added} movimientos importados` : 'No había movimientos nuevos');
        } catch (err) {
            console.error(err);
            showImportResult('Error al importar: ' + esc(describeSupabaseError(err)), 'error');
        }
    }
    function showImportResult(msg, type) {
        const el = document.getElementById('import-result');
        el.className = 'result mt-2 ' + (type === 'success' ? 'ok' : 'err');
        el.innerHTML = msg;
    }
    function renderImportHistory() {
        const tb = document.getElementById('import-history-body');
        if (!AppState.imports.length) { tb.innerHTML = `<div class="row"><span class="muted small">Todavía no has importado nada.</span></div>`; return; }
        tb.innerHTML = AppState.imports.slice(-5).reverse().map(i => `
            <div class="row">
                <div class="row-main"><div class="row-title" style="font-size:15px">${esc(i.at)}</div><div class="row-sub">${i.dup} repetidos omitidos</div></div>
                <span class="bold pos num">+${i.added}</span>
            </div>`).join('');
    }