/* ==========================================================================
    2. UTILIDADES
    ========================================================================== */
    const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const parseNum = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
    const parseIsoDate = s => { const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
    const formatEur = n => (n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
    const formatDateEs = iso => iso ? iso.split('-').reverse().join('/') : '';
    const generateRowKey = r => [r.d, r.i.toFixed(2), r.s.toFixed(2), norm(r.c)].join('|');
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const enc = k => encodeURIComponent(k);
    const isBizum = r => norm(r.c).includes('BIZUM');
    const addDays = (iso, n) => { const dt = new Date(iso + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); };
    const byKeyMap = () => new Map(AppState.rows.map(r => [r.k, r]));
    const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
    const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m = 1..12
    // Suma n meses a una fecha ISO. Con "dom" fija el día del mes (recortado al último día del mes).
    const addMonthsIso = (iso, n, dom) => {
        let y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1 + n;
        y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
        const d = Math.min(dom || Number(iso.slice(8, 10)), daysInMonth(y, m + 1));
        return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    };
    const shiftYear = (iso, n) => addMonthsIso(iso, 12 * n);   // el 29 de febrero pasa al 28
    
    // Parseo flexible para la cuenta de inversión
    function parseFlexDate(s) {
        s = String(s || '').trim();
        let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
        if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
        if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
        return '';
    }
    function parseFlexNum(s) {
        s = String(s == null ? '' : s).replace(/[^\d,.\-+]/g, '');
        if (!s || s === '-' || s === '+') return NaN;
        const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
        if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
        else if (lc >= 0) s = s.replace(',', '.');
        else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
        return parseFloat(s);
    }
    // "2026-11" -> "Noviembre 2026"
    const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const monthName = ym => { const [y, m] = ym.split('-'); return `${MONTHS_ES[Number(m) - 1]} ${y}`; };
    // "2026-11-05" -> "5 nov"
    const shortDate = iso => { if (!iso) return ''; const [, m, d] = iso.split('-'); return `${Number(d)} ${MONTHS_ES[Number(m) - 1].slice(0, 3).toLowerCase()}`; };

    // Icono y color de cada categoría (colores del sistema iOS)
    const CATEGORY_STYLE = {
        'Bizum y transferencias': ['arrow-left-right', '--teal'],
        'Inversión': ['trending-up', '--indigo'],
        'Otros': ['circle-ellipsis', '--gray'],
        'Sin clasificar': ['circle-help', '--gray']
    };
    const customCatStyle = c => { const x = (AppState.customCats || []).find(k => k.n === c); return x ? [x.ic, x.col] : null; };
    const treeCatStyle = c => {
        const main = CAT_TREE.find(m => m.n === catGroup(c));
        if (!main) return null;
        const sub = main.subs.find(x => main.n + CAT_SEP + x[0] === c);
        return [sub ? sub[1] : main.ic, main.col];
    };
    const catStyle = c => treeCatStyle(c) || CATEGORY_STYLE[c] || customCatStyle(c) || ['circle-ellipsis', '--gray'];
    // Texto corto de una categoría: la subcategoría, o la principal
    const catLabel = c => { const i = String(c).indexOf(CAT_SEP); return i < 0 ? c : c.slice(i + CAT_SEP.length); };
    // <option> agrupados por categoría principal (para los selectores)
    const catOptionsHtml = (exclude = []) => {
        const o = (v, t) => exclude.includes(v) ? '' : `<option value="${esc(v)}">${esc(t)}</option>`;
        const groups = CAT_TREE.map(m => `<optgroup label="${esc(m.n)}">${o(m.n, m.n + ' (general)')}${m.subs.map(s => o(m.n + CAT_SEP + s[0], s[0])).join('')}</optgroup>`);
        const others = CATEGORIES.filter(c => !BASE_CATEGORIES.includes(c) || SPECIAL_CATS.includes(c) || c === 'Otros' || c === 'Sin clasificar');
        groups.push(`<optgroup label="Otras">${others.map(c => o(c, c)).join('')}</optgroup>`);
        return groups.join('');
    };
    const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#8e8e93';
    const catIcon = (c, round = true) => { const [ic, col] = catStyle(c); return `<span class="icon-tile${round ? ' round' : ''}" style="background:var(${col})"><i class="ic ic-${ic}"></i></span>`; };
