/* ==========================================================================
    4. CSV LABORAL KUTXA
    ========================================================================== */
    // Separa por ';' respetando los campos entre comillas (Excel los usa cuando el texto lleva ';' o comillas)
    function splitCsvLine(line) {
        const out = []; let cur = '', q = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (q) {
                if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (ch === '"') q = false;
                else cur += ch;
            } else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
            else if (ch === ';') { out.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        out.push(cur.trim());
        return out;
    }

    function parseLaboralKutxaCSV(text) {
        text = text.replace(/^\uFEFF/, '');
        const lines = text.split(/\r?\n/);
        const parsedRows = []; let badRows = 0;
        for (let n = 1; n < lines.length; n++) {
            const line = lines[n].trim();
            if (!line) continue;
            const cols = splitCsvLine(line);
            if (cols.length < 6 || !cols[1].trim()) continue;
            const fechaOp = parseIsoDate(cols[1]);
            const fechaVal = parseIsoDate(cols[2]) || fechaOp;
            const importe = parseNum(cols[4]);
            const saldo = parseNum(cols[5]);
            if (!fechaOp || isNaN(importe) || isNaN(saldo)) { badRows++; continue; }
            parsedRows.push({ d: fechaOp, v: fechaVal, c: cols[3].trim(), i: importe, s: saldo });
        }
        return { parsedRows, badRows };
    }
    
    function classifyConcept(concept, rules) {
        const n = norm(concept);
        for (const r of rules) if (n.includes(norm(r.p))) return r.c;
        return 'Sin clasificar';
    }
    
    function mergeIncomingRows(incomingRows) {
        const existingKeys = new Set(AppState.rows.map(r => r.k));
        let addedCount = 0, dupCount = 0;
        for (const r of incomingRows) {
            const k = generateRowKey(r);
            if (existingKeys.has(k)) { dupCount++; continue; }
            existingKeys.add(k); addedCount++;
            AppState.rows.push({ k, d: r.d, v: r.v, c: r.c, i: r.i, s: r.s, cat: classifyConcept(r.c, AppState.rules), man: false });
        }
        AppState.rows.sort((a, b) => b.d.localeCompare(a.d) || b.s - a.s);
        return { addedCount, dupCount };
    }