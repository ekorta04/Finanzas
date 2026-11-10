/* ==========================================================================
    1. ESTADO
    ========================================================================== */
const STORAGE_KEY = 'finanzas_kutxa_v2';

const BASE_CATEGORIES = ['Restauración','Supermercado','Compras online','Ocio','Transporte','Hogar','Salud','Suscripciones','Nómina','Bizum y transferencias','Inversión','Banco','Otros','Sin clasificar'];
const CATEGORIES = BASE_CATEGORIES.slice();

// Iconos y colores que se pueden elegir al crear una categoría propia
const CAT_ICONS = ['wallet','piggy-bank','coins','receipt','store','shopping-cart','car','house','heart-pulse','zap','sparkles','users','ticket','briefcase','lightbulb','tag','utensils','package'];
const CAT_COLORS = ['--blue','--green','--red','--orange','--yellow','--indigo','--purple','--pink','--teal','--brown','--mint','--gray'];

// Las categorías propias se colocan antes de "Otros" y "Sin clasificar".
// Se modifica la lista CATEGORIES en el sitio para que todo el código la vea.
function applyCustomCategories(list) {
    const tail = ['Otros', 'Sin clasificar'];
    const head = BASE_CATEGORIES.filter(c => !tail.includes(c));
    const custom = (Array.isArray(list) ? list : [])
        .map(c => c && c.n)
        .filter(n => n && !BASE_CATEGORIES.includes(n));
    CATEGORIES.length = 0;
    CATEGORIES.push(...head, ...custom, ...tail);
}

const DEFAULT_RULES = [
    { p: 'ALBIA KAFE', c: 'Restauración' }, { p: 'KEBAB', c: 'Restauración' }, { p: 'PIZZERIA', c: 'Restauración' },
    { p: 'RESTAURANTE', c: 'Restauración' }, { p: 'ASADOS', c: 'Restauración' },
    { p: 'EROSKI', c: 'Supermercado' }, { p: 'MERCADONA', c: 'Supermercado' }, { p: 'CARREFOUR', c: 'Supermercado' },
    { p: 'AMAZON', c: 'Compras online' }, { p: 'AMZN', c: 'Compras online' },
    { p: 'INVERSION', c: 'Inversión' }, { p: 'BONIFICACION COMISIONES', c: 'Banco' },
    { p: 'TRF.', c: 'Bizum y transferencias' }, { p: 'BIZUM', c: 'Bizum y transferencias' },
    { p: 'NOMINA', c: 'Nómina' }, { p: 'SALARIO', c: 'Nómina' },
    { p: 'NETFLIX', c: 'Suscripciones' }, { p: 'SPOTIFY', c: 'Suscripciones' }, { p: 'HBO', c: 'Suscripciones' }, { p: 'DISNEY', c: 'Suscripciones' },
    { p: 'YOUTUBE', c: 'Suscripciones' }, { p: 'ICLOUD', c: 'Suscripciones' }, { p: 'APPLE.COM/BILL', c: 'Suscripciones' }, { p: 'PRIME VIDEO', c: 'Suscripciones' },
    { p: 'REPSOL', c: 'Transporte' }, { p: 'CEPSA', c: 'Transporte' }, { p: 'GALP', c: 'Transporte' }, { p: 'BILBOBUS', c: 'Transporte' }, { p: 'BIZKAIBUS', c: 'Transporte' },
    { p: 'METRO BILBAO', c: 'Transporte' }, { p: 'RENFE', c: 'Transporte' }, { p: 'EUSKOTREN', c: 'Transporte' }, { p: 'CABIFY', c: 'Transporte' }, { p: 'UBER', c: 'Transporte' },
    { p: 'BOLT', c: 'Transporte' }, { p: 'ALSA', c: 'Transporte' }, { p: 'PARKING', c: 'Transporte' },
    { p: 'LIDL', c: 'Supermercado' }, { p: 'ALDI', c: 'Supermercado' }, { p: 'CONDIS', c: 'Supermercado' }, { p: 'SUPERMERCADO', c: 'Supermercado' }, { p: 'BM SUPERMERCADOS', c: 'Supermercado' },
    { p: 'GLOVO', c: 'Restauración' }, { p: 'JUST EAT', c: 'Restauración' }, { p: 'MCDONALD', c: 'Restauración' }, { p: 'BURGER', c: 'Restauración' }, { p: 'TELEPIZZA', c: 'Restauración' },
    { p: 'STARBUCKS', c: 'Restauración' }, { p: 'CAFETERIA', c: 'Restauración' }, { p: 'TABERNA', c: 'Restauración' }, { p: 'BAR RESTAURANTE', c: 'Restauración' },
    { p: 'IBERDROLA', c: 'Hogar' }, { p: 'ENDESA', c: 'Hogar' }, { p: 'NATURGY', c: 'Hogar' }, { p: 'IKEA', c: 'Hogar' }, { p: 'LEROY', c: 'Hogar' }, { p: 'BRICO', c: 'Hogar' }, { p: 'ALQUILER', c: 'Hogar' },
    { p: 'FARMACIA', c: 'Salud' }, { p: 'CLINICA', c: 'Salud' }, { p: 'DENTAL', c: 'Salud' }, { p: 'OPTICA', c: 'Salud' },
    { p: 'CINESA', c: 'Ocio' }, { p: 'STEAM', c: 'Ocio' }, { p: 'PLAYSTATION', c: 'Ocio' }, { p: 'NINTENDO', c: 'Ocio' }, { p: 'TICKETMASTER', c: 'Ocio' }, { p: 'GIMNASIO', c: 'Ocio' },
    { p: 'ALIEXPRESS', c: 'Compras online' }, { p: 'ZALANDO', c: 'Compras online' }, { p: 'SHEIN', c: 'Compras online' }, { p: 'PAYPAL', c: 'Compras online' }, { p: 'EBAY', c: 'Compras online' }
];

const defaultState = () => ({
    rows: [],            // Kutxa: { k, d, v, c, i, s, cat, man, t:[tags], bz:[keys], lk:key }
    rules: DEFAULT_RULES.slice(),
    budgets: {},
    imports: [],
    inv: [],             // Inversión: { k, d, c, i, s|null }
    invMap: null,        // { date, concept, amount, balance } (nombres de cabecera recordados)
    invSign: 1,
    invValues: [],       // [{ d, v }]
    invXray: [],         // informes X-Ray: [{ d, v, assets, countries, sectors, top, funds, rent }]
    dismissed: [],       // gastos cuyas sugerencias Bizum se descartaron
    customCats: [],      // categorías creadas por el usuario: { n, ic, col }
    settings: { bizumMin: 30, bizumDays: 4 }
});

let AppState = defaultState();
let BizumSugg = [];
let pendingInv = null;
let chartMensualInstance = null, chartCategoriasInstance = null, chartInvInstance = null, chartSaldoInstance = null;