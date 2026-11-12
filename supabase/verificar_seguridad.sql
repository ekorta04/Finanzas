-- =====================================================================
-- FINANZAS · Comprobar la seguridad de la base de datos
-- Solo LEE: no cambia nada. Se puede ejecutar cuando quieras.
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo → Run.
--
-- Devuelve una fila por tabla. La columna "estado" debe ser OK en todas:
--   rls_activo            → true  (la tabla filtra por usuario)
--   politicas             → al menos 1
--   abiertas_a_anon       → 0     (ninguna política deja entrar sin sesión)
--   sin_filtro_de_usuario → 0     (todas comparan con auth.uid())
-- Si alguna sale REVISAR, ejecuta supabase/schema.sql, user_settings.sql y
-- app_errors.sql (y después endurecer_seguridad.sql) y vuelve a comprobar.
-- =====================================================================

select t.tabla,
       t.rls as rls_activo,
       count(p.policyname) as politicas,
       count(p.policyname) filter (where p.roles::text ~ '(anon|public)') as abiertas_a_anon,
       count(p.policyname) filter (
           where position('auth.uid()' in coalesce(p.qual, p.with_check, '')) = 0
       ) as sin_filtro_de_usuario,
       case
           when t.rls
            and count(p.policyname) > 0
            and count(p.policyname) filter (where p.roles::text ~ '(anon|public)') = 0
            and count(p.policyname) filter (
                    where position('auth.uid()' in coalesce(p.qual, p.with_check, '')) = 0
                ) = 0
           then 'OK' else 'REVISAR'
       end as estado
from (
    select c.relname as tabla, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
) t
left join pg_policies p
       on p.schemaname = 'public' and p.tablename = t.tabla
group by t.tabla, t.rls
order by t.tabla;
