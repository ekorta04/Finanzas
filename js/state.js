/* ==========================================================================
    1. ESTADO
    ========================================================================== */
const STORAGE_KEY = 'finanzas_kutxa_v2';

// Categorías principales con subcategorías. El valor que se guarda en cada movimiento es
// "Principal › Subcategoría" (o solo "Principal" si no se concreta la subcategoría).
const CAT_SEP = ' › ';
const CAT_TREE = [
    { n: 'Comunicación, PC', ic: 'smartphone', col: '--indigo', subs: [['Teléfono, móvil', 'phone'], ['Internet', 'wifi'], ['Software, aplicaciones, juegos', 'app-window'], ['Servicios postales', 'mail']] },
    { n: 'Vivienda', ic: 'house', col: '--green', subs: [['Alquiler', 'key-round'], ['Hipoteca', 'landmark'], ['Energía, servicios públicos', 'zap'], ['Servicios', 'plug'], ['Mantenimiento, reparaciones', 'hammer'], ['Seguro de propiedad', 'shield-check']] },
    { n: 'Vida y entretenimiento', ic: 'party-popper', col: '--pink', subs: [['Atención médica, doctor', 'stethoscope'], ['Bienestar, belleza', 'sparkles'], ['Deporte activo, fitness', 'dumbbell'], ['Cultura, eventos deportivos', 'ticket'], ['Eventos de la vida', 'cake-slice'], ['Aficiones', 'palette'], ['Educación, desarrollo personal', 'graduation-cap'], ['Libros, audio, suscripciones', 'book-open'], ['TV, Streaming', 'tv'], ['Vacaciones, viajes, hoteles', 'plane'], ['Caridad, regalos', 'hand-heart'], ['Alcohol, tabaco', 'wine'], ['Lotería, juegos de azar', 'dices']] },
    { n: 'Compras', ic: 'shopping-bag', col: '--purple', subs: [['Ropa y calzado', 'shirt'], ['Joyas, accesorios', 'gem'], ['Salud y belleza', 'flower-2'], ['Niños', 'baby'], ['Casa, jardín', 'sprout'], ['Mascotas, animales', 'paw-print'], ['Electrónica, accesorios', 'headphones'], ['Regalos, alegrías', 'gift'], ['Papelería, herramientas', 'pencil']] },
    { n: 'Comida y bebida', ic: 'utensils', col: '--orange', subs: [['Supermercado', 'shopping-cart'], ['Restaurante, comida rápida', 'utensils'], ['Bar, cafetería', 'coffee']] },
    { n: 'Vehículo', ic: 'car', col: '--brown', subs: [['Combustible', 'fuel'], ['Estacionamiento', 'parking-meter'], ['Mantenimiento de vehículo', 'wrench'], ['Préstamos', 'hand-coins'], ['Seguro de vehículo', 'shield'], ['Leasing', 'file-text']] },
    { n: 'Gastos financieros', ic: 'credit-card', col: '--red', subs: [['Impuestos', 'receipt'], ['Seguros', 'shield-check'], ['Préstamos, intereses', 'percent'], ['Multas', 'triangle-alert'], ['Asesoría', 'briefcase'], ['Cargos, tarifas', 'circle-dollar-sign'], ['Pensión alimenticia', 'users']] },
    { n: 'Transporte', ic: 'bus', col: '--blue', subs: [['Transporte público', 'bus'], ['Taxi', 'car-taxi-front'], ['Larga distancia', 'train-front'], ['Viajes de negocios', 'luggage']] },
    { n: 'Inversiones', ic: 'trending-up', col: '--yellow', subs: [['Propiedades', 'building-2'], ['Vehículos, bienes muebles', 'car'], ['Inversiones financieras', 'trending-up'], ['Ahorros', 'piggy-bank'], ['Colecciones', 'trophy']] },
    { n: 'Ingreso', ic: 'wallet', col: '--mint', subs: [['Salario, facturas', 'banknote'], ['Intereses, dividendos', 'percent'], ['Venta', 'tag'], ['Ingresos por alquiler', 'house'], ['Cuotas y subvenciones', 'landmark'], ['Ingresos por préstamo', 'hand-coins'], ['Cheques, cupones, vales', 'ticket-percent'], ['Lotería, juegos de azar', 'dices'], ['Reembolsos (impuestos, compra)', 'refresh-cw'], ['Pensión alimenticia', 'users'], ['Regalos', 'gift']] }
];
const SPECIAL_CATS = ['Bizum y transferencias', 'Inversión'];   // 'Inversión' = traspasos a la cuenta de inversión (no cuentan como gasto)
const BASE_CATEGORIES = [].concat(
    ...CAT_TREE.map(m => [m.n, ...m.subs.map(s => m.n + CAT_SEP + s[0])]),
    SPECIAL_CATS, ['Otros', 'Sin clasificar']
);
const catGroup = c => { c = String(c == null ? '' : c); const i = c.indexOf(CAT_SEP); return i < 0 ? c : c.slice(0, i); };
const isInvCat = c => c === 'Inversión' || catGroup(c) === 'Inversiones';

