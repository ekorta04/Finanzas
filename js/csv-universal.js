
/* =====================================================
   FINANZAS
   IMPORTADOR UNIVERSAL DE ARCHIVOS CSV
   =====================================================

   FUNCIONALIDADES:
   - Leer CSV de diferentes bancos
   - Detectar separadores y columnas
   - Permitir asignar columnas manualmente
   - Mostrar vista previa del CSV original
   - Seleccionar formato de fechas
   - Seleccionar formato de importes
   - Convertir cargos y abonos
   - Validar fechas, importes y saldos
   - Mostrar vista previa final normalizada
   - Invalidar la validación al cambiar opciones

   IMPORTANTE:
   Este módulo NO guarda datos en Supabase.
   ===================================================== */


// =====================================================
// 1. NORMALIZAR CABECERAS
// =====================================================

function normalizeCSVHeader(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}


// =====================================================
// 2. NOMBRES HABITUALES DE COLUMNAS BANCARIAS
// =====================================================

const CSV_COLUMN_ALIASES = {
    date: [
        'fecha',
        'fecha operacion',
        'fecha de operacion',
        'fecha movimiento',
        'fecha del movimiento',
        'operation date',
        'booking date',
        'transaction date',
        'date'
    ],

    valueDate: [
        'fecha valor',
        'fecha de valor',
        'value date'
    ],

    description: [
        'concepto',
        'descripcion',
        'description',
        'detalle',
        'detalles',
        'concept',
        'merchant',
        'beneficiario',
        'movimiento',
        'transaction description',
        'details'
    ],

    amount: [
        'importe',
        'amount',
        'importe eur',
        'importe euro',
        'cantidad',
        'valor',
        'transaction amount'
    ],

    debit: [
        'cargo',
        'cargos',
        'debit',
        'withdrawal',
        'salida',
        'debe',
        'money out'
    ],

    credit: [
        'abono',
        'abonos',
        'credit',
        'deposit',
        'entrada',
        'haber',
        'money in'
    ],

    balance: [
        'saldo',
        'balance',
        'saldo disponible',
        'saldo contable',
        'running balance'
    ]
};


// =====================================================
// 3. SUGERIR CORRESPONDENCIA DE COLUMNAS
// =====================================================

function suggestCSVColumns(headers) {
    const mapping = {};

    for (const [field, aliases] of
        Object.entries(CSV_COLUMN_ALIASES)) {

        const index = headers.findIndex(header => {
            const normalized = normalizeCSVHeader(header);

            return aliases.some(alias =>
                normalized === normalizeCSVHeader(alias)
            );
        });

        mapping[field] = index >= 0 ? index : null;
    }

    return mapping;
}


// =====================================================
// 4. LEER ARCHIVO CSV
// =====================================================

function readUniversalCSV(file) {
    return new Promise((resolve, reject) => {

        if (!file) {
            reject(new Error('Selecciona un archivo CSV.'));
            return;
        }

        if (typeof Papa === 'undefined') {
            reject(new Error(
                'No se ha cargado la biblioteca Papa Parse.'
            ));
            return;
        }

        Papa.parse(file, {
            header: false,
            skipEmptyLines: 'greedy',

            complete: results => {
                try {
                    const errors = results.errors || [];

                    if (errors.length > 0) {
                        throw new Error(
                            'El CSV contiene errores de formato: ' +
                            errors[0].message
                        );
                    }

                    const rows = results.data;

                    if (!Array.isArray(rows) ||
                        rows.length < 2) {
                        throw new Error(
                            'El archivo no contiene suficientes filas.'
                        );
                    }

                    // Primera fila como cabecera.
                    // Más adelante añadiremos selección
                    // manual de fila de cabeceras.
                    const headers = rows[0].map(
                        value => String(value ?? '').trim()
                    );

                    const dataRows = rows.slice(1);

                    const mapping = suggestCSVColumns(headers);

                    resolve({
                        fileName: file.name,
                        delimiter: results.meta.delimiter,
                        headers,
                        rows: dataRows,
                        mapping,
                        totalRows: dataRows.length,
                        preview: dataRows.slice(0, 5)
                    });

                } catch (error) {
                    reject(error);
                }
            },

            error: error => reject(error)
        });
    });
}


// =====================================================
// 5. ESTADO DEL IMPORTADOR
// =====================================================

let universalCSVData = null;

let universalCSVValidatedRows = null;

let universalCSVReadVersion = 0;

