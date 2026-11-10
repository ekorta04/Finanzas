-- =====================================================================
-- FINANZAS · Esquema base (cuentas, movimientos, importaciones)
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede ejecutar más de una vez sin problema.
-- Después ejecuta también supabase/user_settings.sql (si no existe ya).
-- =====================================================================

-- ---------- Cuentas bancarias ----------
create table if not exists public.accounts (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
    name       text not null,
    bank_name  text,
    currency   text not null default 'EUR',
    created_at timestamptz not null default now()
);

-- ---------- Historial de importaciones ----------
create table if not exists public.imports (
    id             uuid primary key default gen_random_uuid(),
    account_id     uuid not null references public.accounts (id) on delete cascade,
    user_id        uuid not null default auth.uid()
                   references auth.users (id) on delete cascade,
    file_name      text,
    total_rows     integer not null default 0,
    imported_rows  integer not null default 0,
    duplicate_rows integer not null default 0,
    error_rows     integer not null default 0,
    status         text not null default 'completed',
    created_at     timestamptz not null default now()
);

-- ---------- Movimientos ----------
create table if not exists public.transactions (
    id              bigint generated always as identity primary key,
    account_id      uuid not null references public.accounts (id) on delete cascade,
    user_id         uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
    import_id       uuid references public.imports (id) on delete set null,
    source_key      text not null,
    operation_date  date not null,
    value_date      date,
    description     text not null,
    amount          numeric(14,2) not null,
    balance         numeric(14,2),
    category        text not null default 'Sin clasificar',
    manual_category boolean not null default false,
    created_at      timestamptz not null default now(),
    unique (account_id, source_key)
);

create index if not exists transactions_account_date_idx
    on public.transactions (account_id, operation_date desc);

-- ---------- Seguridad: cada usuario solo ve lo suyo ----------
alter table public.accounts     enable row level security;
alter table public.imports      enable row level security;
alter table public.transactions enable row level security;

do $$
declare t text;
begin
    foreach t in array array['accounts', 'imports', 'transactions'] loop
        execute format('drop policy if exists "%1$s_select_own" on public.%1$s', t);
        execute format('create policy "%1$s_select_own" on public.%1$s for select to authenticated using (auth.uid() = user_id)', t);

        execute format('drop policy if exists "%1$s_insert_own" on public.%1$s', t);
        execute format('create policy "%1$s_insert_own" on public.%1$s for insert to authenticated with check (auth.uid() = user_id)', t);

        execute format('drop policy if exists "%1$s_update_own" on public.%1$s', t);
        execute format('create policy "%1$s_update_own" on public.%1$s for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);

        execute format('drop policy if exists "%1$s_delete_own" on public.%1$s', t);
        execute format('create policy "%1$s_delete_own" on public.%1$s for delete to authenticated using (auth.uid() = user_id)', t);

        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end loop;
end $$;

-- ---------- Importar un CSV (la app llama a esta función) ----------
-- Los movimientos cuya clave (source_key) ya existe en la cuenta se
-- cuentan como duplicados y no se vuelven a insertar.
create or replace function public.import_bank_csv(
    p_account_id uuid,
    p_file_name  text,
    p_rows       jsonb,
    p_error_rows integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_import_id uuid;
    v_total     integer := coalesce(jsonb_array_length(p_rows), 0);
    v_inserted  integer := 0;
begin
    if auth.uid() is null then
        raise exception 'Debes iniciar sesión.';
    end if;

    if not exists (
        select 1 from public.accounts
        where id = p_account_id and user_id = auth.uid()
    ) then
        raise exception 'La cuenta no existe o no es tuya.';
    end if;

    insert into public.imports (account_id, user_id, file_name, total_rows, error_rows)
    values (p_account_id, auth.uid(), p_file_name, v_total, coalesce(p_error_rows, 0))
    returning id into v_import_id;

    with ins as (
        insert into public.transactions (
            account_id, user_id, import_id, source_key,
            operation_date, value_date, description,
            amount, balance, category, manual_category
        )
        select
            p_account_id, auth.uid(), v_import_id, r.k,
            r.d::date, coalesce(r.v, r.d)::date, r.c,
            r.i, r.s, coalesce(r.cat, 'Sin clasificar'), coalesce(r.man, false)
        from jsonb_to_recordset(p_rows) as r(
            k text, d text, v text, c text, i numeric, s numeric, cat text, man boolean
        )
        on conflict (account_id, source_key) do nothing
        returning 1
    )
    select count(*) into v_inserted from ins;

    update public.imports
       set imported_rows  = v_inserted,
           duplicate_rows = v_total - v_inserted
     where id = v_import_id;

    return jsonb_build_object(
        'import_id',      v_import_id,
        'total_rows',     v_total,
        'imported_rows',  v_inserted,
        'duplicate_rows', v_total - v_inserted,
        'error_rows',     coalesce(p_error_rows, 0)
    );
end;
$$;

grant execute on function public.import_bank_csv(uuid, text, jsonb, integer) to authenticated;
