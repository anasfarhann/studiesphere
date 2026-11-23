-- Studiesphere initial schema. Every user-data table has RLS: owner_id = auth.uid().

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Users may only change display_name; plan is managed server-side.
-- Rows are created by trigger and removed by cascade from auth.users, so no
-- insert/delete policies exist.
revoke insert, update, delete on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- subjects
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

-- --------------------------------------------------------------- notebooks
create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  -- Composite FK: a parent must belong to the same owner (FK checks bypass RLS).
  foreign key (subject_id, owner_id) references public.subjects (id, owner_id) on delete cascade
);
create index notebooks_subject_id_idx on public.notebooks (subject_id, owner_id);
create trigger notebooks_set_updated_at
  before update on public.notebooks
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------- pages
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  notebook_id uuid not null,
  title text not null default 'Untitled',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (notebook_id, owner_id) references public.notebooks (id, owner_id) on delete cascade
);
create index pages_notebook_id_idx on public.pages (notebook_id, owner_id);
create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------- canvas_elements
-- updated_at is client-supplied (last-write-wins merge), so no trigger.
create table public.canvas_elements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page_id uuid not null,
  type text not null,
  data jsonb not null,
  z double precision not null,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  foreign key (page_id, owner_id) references public.pages (id, owner_id) on delete cascade
);
create index canvas_elements_page_id_deleted_idx on public.canvas_elements (page_id, deleted);

-- ------------------------------------------------------ RLS for user tables
alter table public.subjects enable row level security;
alter table public.notebooks enable row level security;
alter table public.pages enable row level security;
alter table public.canvas_elements enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['subjects', 'notebooks', 'pages', 'canvas_elements'] loop
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = auth.uid())', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid())', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = auth.uid())', t || '_delete_own', t);
  end loop;
end;
$$;

-- ----------------------------------------------------------------- storage
-- Object path: {owner_id}/{page_id}/{uuid}.{ext}; 50 MB per-file limit.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do nothing;

create policy "attachments_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
