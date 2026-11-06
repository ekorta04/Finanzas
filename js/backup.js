/* ==========================================================================
    14. BACKUP Y SYNC
    ========================================================================== */
    function exportBackupJSON() {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(AppState)], { type: 'application/json' }));
        a.download = `finanzas_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        showToast('Backup descargado');
    }
    async function importBackupJSON(e) {
        try {
            const file = e.target.files[0]; if (!file) return;
            const json = JSON.parse(await file.text());
            if (!json.rows || !Array.isArray(json.rows)) throw new Error('Formato no válido');
            AppState = normalizeState(json);
            saveState(); renderAllViews();
            showToast('Copia de seguridad restaurada con éxito');
        } catch (err) { showToast('Archivo JSON de backup no válido', 'error'); }
        e.target.value = '';
    }
    async function wipeAllData() {
        if (!(await askConfirm('¿Seguro que quieres BORRAR TODOS los datos (movimientos, etiquetas, reglas, inversión)? No se puede deshacer.'))) return;
        AppState = defaultState(); saveState(); renderAllViews(); showToast('Todos los datos han sido borrados');
    }