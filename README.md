
# Finanzas

Aplicación web para gestionar y analizar las finanzas personales a partir de extractos bancarios de Laboral Kutxa.

## Funcionalidades

- Importación del CSV con vista previa: antes de guardar enseña cuántos movimientos son nuevos, repetidos y sin clasificar, y avisa si faltan movimientos comparando el saldo del archivo con el último guardado. Al terminar, un botón lleva a clasificar lo nuevo.
- También se puede importar el PDF «Movimientos de cuenta» de la banca online: se lee en el propio dispositivo y da los mismos movimientos que el CSV (se omiten los repetidos igual).
- Se puede soltar el CSV (o el PDF) en cualquier pestaña (en el iPhone, elegirlo desde Archivos).
- Aviso en el Resumen cuando los movimientos llegan hasta hace más de una semana.
- Cierre de mes en el Resumen: gasto, ingresos y ahorro de un mes frente al anterior, categorías que más suben y bajan y mayores gastos (en el mes en curso compara los mismos días).
- Botón «+» flotante para apuntar a mano un gasto o un ingreso (efectivo, etc.): cantidad, concepto, categoría y fecha. Se guarda en la base de datos como un movimiento más, no afecta al saldo del banco y se puede eliminar desde Movimientos.
- Borrar un movimiento (Movimientos → abrirlo → «Eliminar») o una importación entera (Datos → Últimas importaciones → «Borrar»). Un movimiento del banco borrado a mano no vuelve al importar el mismo archivo.
- El aviso «Movimientos sin categoría» se puede cerrar con la X hasta cerrar y volver a abrir la app.
- Perfiles (Datos → Perfiles): cada cuenta o tarjeta (débito, crédito, otro banco) es un perfil que creas, renombras y borras. Al importar eliges el perfil. Arriba eliges ver todos juntos o uno; el saldo suma el último saldo de cada perfil y el patrimonio cuenta siempre todos. La proyección de flujo de caja se calcula por perfil. La categoría «Traspaso entre cuentas» marca pagos de tarjeta y movimientos entre perfiles para que no cuenten como gasto ni ingreso.
- Tarjeta de crédito: al subir el PDF «Movimientos de tarjeta» las compras entran en un perfil de tarjeta (se crea solo) con la categoría del banco. El «RECIBO VISA» de la cuenta se cuadra automáticamente con las compras que suman exactamente su importe (Datos → Recibos de la tarjeta), se marca como traspaso y se oculta de Movimientos; no se borra para que el saldo siga cuadrando. Si no cuadra solo, se vincula a mano con «Vincular».
- Dashboard de ingresos, gastos y ahorro, con bloques que se reordenan manteniendo pulsado y arrastrando, como en la pantalla de inicio del iPhone (el orden se sincroniza entre dispositivos).
- Modo privado (ojito de arriba): oculta las cifras en euros y deja gráficas y porcentajes, para poder enseñar la app sin mostrar tu dinero.
- Importación de movimientos bancarios desde CSV.
- Clasificación automática de movimientos.
- Gestión de categorías y etiquetas.
- Vinculación de Bizums a gastos compartidos.
- Gastos en grupo con ticket (Movimientos → Ticket): la foto se lee en el propio dispositivo
  (Tesseract, en `vendor/tesseract`), eliges tu parte (tus líneas, a partes iguales o un importe),
  se enlaza solo con el cargo del banco del mismo total y propone los Bizums de ese día y los
  3 siguientes que encajan con lo que te deben. Los grupos se sincronizan; la foto queda solo en el dispositivo.
- Suscripciones y recibos: detecta los cargos que se repiten (semanales, mensuales, trimestrales, anuales), calcula lo que cuestan al mes y al año, avisa de subidas de precio y de los próximos cobros de 30 días. Tú confirmas, ignoras o marcas como cancelada cada una, y puedes añadir las que no salen en la cuenta. Las confirmadas alimentan la proyección de flujo de caja.
- Seguimiento de inversiones.
- Presupuestos mensuales.
- Gráficos y estadísticas.
- Copias de seguridad en formato JSON.
- Base de datos propia en Supabase (inicio de sesión con correo, opción de mantener la sesión iniciada).
- Instalación como aplicación web (PWA).

