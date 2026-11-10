/* Configuración de Tailwind.
   Para regenerar css/tailwind.css tras cambiar clases en el HTML o el JS:
   npx tailwindcss@3.4.17 -i css/tailwind.src.css -o css/tailwind.css --minify */
module.exports = {
    darkMode: 'media',
    content: ['./index.html', './js/**/*.js'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a'
                }
            }
        }
    }
};