// Categorías de versiones anteriores → nuevas
const LEGACY_CATS = {
    'Restauración': 'Comida y bebida › Restaurante, comida rápida',
    'Supermercado': 'Comida y bebida › Supermercado',
    'Compras online': 'Compras',
    'Ocio': 'Vida y entretenimiento',
    'Hogar': 'Vivienda',
    'Salud': 'Vida y entretenimiento › Atención médica, doctor',
    'Suscripciones': 'Vida y entretenimiento › Libros, audio, suscripciones',
    'Nómina': 'Ingreso › Salario, facturas',
    'Banco': 'Gastos financieros › Cargos, tarifas'
};
const migrateCat = c => LEGACY_CATS[c] || c;
const CATEGORIES = BASE_CATEGORIES.slice();

// Iconos y colores que se pueden elegir al crear una categoría propia
const CAT_ICONS = ['wallet','piggy-bank','coins','receipt','store','shopping-cart','car','house','heart-pulse','zap','sparkles','users','ticket','briefcase','lightbulb','tag','utensils','package',
    'shopping-bag','gift','shirt','baby','dog','cat','paw-print','bone','leaf','trees','flower-2','sprout','sun','moon','snowflake','umbrella','coffee','beer','wine','pizza','sandwich','apple','cake-slice','ice-cream-cone','cookie','salad','soup','cup-soda','croissant','fish','bus','train-front','plane','bike','fuel','parking-meter','ship','truck','map-pin','tent','bed-double','dumbbell','trophy','gamepad-2','music','film','popcorn','tv','guitar','camera','palette','book-open','graduation-cap','library','pencil','smartphone','laptop','wifi','headphones','monitor','printer','stethoscope','pill','syringe','glasses','scissors','wrench','hammer','paintbrush','sofa','washing-machine','bath','key-round','lock','phone','mail','globe','shield','credit-card','hand-coins','handshake','heart','building-2','church','star','flame','droplet','recycle','cigarette','newspaper','clapperboard','dices','party-popper','calculator','badge-euro','euro',
    'app-window','banknote','car-taxi-front','circle-dollar-sign','file-text','gem','hand-heart','landmark','luggage','percent','plug','refresh-cw','shield-check','ticket-percent','trending-up','triangle-alert'];
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
    { p: 'ALBIA KAFE', c: 'Comida y bebida › Bar, cafetería' },
    { p: 'KEBAB', c: 'Comida y bebida › Restaurante, comida rápida' },
    { p: 'PIZZERIA', c: 'Comida y bebida › Restaurante, comida rápida' },
    { p: 'RESTAURANTE', c: 'Comida y bebida › Restaurante, comida rápida' },
    { p: 'ASADOS', c: 'Comida y bebida › Restaurante, comida rápida' },
    { p: 'EROSKI', c: 'Comida y bebida › Supermercado' },
    { p: 'MERCADONA', c: 'Comida y bebida › Supermercado' },
    { p: 'CARREFOUR', c: 'Comida y bebida › Supermercado' },
    { p: 'AMAZON', c: 'Compras' },
    { p: 'AMZN', c: 'Compras' },
    { p: 'INVERSION', c: 'Inversión' },
    { p: 'BONIFICACION COMISIONES', c: 'Gastos financieros › Cargos, tarifas' },
    { p: 'TRF.', c: 'Bizum y transferencias' },
    { p: 'BIZUM', c: 'Bizum y transferencias' },
    { p: 'NOMINA', c: 'Ingreso › Salario, facturas' },
    { p: 'SALARIO', c: 'Ingreso › Salario, facturas' },
    { p: 'NETFLIX', c: 'Vida y entretenimiento › TV, Streaming' },
    { p: 'SPOTIFY', c: 'Vida y entretenimiento › Libros, audio, suscripciones' },
    { p: 'HBO', c: 'Vida y entretenimiento › TV, Streaming' },
    { p: 'DISNEY', c: 'Vida y entretenimiento › TV, Streaming' },
    { p: 'YOUTUBE', c: 'Vida y entretenimiento › TV, Streaming' },
    { p: 'ICLOUD', c: 'Comunicación, PC › Software, aplicaciones, juegos' },
    { p: 'APPLE.COM/BILL', c: 'Comunicación, PC › Software, aplicaciones, juegos' },
    { p: 'PRIME VIDEO', c: 'Vida y entretenimiento › TV, Streaming' },
    { p: 'REPSOL', c: 'Vehículo › Combustible' },
    { p: 'CEPSA', c: 'Vehículo › Combustible' },
    { p: 'GALP', c: 'Vehículo › Combustible' },
    { p: 'BILBOBUS', c: 'Transporte › Transporte público' },
    { p: 'BIZKAIBUS', c: 'Transporte › Transporte público' },
    { p: 'METRO BILBAO', c: 'Transporte › Transporte público' },
    { p: 'RENFE', c: 'Transporte › Transporte público' },
    { p: 'EUSKOTREN', c: 'Transporte › Transporte público' },
    { p: 'CABIFY', c: 'Transporte › Taxi' },
    { p: 'UBER', c: 'Transporte › Taxi' },
    { p: 'BOLT', c: 'Transporte › Taxi' },
    { p: 'ALSA', c: 'Transporte › Transporte público' },
    { p: 'PARKING', c: 'Vehículo › Estacionamiento' },
    { p: 'LIDL', c: 'Comida y bebida › Supermercado' },
    { p: 'ALDI', c: 'Comida y bebida › Supermercado' },
    { p: 'CONDIS', c: 'Comida y bebida › Supermercado' },
    { p: 'SUPERMERCADO', c: 'Comida y bebida › Supermercado' },
    { p: 'BM SUPERMERCADOS', c: 'Comida y bebida › Supermercado' },
    { p: 'GLOVO', c: 'Comida y bebida › Restaurante, comida rápida' },
    { p: 'JUST EAT', c: 'Comida y bebida › Restaurante, comida rápida' },
    { p: 'MCDONALD', c: 'Comida y bebida › Restaurante, comida rápida' },
    { p: 'BURGER', c: 'Comida y bebida › Restaurante, comida rápida' },
    { p: 'TELEPIZZA', c: 'Comida y bebida › Restaurante, comida rápida' },
    { p: 'STARBUCKS', c: 'Comida y bebida › Bar, cafetería' },
    { p: 'CAFETERIA', c: 'Comida y bebida › Bar, cafetería' },
    { p: 'TABERNA', c: 'Comida y bebida › Bar, cafetería' },
    { p: 'BAR RESTAURANTE', c: 'Comida y bebida › Restaurante, comida rápida' },
    { p: 'IBERDROLA', c: 'Vivienda › Energía, servicios públicos' },
    { p: 'ENDESA', c: 'Vivienda › Energía, servicios públicos' },
    { p: 'NATURGY', c: 'Vivienda › Energía, servicios públicos' },
    { p: 'IKEA', c: 'Compras › Casa, jardín' },
    { p: 'LEROY', c: 'Vivienda › Mantenimiento, reparaciones' },
    { p: 'BRICO', c: 'Vivienda › Mantenimiento, reparaciones' },
    { p: 'ALQUILER', c: 'Vivienda › Alquiler' },
    { p: 'FARMACIA', c: 'Vida y entretenimiento › Atención médica, doctor' },
    { p: 'CLINICA', c: 'Vida y entretenimiento › Atención médica, doctor' },
    { p: 'DENTAL', c: 'Vida y entretenimiento › Atención médica, doctor' },
    { p: 'OPTICA', c: 'Vida y entretenimiento › Atención médica, doctor' },
    { p: 'CINESA', c: 'Vida y entretenimiento › Cultura, eventos deportivos' },
    { p: 'STEAM', c: 'Comunicación, PC › Software, aplicaciones, juegos' },
    { p: 'PLAYSTATION', c: 'Comunicación, PC › Software, aplicaciones, juegos' },
    { p: 'NINTENDO', c: 'Comunicación, PC › Software, aplicaciones, juegos' },
    { p: 'TICKETMASTER', c: 'Vida y entretenimiento › Cultura, eventos deportivos' },
    { p: 'GIMNASIO', c: 'Vida y entretenimiento › Deporte activo, fitness' },
    { p: 'ALIEXPRESS', c: 'Compras' },
    { p: 'ZALANDO', c: 'Compras › Ropa y calzado' },
    { p: 'SHEIN', c: 'Compras › Ropa y calzado' },
    { p: 'PAYPAL', c: 'Compras' },
    { p: 'EBAY', c: 'Compras' }
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