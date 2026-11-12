-- =====================================================================
-- FINANZAS · Registro de errores de la app
-- La app apunta aquí cuando algo falla (solo el mensaje del error, nunca
-- importes ni movimientos). La comprobación diaria lo lee y avisa.
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede ejecutar más de una vez sin problema.
-- =====================================================================

create table if not exists public.app_errors (
    id          bigint generated always as identity primary key,
    user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
    created_at  timestamptz not null default now(),
    kind        text not null default 'error',
    message     text not null,
    stack       text,
    page        text,
    app_version text,
    user_agent  text
);

create index if not exists app_errors_created_idx
    on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;

-- Cada usuario solo puede apuntar y ver sus propios errores
drop policy if exists "app_errors_insert_own" on public.app_errors;
create policy "app_errors_insert_own" on public.app_errors
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "app_errors_select_own" on public.app_errors;
create policy "app_errors_select_own" on public.app_errors
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists "app_errors_delete_own" on public.app_errors;
create policy "app_errors_delete_own" on public.app_errors
    for delete to authenticated
    using (auth.uid() = user_id);

grant select, insert, delete on public.app_errors to authenticated;
