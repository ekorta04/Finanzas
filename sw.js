/* ==========================================================================
   SERVICE WORKER - FINANZAS KUTXA
   Caché de los archivos de la aplicación
   ========================================================================== */

   const CACHE = 'finanzas-v5';

   const FILES = [
       './',
       './index.html',
       './privacy.html',
       './manifest.webmanifest',
   
       // CSS
       './css/styles.css',
   
       // JavaScript
       './js/supabase.js',
       './js/auth.js',
       './js/database.js',
       './js/state.js',
       './js/utils.js',
       './js/storage.js',
       './js/csv.js',
       './js/csv-universal.js',
       './js/bizum.js',
       './js/tags.js',
       './js/dashboard.js',
       './js/movimientos.js',
       './js/inversion.js',
       './js/presupuestos.js',
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
   
   // Solicitudes: primero red, después caché
   self.addEventListener('fetch', e => {
       const url = new URL(e.request.url);
   
       if (
           e.request.method !== 'GET' ||
           url.origin !== self.location.origin
       ) return;
   
       e.respondWith(
           fetch(e.request)
               .then(response => {
                   if (response.ok) {
                       const copy = response.clone();
   
                       caches.open(CACHE)
                           .then(cache => cache.put(e.request, copy));
                   }
   
                   return response;
               })
               .catch(() => caches.match(e.request))
       );
   });
   