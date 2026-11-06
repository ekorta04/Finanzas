/* ==========================================================================
    13. IMPORTACIÓN KUTXA
    ========================================================================== */
    function setupDropZone() {
        const dz = document.getElementById('drop-zone'), fi = document.getElementById('csv-file-input');
        dz.addEventListener('click', () => fi.click());
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('border-brand-500'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('border-brand-500'));
        dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('border-brand-500'); if (e.dataTransfer.files.length) processCSVFile(e.dataTransfer.files[0]); });
    }
    function handleFileSelect(e) { if (e.target.files.length) processCSVFile(e.target.files[0]); e.target.value = ''; }
    
    async function processCSVFile(file) {
        try {
            const { parsedRows, badRows } = parseLaboralKutxaCSV(await file.text());
            if (!parsedRows.length) { showImportResult('No se encontraron movimientos válidos en el archivo.', 'error'); return; }
            const { addedCount, dupCount } = mergeIncomingRows(parsedRows);
            AppState.imports.push({ at: new Date().toLocaleString('es-ES'), added: addedCount, dup: dupCount });
            saveState(); renderAllViews();
            const sug = BizumSugg.length;
            showImportResult(`Importación completada: <strong>${addedCount} nuevos movimientos añadidos</strong>, ${dupCount} duplicados omitidos` + (badRows ? `, ${badRows} filas ilegibles.` : '.') + (sug ? ` <strong>${sug} sugerencia(s) de vinculación Bizum</strong> te esperan arriba.` : ''), 'success');
            showToast(`+${addedCount} movimientos importados`);
        } catch (err) { console.error(err); showImportResult('Error al leer el archivo CSV.', 'error'); }
    }
    function showImportResult(msg, type) {
        const el = document.getElementById('import-result');
        el.className = 'p-4 rounded-xl text-xs font-medium border ' + (type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200');
        el.innerHTML = msg;
    }
    function renderImportHistory() {
        const tb = document.getElementById('import-history-body');
        if (!AppState.imports.length) { tb.innerHTML = `<tr><td colspan="3" class="py-3 text-center text-slate-400">Sin historial de importaciones.</td></tr>`; return; }
        tb.innerHTML = AppState.imports.slice(-5).reverse().map(i => `
            <tr><td class="py-2 px-3 text-slate-600 dark:text-slate-400">${i.at}</td>
            <td class="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">+${i.added}</td>
            <td class="py-2 px-3 text-right text-slate-400">${i.dup}</td></tr>`).join('');
    }