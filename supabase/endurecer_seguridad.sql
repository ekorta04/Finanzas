-- =====================================================================
-- FINANZAS · Endurecer la seguridad (capa extra, opcional pero recomendada)
-- La app solo entra con sesión iniciada (rol "authenticated"). Supabase, por
-- defecto, también da permisos al rol anónimo (la clave pública sin sesión):
-- no sirven para nada aquí y las políticas ya los frenan, pero es mejor
-- quitárselos y no depender de una sola barrera.
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede ejecutar más de una vez sin problema. Ejecútalo después de
-- schema.sql, user_settings.sql y app_errors.sql.
-- Después, supabase/verificar_seguridad.sql para comprobarlo.
-- =====================================================================

do $$
declare t text;
begin
    -- El rol anónimo no necesita tocar ninguna tabla de la app
    foreach t in array array['accounts', 'imports', 'transactions', 'user_settings', 'app_errors'] loop
        if to_regclass('public.' || t) is not null then
            execute format('revoke all on public.%I from anon', t);
        end if;
    end loop;

    -- La importación del CSV solo se puede llamar con sesión iniciada
    if to_regprocedure('public.import_bank_csv(uuid, text, jsonb, integer)') is not null then
        revoke execute on function public.import_bank_csv(uuid, text, jsonb, integer) from anon, public;
        grant  execute on function public.import_bank_csv(uuid, text, jsonb, integer) to authenticated;
    end if;
end $$;

-- Las tablas que se creen en el futuro tampoco se abren al rol anónimo por defecto
alter default privileges in schema public revoke all on tables from anon;
