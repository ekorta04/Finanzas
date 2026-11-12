
# Finanzas

Aplicación web para gestionar y analizar las finanzas personales a partir de extractos bancarios de Laboral Kutxa.

## Funcionalidades

- Dashboard de ingresos, gastos y ahorro, con bloques que se reordenan manteniendo pulsado y arrastrando, como en la pantalla de inicio del iPhone (el orden se sincroniza entre dispositivos).
- Modo privado (ojito de arriba): oculta las cifras en euros y deja gráficas y porcentajes, para poder enseñar la app sin mostrar tu dinero.
- Importación de movimientos bancarios desde CSV.
- Clasificación automática de movimientos.
- Gestión de categorías y etiquetas.
- Vinculación de Bizums a gastos compartidos.
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
Reglas, etiquetas, presupuestos e inversión se guardan en el navegador.

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
