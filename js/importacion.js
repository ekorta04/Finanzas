/* ==========================================================================
    13. IMPORTACIÓN KUTXA
    ========================================================================== */
    function setupDropZone() {
        const dz = document.getElementById('drop-zone'), fi = document.getElementById('csv-file-input');
        dz.addEventListener('click', () => fi.click());
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
        dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files.length) processCSVFile(e.dataTransfer.files[0]); });
    }
    function handleFileSelect(e) { if (e.target.files.length) processCSVFile(e.target.files[0]); e.target.value = ''; }
    
    // Los movimientos se guardan en la base de datos (Supabase),
    // en la cuenta seleccionada. Los duplicados los omite el servidor.
    let csvImporting = false;

    async function processCSVFile(file) {
        if (csvImporting) return;
        csvImporting = true;
        showImportResult('Importando movimientos…', 'success');

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

            const sug = BizumSugg.length;
            showImportResult(`<b>${added} ${added === 1 ? 'movimiento nuevo' : 'movimientos nuevos'}</b> en ${esc(account.name)}` + (dup ? ` · ${dup} repetidos omitidos` + (similar.length ? ` (${similar.length} con otro saldo o texto)` : '') : '') + (errs ? ` · ${errs} filas ilegibles` : '') + (sug ? `<br>Hay ${sug} ${sug === 1 ? 'gasto compartido' : 'gastos compartidos'} para agrupar en Resumen.` : ''), 'success');
            showToast(added ? `${added} movimientos importados` : 'No había movimientos nuevos');
        } catch (err) {
            console.error(err);
            showImportResult('Error al importar: ' + esc(describeSupabaseError(err)), 'error');
        } finally {
            csvImporting = false;
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