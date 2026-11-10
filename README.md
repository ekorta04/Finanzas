
# Finanzas

Aplicación web para gestionar y analizar las finanzas personales a partir de extractos bancarios de Laboral Kutxa.

## Funcionalidades

- Dashboard de ingresos, gastos y ahorro.
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
También se pueden exportar copias de seguridad en formato JSON.

## Estado

Proyecto en desarrollo.

## Rendimiento y cambios de estilo

- Los estilos de Tailwind están precompilados en `css/tailwind.css`.
  Si se añaden clases nuevas en el HTML o el JS, hay que regenerarlo:
  `npx tailwindcss@3.4.17 -i css/tailwind.src.css -o css/tailwind.css --minify`
- Las librerías (Supabase, Chart.js, PapaParse) están en `vendor/` con versión fija.
- Al publicar cambios, sube el número de `CACHE` en `sw.js` para que el móvil
  descargue la versión nueva.
