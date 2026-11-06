/* ==========================================
   FINANZAS KUTXA
   CONEXIÓN CON SUPABASE
   ========================================== */

   const SUPABASE_URL = 'https://suhuvgoafcbgdsduxscb.supabase.co';

   const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_s9lEFM2fuQf76q0miwdTjA_QkULdaKa';
   
   // Cliente de Supabase
   const supabaseClient = window.supabase.createClient(
       SUPABASE_URL,
       SUPABASE_PUBLISHABLE_KEY
   );
   

