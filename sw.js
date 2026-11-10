/* ==========================================================================
   SERVICE WORKER - FINANZAS
   Caché de los archivos de la aplicación
   ========================================================================== */

   const CACHE = 'finanzas-v12';

   const FILES = [
       './',
       './index.html',
       './privacy.html',
       './manifest.webmanifest',
   
       // CSS
       './css/tailwind.css',
       './css/icons.css',
       './css/apple.css',
       './assets/fonts/inter-latin-var.woff2',

       // Librerías (copiadas en el repositorio, versión fija)
       './vendor/supabase-2.118.0.min.js',
       './vendor/chart-4.4.1.min.js',
       './vendor/papaparse-5.5.3.min.js',
   
       // JavaScript
       './js/supabase.js',
       './js/auth.js',
       './js/database.js',
       './js/state.js',
       './js/utils.js',
       './js/storage.js',
       './js/csv.js',
       './js/bizum.js',
       './js/tags.js',
       './js/dashboard.js',
       './js/movimientos.js',
       './js/inversion.js',
       './js/reglas.js',
       './js/importacion.js',
       './js/backup.js',
       './js/ui.js',
       './js/cloud.js',
       './js/app.js',
   
       // Iconos
       './assets/icons/icon-180.png',
       './assets/icons/icon-192.png',
       './assets/icons/icon-512.png'
   ];
   
   // Instalación y almacenamiento en caché
   self.addEventListener('install', e => {
       e.waitUntil(
           caches.open(CACHE)
               .then(cache => cache.addAll(FILES))
               .then(() => self.skipWaiting())
       );
   });
   
   // Activación y eliminación de cachés anteriores
   self.addEventListener('activate', e => {
       e.waitUntil(
           caches.keys()
               .then(keys => Promise.all(
                   keys
                       .filter(key => key !== CACHE)
                       .map(key => caches.delete(key))
               ))
               .then(() => self.clients.claim())
       );
   });
   
   // Solicitudes: se responde al instante desde la caché y, a la vez,
   // se descarga la versión nueva para la próxima vez.
   // Las llamadas a Supabase (otro dominio) no pasan por aquí.
   self.addEventListener('fetch', e => {
       const url = new URL(e.request.url);

       if (
           e.request.method !== 'GET' ||
           url.origin !== self.location.origin
       ) return;

       e.respondWith(
           caches.open(CACHE).then(cache =>
               cache.match(e.request, { ignoreSearch: true }).then(cached => {
                   const network = fetch(e.request)
                       .then(response => {
                           if (response.ok) cache.put(e.request, response.clone());
                           return response;
                       })
                       .catch(() => cached);

                   if (cached) {
                       e.waitUntil(network);
                       return cached;
                   }
                   return network;
               })
           )
       );
   });