## Tecnologías

- HTML5
- CSS3
- JavaScript
- Tailwind CSS
- Chart.js
- Supabase (autenticación y base de datos PostgreSQL)
- LocalStorage
- Service Workers

## Estructura del proyecto

- `assets/icons/`: iconos de la aplicación.
- `css/`: estilos.
- `js/`: lógica organizada por funcionalidades.
- `index.html`: interfaz principal.
- `privacy.html`: página de privacidad.
- `manifest.webmanifest`: configuración PWA.
- `sw.js`: almacenamiento en caché.

## Ejecución

1. Abrir la carpeta del proyecto en VS Code.
2. Tener instalada la extensión Live Server.
3. Abrir `index.html` con Live Server.
4. Acceder a la aplicación desde el navegador.

## Almacenamiento

Los movimientos bancarios se guardan en la base de datos de Supabase
(tablas `accounts`, `transactions` e `imports`), ligados a tu usuario.
Reglas, etiquetas, Bizums vinculados, ajustes e inversión se guardan en la tabla
`user_settings` y se sincronizan entre dispositivos.

## Copia de seguridad

En **Datos → Copia de seguridad**:

- **Descargar copia (.json)** guarda todo lo que hay en la base de datos
  (cuentas, importaciones, movimientos y ajustes sincronizados).
- **Restaurar copia** vuelve a escribir ese archivo en Supabase. No borra nada:
  recupera lo que haya en la copia y conserva lo añadido después. Sirve también
  en un proyecto de Supabase nuevo (tras ejecutar los `.sql` de `supabase/`).

La copia automática semanal y la revisión diaria viven en un repositorio
privado aparte (los datos no deben estar en este, que es público). Sus copias
tienen el mismo formato y se restauran con el mismo botón.

## Seguridad de la base de datos

Todas las tablas tienen seguridad por filas (RLS): cada usuario solo lee y escribe
lo suyo, y solo con sesión iniciada. La clave que va en `js/supabase.js` es la
pública (`sb_publishable_…`); la clave secreta no debe estar nunca en este repo.

- `supabase/endurecer_seguridad.sql` quita al rol anónimo cualquier permiso
  sobre las tablas (capa extra). Se ejecuta una vez tras los demás `.sql`.
- `supabase/verificar_seguridad.sql` solo lee y devuelve una fila por tabla; la
  columna `estado` debe salir OK en todas. Conviene ejecutarlo tras cada cambio
  de base de datos.
- En Supabase → Authentication, con tu cuenta ya creada, desactiva
  "Allow new users to sign up" para que nadie más pueda registrarse.

## Aviso de errores

`js/errores.js` apunta en la tabla `app_errors` los fallos de la app (solo el
mensaje, nunca importes ni movimientos). Para activarlo, ejecuta una vez
`supabase/app_errors.sql` en el SQL Editor de Supabase. La revisión diaria lee
esa tabla y avisa por correo.

## Estado

Proyecto en desarrollo.

## Rendimiento y cambios de estilo

- Los estilos de Tailwind están precompilados en `css/tailwind.css`.
  Si se añaden clases nuevas en el HTML o el JS, hay que regenerarlo:
  `npx tailwindcss@3.4.17 -i css/tailwind.src.css -o css/tailwind.css --minify`
- Las librerías (Supabase, Chart.js, PapaParse) están en `vendor/` con versión fija.
- Al publicar cambios, sube el número de `CACHE` en `sw.js` para que el móvil
  descargue la versión nueva.

## Sincronización entre dispositivos

Reglas, presupuestos, etiquetas, Bizums vinculados, ajustes, histórico de
importaciones e inversión se guardan en la tabla `user_settings` de Supabase.
Para crearla, ejecuta una vez `supabase/user_settings.sql` en el SQL Editor de Supabase.

## Diseño

Estilo inspirado en iOS: `css/apple.css` (colores, listas agrupadas, barra de
pestañas, alertas) e `css/icons.css` (iconos Lucide, licencia ISC).
Tipografía del sistema en Apple e Inter en Windows (`assets/fonts`).