const CSV_MAPPING_FIELDS = {
    date: 'csv-map-date',
    valueDate: 'csv-map-value-date',
    description: 'csv-map-description',
    amount: 'csv-map-amount',
    debit: 'csv-map-debit',
    credit: 'csv-map-credit',
    balance: 'csv-map-balance'
};


// =====================================================
// 6. RELLENAR SELECTORES DE COLUMNAS
// =====================================================

function populateCSVMappingSelect(
    selectId,
    headers,
    selectedIndex
) {
    const selector = document.getElementById(selectId);

    if (!selector) return;

    selector.replaceChildren(
        new Option('No asignada', '')
    );

    headers.forEach((header, index) => {
        selector.add(
            new Option(
                `${index + 1}. ${header || 'Columna sin nombre'}`,
                String(index)
            )
        );
    });

    if (selectedIndex !== null &&
        selectedIndex !== undefined) {
        selector.value = String(selectedIndex);
    }
}


// =====================================================
// 7. VISTA PREVIA DEL ARCHIVO ORIGINAL
// =====================================================

function renderUniversalCSVPreview(csvData) {
    const table = document.getElementById(
        'csv-preview-table'
    );

    if (!table) return;

    table.replaceChildren();

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    csvData.headers.forEach(header => {
        const th = document.createElement('th');

        th.textContent = header;

        th.className =
            'px-3 py-2 font-semibold ' +
            'bg-slate-200 dark:bg-slate-700';

        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    csvData.preview.forEach(row => {
        const tr = document.createElement('tr');

        csvData.headers.forEach((_, index) => {
            const td = document.createElement('td');

            td.textContent = row[index] ?? '';

            td.className =
                'px-3 py-2 border-t ' +
                'border-slate-200 dark:border-slate-700 ' +
                'whitespace-nowrap';

            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
}


// =====================================================
// 8. OBTENER CORRESPONDENCIA DE COLUMNAS
// =====================================================

function getCSVColumnMapping() {
    const mapping = {};

    Object.entries(CSV_MAPPING_FIELDS).forEach(
        ([field, id]) => {

            const selector = document.getElementById(id);
            const value = selector ? selector.value : '';

            mapping[field] =
                value === '' ? null : Number(value);
        }
    );

    return mapping;
}


// =====================================================
// 9. VALIDAR CORRESPONDENCIA DE COLUMNAS
// =====================================================

function validateCSVMapping() {
    if (!universalCSVData) {
        return 'Selecciona primero un archivo CSV.';
    }

    const mapping = getCSVColumnMapping();

    if (mapping.date === null) {
        return 'Debes seleccionar la fecha de operación.';
    }

    if (mapping.description === null) {
        return 'Debes seleccionar el concepto.';
    }

    const hasAmount = mapping.amount !== null;

    const hasDebitCredit =
        mapping.debit !== null ||
        mapping.credit !== null;

    if (!hasAmount && !hasDebitCredit) {
        return 'Selecciona importe o cargo/abono.';
    }

    if (hasAmount && hasDebitCredit) {
        return 'Utiliza importe o cargo/abono, no ambos.';
    }

    const selected = Object.values(mapping)
        .filter(value => value !== null);

    if (new Set(selected).size !== selected.length) {
        return 'No puedes asignar la misma columna a varios campos.';
    }

    return null;
}


// =====================================================
// 10. MOSTRAR MENSAJES
// =====================================================

function showCSVMappingMessage(text, isError = false) {
    const element = document.getElementById(
        'csv-mapping-message'
    );

    if (!element) return;

    element.textContent = text;

    element.className = isError
        ? 'text-sm text-red-600 dark:text-red-400'
        : 'text-sm text-emerald-700 dark:text-emerald-400';
}


// =====================================================
// 11. OBTENER FORMATOS ELEGIDOS
// =====================================================

function getUniversalCSVFormats() {
    return {
        date: document.getElementById(
            'csv-date-format'
        )?.value || 'DMY',

        number: document.getElementById(
            'csv-number-format'
        )?.value || 'EU'
    };
}


// =====================================================
// 12. INTERPRETAR IMPORTES
// =====================================================

function parseUniversalAmount(value, format = 'EU') {
    if (
        value === null ||
        value === undefined ||
        String(value).trim() === ''
    ) {
        return null;
    }

    let text = String(value)
        .trim()
        .replace(/\s/g, '')
        .replace(/[€$£]/g, '');

    const negative =
        text.startsWith('-') ||
        (text.startsWith('(') && text.endsWith(')'));

    if (text.startsWith('(') && text.endsWith(')')) {
        text = text.slice(1, -1);
    }

    text = text.replace(/^[+-]/, '');

    if (format === 'EU') {
        // 1234,56 | 1.234,56 | 1234
        const valid =
            /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;

        if (!valid.test(text)) return NaN;

        text = text
            .replace(/\./g, '')
            .replace(',', '.');

    } else if (format === 'US') {
        // 1234.56 | 1,234.56 | 1234
        const valid =
            /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;

        if (!valid.test(text)) return NaN;

        text = text.replace(/,/g, '');

    } else {
        return NaN;
    }

    const number = Number(text);

    if (!Number.isFinite(number)) return NaN;

    return negative ? -number : number;
}


// =====================================================
// 13. INTERPRETAR FECHAS
// =====================================================

function parseUniversalDate(value, format = 'DMY') {
    const text = String(value ?? '').trim();

    let match;

    if (format === 'YMD') {
        // AAAA-MM-DD
        match = text.match(
            /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/
        );

        if (!match) return null;

        return validateUniversalDate(
            match[1],
            match[2],
            match[3]
        );
    }

    match = text.match(
        /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/
    );

    if (!match) return null;

    if (format === 'DMY') {
        // DD/MM/AAAA
        return validateUniversalDate(
            match[3],
            match[2],
            match[1]
        );
    }

    if (format === 'MDY') {
        // MM/DD/AAAA
        return validateUniversalDate(
            match[3],
            match[1],
            match[2]
        );
    }

    return null;
}


// =====================================================
// 14. VALIDAR FECHA REAL
// =====================================================

function validateUniversalDate(year, month, day) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);

    const date = new Date(
        Date.UTC(y, m - 1, d)
    );

    if (
        date.getUTCFullYear() !== y ||
        date.getUTCMonth() !== m - 1 ||
        date.getUTCDate() !== d
    ) {
        return null;
    }

    return (
        `${String(y).padStart(4, '0')}-` +
        `${String(m).padStart(2, '0')}-` +
        `${String(d).padStart(2, '0')}`
    );
}


// =====================================================
// 15. CONVERTIR MOVIMIENTOS
// =====================================================

function convertUniversalCSVRows(
    csvData,
    mapping,
    formats = {}
) {
    const converted = [];
    const errors = [];

    const dateFormat = formats.date || 'DMY';
    const numberFormat = formats.number || 'EU';

    csvData.rows.forEach((row, index) => {
        const lineNumber = index + 2;

        const date = parseUniversalDate(
            row[mapping.date],
            dateFormat
        );

        const description = String(
            row[mapping.description] ?? ''
        ).trim();

        if (!date || !description) {
            errors.push({
                line: lineNumber,
                reason: 'Fecha o concepto no válido'
            });
            return;
        }

        let amount;

        // Una columna de importe
        if (mapping.amount !== null) {
            amount = parseUniversalAmount(
                row[mapping.amount],
                numberFormat
            );
        } else {
            // Columnas separadas de cargo y abono
            const debit = mapping.debit !== null
                ? parseUniversalAmount(
                    row[mapping.debit],
                    numberFormat
                )
                : null;

            const credit = mapping.credit !== null
                ? parseUniversalAmount(
                    row[mapping.credit],
                    numberFormat
                )
                : null;

            if (
                Number.isNaN(debit) ||
                Number.isNaN(credit) ||
                (debit !== null && credit !== null) ||
                (debit === null && credit === null)
            ) {
                errors.push({
                    line: lineNumber,
                    reason: 'Cargo/abono ambiguo o no válido'
                });
                return;
            }

            amount = debit !== null
                ? -Math.abs(debit)
                : Math.abs(credit);
        }

        if (
            amount === null ||
            !Number.isFinite(amount) ||
            amount === 0
        ) {
            errors.push({
                line: lineNumber,
                reason: 'Importe no válido'
            });
            return;
        }

        // Saldo opcional
        let balance = null;

        if (mapping.balance !== null) {
            balance = parseUniversalAmount(
                row[mapping.balance],
                numberFormat
            );

            if (
                balance !== null &&
                !Number.isFinite(balance)
            ) {
                errors.push({
                    line: lineNumber,
                    reason: 'Saldo no válido'
                });
                return;
            }
        }

        // Fecha valor opcional
        let valueDate = date;

        if (mapping.valueDate !== null) {
            const rawValueDate = String(
                row[mapping.valueDate] ?? ''
            ).trim();

            if (rawValueDate) {
                valueDate = parseUniversalDate(
                    rawValueDate,
                    dateFormat
                );

                if (!valueDate) {
                    errors.push({
                        line: lineNumber,
                        reason: 'Fecha valor no válida'
                    });
                    return;
                }
            }
        }

        converted.push({
            d: date,
            v: valueDate,
            c: description,
            i: amount,
            s: balance
        });
    });

    return {
        converted,
        errors
    };
}


// =====================================================
// 16. VISTA PREVIA FINAL NORMALIZADA
// =====================================================

function renderUniversalFinalPreview(rows) {
    const panel = document.getElementById(
        'csv-final-preview'
    );

    const tbody = document.getElementById(
        'csv-final-preview-body'
    );

    const summary = document.getElementById(
        'csv-final-summary'
    );

    if (!panel || !tbody || !summary) return;

    tbody.replaceChildren();

    rows.forEach(row => {
        const tr = document.createElement('tr');

        const values = [
            formatDateEs(row.d),
            row.c,
            formatEur(row.i),
            row.s === null ? '—' : formatEur(row.s)
        ];

        values.forEach((value, index) => {
            const td = document.createElement('td');

            td.textContent = value;

            td.className =
                'px-3 py-2 border-t border-slate-200 ' +
                'dark:border-slate-700 ' +
                (index >= 2 ? 'text-right ' : '') +
                (
                    index === 2
                        ? row.i < 0
                            ? 'text-rose-600'
                            : 'text-emerald-600'
                        : ''
                );

            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    const income = rows
        .filter(r => r.i > 0)
        .reduce((sum, r) => sum + r.i, 0);

    const expense = rows
        .filter(r => r.i < 0)
        .reduce((sum, r) => sum + Math.abs(r.i), 0);

    summary.textContent =
        `${rows.length} movimientos · ` +
        `Ingresos: ${formatEur(income)} · ` +
        `Gastos: ${formatEur(expense)}`;

    panel.classList.remove('hidden');
}


// =====================================================
// 17. ACTIVAR O DESACTIVAR BOTÓN DE VALIDACIÓN
// =====================================================

function refreshUniversalCSVValidationButton() {
    const button = document.getElementById(
        'csv-confirm-mapping'
    );

    if (!button) return;

    const error = validateCSVMapping();

    button.disabled =
        !universalCSVData || Boolean(error);
}


// =====================================================
// 18. REINICIAR VALIDACIÓN
// =====================================================

function resetUniversalCSVValidation() {
    universalCSVValidatedRows = null;

    const button = document.getElementById(
        'csv-confirm-mapping'
    );

    if (button) {
        button.disabled = true;
    }

    // Ocultar cualquier vista previa validada
    document.getElementById(
        'csv-final-preview'
    )?.classList.add('hidden');
}


// =====================================================
// 19. PROCESAR ARCHIVO SELECCIONADO
// =====================================================

async function handleUniversalCSVFile(file) {
    const panel = document.getElementById(
        'csv-mapping-panel'
    );

    const confirmButton = document.getElementById(
        'csv-confirm-mapping'
    );

    if (!panel || !confirmButton) return;

    // Evitar que una lectura antigua sobrescriba otra
    const readVersion = ++universalCSVReadVersion;

    universalCSVData = null;
    universalCSVValidatedRows = null;

    panel.classList.add('hidden');
    confirmButton.disabled = true;

    document.getElementById(
        'csv-final-preview'
    )?.classList.add('hidden');

    if (!file) return;

    try {
        const csvData = await readUniversalCSV(file);

        if (readVersion !== universalCSVReadVersion) {
            return;
        }

        universalCSVData = csvData;

        document.getElementById(
            'csv-file-info'
        ).textContent =
            `Archivo: ${csvData.fileName} | ` +
            `Filas: ${csvData.totalRows} | ` +
            `Separador: ${JSON.stringify(csvData.delimiter)}`;

        Object.entries(CSV_MAPPING_FIELDS).forEach(
            ([field, selectId]) => {

                populateCSVMappingSelect(
                    selectId,
                    csvData.headers,
                    csvData.mapping[field]
                );
            }
        );

        // Reiniciar formatos para un archivo nuevo.
        document.getElementById(
            'csv-date-format'
        ).value = 'DMY';

        document.getElementById(
            'csv-number-format'
        ).value = 'EU';

        renderUniversalCSVPreview(csvData);

        panel.classList.remove('hidden');

        refreshUniversalCSVValidationButton();

        const error = validateCSVMapping();

        showCSVMappingMessage(
            error ||
            'Comprueba las columnas y los formatos ' +
            'antes de validar los movimientos.',
            Boolean(error)
        );

    } catch (error) {
        if (readVersion !== universalCSVReadVersion) {
            return;
        }

        console.error('Error leyendo CSV:', error);

        panel.classList.remove('hidden');
        confirmButton.disabled = true;

        showCSVMappingMessage(error.message, true);
    }
}


// =====================================================
// 20. VALIDAR LOS MOVIMIENTOS
// =====================================================

function validateUniversalCSVRows() {
    resetUniversalCSVValidation();

    const mappingError = validateCSVMapping();

    if (mappingError) {
        showCSVMappingMessage(
            mappingError,
            true
        );
        return;
    }

    const result = convertUniversalCSVRows(
        universalCSVData,
        getCSVColumnMapping(),
        getUniversalCSVFormats()
    );

    // No permitir validaciones parciales
    if (result.errors.length > 0) {
        showCSVMappingMessage(
            `${result.converted.length} movimientos válidos. ` +
            `${result.errors.length} filas con errores. ` +
            'No se importará nada hasta resolverlos.',
            true
        );

        console.table(result.errors);

        refreshUniversalCSVValidationButton();
        return;
    }

    if (result.converted.length === 0) {
        showCSVMappingMessage(
            'No se encontraron movimientos válidos.',
            true
        );

        refreshUniversalCSVValidationButton();
        return;
    }

    // Guardar solamente en memoria
    universalCSVValidatedRows = result.converted;

    renderUniversalFinalPreview(
        universalCSVValidatedRows
    );

    showCSVMappingMessage(
        `Validación completada: ` +
        `${result.converted.length} movimientos correctos. ` +
        'Todavía no se han guardado en Supabase.'
    );

    console.table(result.converted);

    refreshUniversalCSVValidationButton();
}


// =====================================================
// 21. CONECTAR INTERFAZ
// =====================================================

function setupUniversalCSVInterface() {
    const fileInput = document.getElementById(
        'supabase-import-file'
    );

    const confirmButton = document.getElementById(
        'csv-confirm-mapping'
    );

    // La pantalla del importador universal se ha retirado:
    // la importación se hace desde "Datos & Sync".
    if (!fileInput || !confirmButton) {
        return;
    }

    // Ocultar el importador antiguo de Laboral Kutxa
    const oldImportButton = document.getElementById(
        'supabase-import-button'
    );

    if (oldImportButton) {
        oldImportButton.classList.add('hidden');
        oldImportButton.disabled = true;
    }

    // Cambiar archivo
    fileInput.addEventListener('change', async () => {
        resetUniversalCSVValidation();

        await handleUniversalCSVFile(
            fileInput.files[0]
        );
    });

    // Cambiar correspondencia de columnas
    Object.values(CSV_MAPPING_FIELDS).forEach(id => {
        const selector = document.getElementById(id);

        if (!selector) return;

        selector.addEventListener('change', () => {
            resetUniversalCSVValidation();

            const error = validateCSVMapping();

            refreshUniversalCSVValidationButton();

            showCSVMappingMessage(
                error ||
                'Correspondencia de columnas modificada. ' +
                'Vuelve a validar los movimientos.',
                Boolean(error)
            );
        });
    });

    // Cambiar formato de fecha o importes
    [
        'csv-date-format',
        'csv-number-format'
    ].forEach(id => {
        const selector = document.getElementById(id);

        if (!selector) return;

        selector.addEventListener('change', () => {
            resetUniversalCSVValidation();

            showCSVMappingMessage(
                'Has cambiado el formato. ' +
                'Vuelve a validar los movimientos.'
            );

            refreshUniversalCSVValidationButton();
        });
    });

    // Validar y mostrar vista previa final
    confirmButton.addEventListener('click', () => {
        validateUniversalCSVRows();
    });

    confirmButton.disabled = true;
}


// =====================================================
// 22. INICIALIZAR
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    setupUniversalCSVInterface();
});


/* =====================================================
   IDENTIFICADORES PARA CSV DE DISTINTOS BANCOS
   ===================================================== */

   function generateUniversalRowKeys(rows) {

    const occurrences = new Map();

    return rows.map(row => {

        // Si existe saldo, conservar el identificador
        // utilizado actualmente por Laboral Kutxa.
        if (row.s !== null &&
            Number.isFinite(row.s)) {

            return {
                ...row,
                k: generateRowKey(row)
            };
        }

        // Identificador base para movimientos sin saldo.
        const baseKey = [
            row.d,
            row.i.toFixed(2),
            norm(row.c)
        ].join('|');

        // Contar operaciones idénticas dentro del CSV.
        const occurrence =
            (occurrences.get(baseKey) || 0) + 1;

        occurrences.set(baseKey, occurrence);

        return {
            ...row,
            k: `NOSALDO|${baseKey}|${occurrence}`
        };
    });
}
