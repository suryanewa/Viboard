-- Viboard stores board metadata and snapshots in public.moodboards.
-- Keep client-facing policies on auth.uid() so browser requests never need
-- direct privileges on custom/private schemas.

create extension if not exists pgcrypto;

create table if not exists public.moodboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Board',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_moodboards_updated_at on public.moodboards;

create trigger set_moodboards_updated_at
before update on public.moodboards
for each row
execute function public.set_updated_at();

alter table public.moodboards enable row level security;

-- Replace any existing policies. In particular, this removes policies that
-- call helper functions in a private schema, which causes browser inserts to
-- fail with "permission denied for schema private".
do $$
declare
  policy_name text;
begin
  for policy_name in
    select pol.polname
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname = 'moodboards'
  loop
    execute format('drop policy if exists %I on public.moodboards', policy_name);
  end loop;
end;
$$;

create policy "moodboards_select_own"
on public.moodboards
for select
to authenticated
using (user_id = auth.uid());

create policy "moodboards_insert_own"
on public.moodboards
for insert
to authenticated
with check (user_id = auth.uid());

create policy "moodboards_update_own"
on public.moodboards
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "moodboards_delete_own"
on public.moodboards
for delete
to authenticated
using (user_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.moodboards to authenticated;
