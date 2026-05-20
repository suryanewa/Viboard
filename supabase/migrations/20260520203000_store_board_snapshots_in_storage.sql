-- Store heavy Viboard snapshots in Supabase Storage and keep Postgres rows
-- limited to metadata plus a pointer to the latest snapshot object.

alter table public.moodboards
  add column if not exists snapshot_path text,
  add column if not exists snapshot_size integer,
  add column if not exists snapshot_storage_version integer not null default 1,
  add column if not exists snapshot_compressed text,
  add column if not exists snapshot_encoding text;

alter table public.moodboards
  alter column snapshot set default '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-snapshots',
  'board-snapshots',
  false,
  52428800,
  array['application/json', 'application/gzip']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  policy_name text;
begin
  for policy_name in
    select pol.polname
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'storage'
      and cls.relname = 'objects'
      and pol.polname like 'board_snapshots_%'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_name);
  end loop;
end;
$$;

create policy "board_snapshots_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'board-snapshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "board_snapshots_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'board-snapshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "board_snapshots_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'board-snapshots'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'board-snapshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "board_snapshots_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'board-snapshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);
