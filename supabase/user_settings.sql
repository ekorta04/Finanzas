-- =====================================================================
-- FINANZAS · Ajustes sincronizados entre dispositivos
-- Guarda en la base de datos lo que antes solo vivía en cada navegador:
-- reglas, presupuestos, etiquetas, Bizums vinculados, sugerencias
-- descartadas, ajustes, histórico de importaciones e inversión.
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

create table if not exists public.user_settings (
    user_id    uuid primary key default auth.uid()
               references auth.users (id) on delete cascade,
    data       jsonb       not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

-- Cada usuario solo ve y modifica su propia fila
drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own" on public.user_settings
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own" on public.user_settings
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "user_settings_delete_own" on public.user_settings;
create policy "user_settings_delete_own" on public.user_settings
    for delete to authenticated
    using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_settings to authenticated;
