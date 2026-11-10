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
        'Restauración': ['utensils', '--orange'],
        'Supermercado': ['shopping-cart', '--green'],
        'Compras online': ['package', '--indigo'],
        'Ocio': ['ticket', '--pink'],
        'Transporte': ['car', '--blue'],
        'Hogar': ['house', '--brown'],
        'Salud': ['heart-pulse', '--red'],
        'Suscripciones': ['repeat', '--purple'],
        'Nómina': ['briefcase', '--mint'],
        'Bizum y transferencias': ['arrow-left-right', '--teal'],
        'Inversión': ['trending-up', '--indigo'],
        'Banco': ['landmark', '--gray'],
        'Otros': ['circle-ellipsis', '--gray'],
        'Sin clasificar': ['circle-help', '--gray']
    };
    const customCatStyle = c => { const x = (AppState.customCats || []).find(k => k.n === c); return x ? [x.ic, x.col] : null; };
    const catStyle = c => CATEGORY_STYLE[c] || customCatStyle(c) || ['circle-ellipsis', '--gray'];
    const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#8e8e93';
    const catIcon = (c, round = true) => { const [ic, col] = catStyle(c); return `<span class="icon-tile${round ? ' round' : ''}" style="background:var(${col})"><i class="ic ic-${ic}"></i></span>`; };
