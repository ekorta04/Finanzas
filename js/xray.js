/* ==========================================================================
    INFORME X-RAY (Morningstar / MyInvestor) · lectura del PDF
    ========================================================================== */

    // ---------- Parser (puro: recibe los textos del PDF con su posición) ----------
    // pages: [ [ {str, x, y}, ... ], ... ]  (una lista por página)
    const XRAY_MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

    function xrayNum(s) {
        s = String(s == null ? '' : s).trim();
        if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(s)) return NaN;
        return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }

    function parseXRay(pages) {
        const p1 = (pages[0] || []).filter(i => i && String(i.str).trim());
        const p2 = (pages[1] || []).filter(i => i && String(i.str).trim());
        const all = pages.flat().filter(i => i && String(i.str).trim());
        if (!all.some(i => /X-?Ray/i.test(i.str))) throw new Error('Este PDF no parece un informe X-Ray de Morningstar/MyInvestor.');

        // Fecha: "Informe a 6 Nov 2026"
        let d = null;
        for (const it of all) {
            const m = /Informe a (\d{1,2}) ([A-Za-zñÑ]{3})[a-z]*\.? (\d{4})/i.exec(it.str);
            if (m) {
                const mo = XRAY_MONTHS[m[2].toLowerCase()];
                if (mo) { d = `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; break; }
            }
        }

        const near = (items, y, x0, x1, tol = 3) => items.filter(i => Math.abs(i.y - y) <= tol && i.x >= x0 && i.x < x1);
        const numAt = (items, y, x0, x1) => {
            const c = near(items, y, x0, x1).map(i => xrayNum(i.str)).filter(n => !isNaN(n));
            return c.length ? c[0] : NaN;
        };

        // Distribución de activos (columna "Port" ≈ x 230-262)
        const assets = [];
        ['Acciones', 'Obligaciones', 'Efectivo', 'Otro', 'No clasificado'].forEach(n => {
            const lab = p1.find(i => i.x > 165 && i.x < 215 && i.y > 650 && i.y < 725 && i.str.trim() === n);
            if (!lab) return;
            const v = numAt(p1, lab.y, 228, 264);
            if (!isNaN(v)) assets.push({ n, p: v });
        });
        if (!assets.length) throw new Error('No se pudo leer la distribución de activos del informe.');

        // Países (dos bloques de columnas: etiqueta x≈307 / 442, valor x≈365-400 / 500-532)
        const countries = [];
        [[300, 330, 360, 402], [436, 466, 495, 534]].forEach(([lx0, lx1, vx0, vx1]) => {
            p1.filter(i => i.x >= lx0 && i.x < lx1 && i.y > 672 && i.y < 733 && isNaN(xrayNum(i.str)))
                .sort((a, b) => b.y - a.y)
                .forEach(l => {
                    const v = numAt(p1, l.y, vx0, vx1);
                    if (!isNaN(v)) countries.push({ n: l.str.trim(), p: v });
                });
        });

        // Sectores de renta variable (3 columnas con letra-símbolo delante)
        const SUPER = new Set(['Cíclico', 'Sensible al ciclo', 'Defensivo']);
        const sectors = [];
        [[172, 265, 290], [307, 398, 418], [442, 530, 555]].forEach(([px, vx0, vx1]) => {
            const lines = [];
            p1.filter(i => i.x >= px - 1 && i.x < px + 95 && i.y > 380 && i.y < 462)
                .sort((a, b) => b.y - a.y || a.x - b.x)
                .forEach(i => {
                    if (i.x < px + 5 && i.str.trim().length === 1) { lines.push({ y: i.y, text: '', pre: true }); return; }
                    const last = lines[lines.length - 1];
                    if (last && Math.abs(last.y - i.y) <= 3 && !last.text) { last.text = i.str.trim(); return; }
                    if (last && last.text && Math.abs(last.y - i.y) <= 3) { last.text += ' ' + i.str.trim(); return; }
                    // continuación de la fila anterior (sin letra delante)
                    if (last && i.y < last.y && last.y - i.y < 14) { last.text += ' ' + i.str.trim(); return; }
                });
            lines.forEach(l => {
                if (!l.text || SUPER.has(l.text)) return;
                const v = numAt(p1, l.y, vx0, vx1);
                if (!isNaN(v)) sectors.push({ n: l.text, p: v });
            });
        });

        // 10 principales posiciones subyacentes
        const top = [];
        p1.filter(i => i.x >= 40 && i.x < 76 && i.y > 100 && i.y < 222 && !isNaN(xrayNum(i.str)))
            .sort((a, b) => b.y - a.y)
            .forEach(w => {
                const txt = (x0, x1) => near(p1, w.y, x0, x1).sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(' ');
                const n = txt(76, 300);
                if (n) top.push({ n, p: xrayNum(w.str), t: txt(300, 385), s: txt(385, 470), c: txt(470, 600) });
            });

        // Fondos de la cartera (página 2: nombre / peso)
        const funds = [];
        p2.filter(i => i.x >= 190 && i.x < 228 && i.y > 125 && i.y < 215 && !isNaN(xrayNum(i.str)))
            .sort((a, b) => b.y - a.y)
            .forEach(w => {
                const n = near(p2, w.y, 44, 190).sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(' ');
                if (n) funds.push({ n, p: xrayNum(w.str) });
            });

        // Rentabilidad acumulada de la cartera (página 2)
        const rent = {};
        [['3 meses', 'm3'], ['6 meses', 'm6'], ['1 año', 'y1'], ['3 Años Anualizado', 'y3'], ['5 Años Anualizado', 'y5'], ['Año', 'ytd']].forEach(([lab, key]) => {
            const l = p2.find(i => i.x < 100 && i.y > 430 && i.y < 505 && i.str.trim() === lab);
            if (!l) return;
            const v = numAt(p2, l.y, 232, 262);
            if (!isNaN(v)) rent[key] = v;
        });

        return { d, assets, countries, sectors, top, funds, rent };
    }

    // ---------- Lectura del PDF en el navegador (pdf.js se carga solo al subir un informe) ----------
    let xrayPdfPromise = null;
    function xrayLoadPdfJs() {
        if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
        if (!xrayPdfPromise) {
            xrayPdfPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'vendor/pdfjs/pdf.min.js';
                s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; resolve(window.pdfjsLib); };
                s.onerror = () => { xrayPdfPromise = null; reject(new Error('No se pudo cargar el lector de PDF. Comprueba la conexión e inténtalo de nuevo.')); };
                document.head.appendChild(s);
            });
        }
        return xrayPdfPromise;
    }

    async function readXRayPdf(file) {
        const lib = await xrayLoadPdfJs();
        const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        try {
            const pages = [];
            for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
                const tc = await (await doc.getPage(n)).getTextContent();
                pages.push(tc.items.filter(i => i.str && i.str.trim()).map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5] })));
            }
            return parseXRay(pages);
        } finally { doc.destroy(); }
    }

    function setupXRayDropZone() {
        const dz = document.getElementById('xray-drop');
        if (!dz || dz.dataset.ready) return;
        dz.dataset.ready = '1';
        dz.addEventListener('click', () => document.getElementById('xray-file-input').click());
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
        dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files.length) processXRayFile(e.dataTransfer.files[0]); });
    }
    function handleXRayFile(e) { const f = e.target.files[0]; if (f) processXRayFile(f); e.target.value = ''; }

    function showXRayResult(msg, type) {
        const el = document.getElementById('xray-result');
        el.className = 'result mt-2 ' + (type === 'success' ? 'ok' : 'err');
        el.innerHTML = msg;
    }

    async function processXRayFile(file) {
        const res = document.getElementById('xray-result');
        res.className = 'hidden';
        showToast('Leyendo informe…');
        let rep;
        try { rep = await readXRayPdf(file); }
        catch (err) { console.error(err); showXRayResult(esc(err.message || 'No se pudo leer el PDF.'), 'error'); return; }
        if (!rep.d) { showXRayResult('No encuentro la fecha del informe ("Informe a …").', 'error'); return; }
        const total = await promptXRayTotal(rep);
        if (total == null) return;
        saveXRay(rep, total);
        showXRayResult(`Informe del <strong>${formatDateEs(rep.d)}</strong> guardado con un valor de <strong>${formatEur(total)}</strong>.`, 'success');
        showToast('Inversión actualizada');
    }

    function saveXRay(rep, total) {
        const snap = { d: rep.d, v: total, assets: rep.assets, countries: rep.countries, sectors: rep.sectors, top: rep.top, funds: rep.funds, rent: rep.rent };
        AppState.invXray = (AppState.invXray || []).filter(x => x.d !== snap.d).concat(snap).sort((a, b) => a.d.localeCompare(b.d)).slice(-36);
        AppState.invValues = AppState.invValues.filter(x => x.d !== snap.d);
        AppState.invValues.push({ d: snap.d, v: total });
        saveState(); renderAllViews();
    }

    function deleteXRay(d) {
        AppState.invXray = (AppState.invXray || []).filter(x => x.d !== d);
        saveState(); renderAllViews();
    }

    // Ventana: resumen del informe + valor total de la cartera
    function promptXRayTotal(rep) {
        return new Promise(resolve => {
            const modal = document.getElementById('xray-modal');
            const sumEl = document.getElementById('xray-summary');
            const inEl = document.getElementById('xray-total');
            const errEl = document.getElementById('xray-error');
            const okBtn = document.getElementById('xray-ok');
            const cancelBtn = document.getElementById('xray-cancel');
            const eq = rep.assets.find(a => a.n === 'Acciones');
            const prev = [...AppState.invValues].sort((a, b) => a.d.localeCompare(b.d)).pop();
            sumEl.innerHTML = `Informe del <strong>${formatDateEs(rep.d)}</strong><br>`
                + `${rep.funds.length} fondos · ${rep.countries.length} países · ${rep.sectors.length} sectores`
                + (eq ? `<br>Renta variable: ${fmtPct(eq.p)}` : '');
            inEl.value = '';
            inEl.placeholder = prev ? `Último: ${prev.v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'p. ej. 10250,40';
            errEl.textContent = '';
            modal.classList.remove('hidden');
            setTimeout(() => inEl.focus(), 50);

            const done = v => {
                modal.classList.add('hidden');
                okBtn.onclick = cancelBtn.onclick = inEl.onkeydown = null;
                resolve(v);
            };
            const submit = () => {
                const v = parseFlexNum(inEl.value);
                if (isNaN(v) || v <= 0) { errEl.textContent = 'Escribe el valor total de tu cartera en euros.'; return; }
                done(Math.round(v * 100) / 100);
            };
            okBtn.onclick = submit;
            cancelBtn.onclick = () => done(null);
            inEl.onkeydown = e => { if (e.key === 'Enter') submit(); else if (e.key === 'Escape') done(null); };
        });
    }

    // ---------- Pantalla: composición de la cartera ----------
    function fmtPct(n) { return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %'; }
    function fmtEurShort(n) { return Math.round(n).toLocaleString('es-ES') + ' €'; }

    function xrayBarRow(name, p, total, sub, delta) {
        const w = Math.max(0, Math.min(100, p));
        const eur = total ? ` · ≈ ${fmtEurShort(total * p / 100)}` : '';
        const dl = delta == null || Math.abs(delta) < 0.05 ? '' : ` <span class="${delta > 0 ? 'pos' : 'red'}">${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1).replace('.', ',')} pt</span>`;
        return `<div class="row" style="display:block">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
                <span class="row-title truncate">${esc(name)}</span>
                <span class="num small" style="white-space:nowrap">${fmtPct(p)}${eur}${dl}</span>
            </div>
            <div class="xbar"><span style="width:${w}%"></span></div>
            ${sub ? `<div class="row-sub">${esc(sub)}</div>` : ''}
        </div>`;
    }

    function renderXRay() {
        const card = document.getElementById('xray-card');
        if (!card) return;
        const list = AppState.invXray || [];
        card.classList.toggle('hidden', !list.length);
        if (!list.length) return;
        const cur = list[list.length - 1], prev = list.length > 1 ? list[list.length - 2] : null;
        const delta = (key, n) => {
            if (!prev) return null;
            const o = (prev[key] || []).find(x => x.n === n);
            return o ? cur[key].find(x => x.n === n).p - o.p : null;
        };
        const eq = cur.assets.find(a => a.n === 'Acciones');
        const eqBase = eq && eq.p > 0 ? cur.v * eq.p / 100 : cur.v;   // países y sectores son % de la parte en acciones
        const sect = (title, rows) => rows ? `<h3 class="group-header">${title}</h3><div class="group">${rows}</div>` : '';
        const rentLabels = [['m3', '3 meses'], ['m6', '6 meses'], ['y1', '1 año'], ['y3', '3 años (anual.)'], ['y5', '5 años (anual.)'], ['ytd', 'Este año']];
        const rentRows = rentLabels.filter(([k]) => cur.rent && cur.rent[k] != null)
            .map(([k, l]) => `<div class="row"><span class="row-main row-title">${l}</span><span class="bold num ${cur.rent[k] >= 0 ? 'pos' : 'red'}">${cur.rent[k] > 0 ? '+' : ''}${fmtPct(cur.rent[k])}</span></div>`).join('');

        document.getElementById('xray-body').innerHTML =
            `<p class="xsmall muted" style="margin:0 0 8px">Informe del ${formatDateEs(cur.d)} · valor ${formatEur(cur.v)}${prev ? ` · cambios frente al ${formatDateEs(prev.d)}` : ''}</p>`
            + sect('Reparto por tipo de activo', cur.assets.filter(a => Math.abs(a.p) >= 0.005).map(a => xrayBarRow(a.n, a.p, cur.v, '', delta('assets', a.n))).join(''))
            + sect('Fondos', cur.funds.map(f => xrayBarRow(f.n, f.p, cur.v, '', delta('funds', f.n))).join(''))
            + sect('Países (renta variable)', cur.countries.map(c => xrayBarRow(c.n, c.p, eqBase, '', delta('countries', c.n))).join(''))
            + sect('Sectores (renta variable)', [...cur.sectors].sort((a, b) => b.p - a.p).map(s => xrayBarRow(s.n, s.p, eqBase, '', delta('sectors', s.n))).join(''))
            + sect('Mayores posiciones', cur.top.map(t => xrayBarRow(t.n, t.p, cur.v, [t.t, t.s, t.c].filter(Boolean).join(' · '), null)).join(''))
            + sect('Rentabilidad según el informe', rentRows)
            + `<p class="group-footer">Los importes en € son aproximados: peso del informe × valor total que indicaste (países y sectores, sobre la parte en acciones).</p>`
            + `<button class="row destructive" style="justify-content:flex-start" onclick="deleteXRay('${cur.d}')">Quitar este informe</button>`;
    }
