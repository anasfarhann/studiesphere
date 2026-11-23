-- Page version history: periodic full-page snapshots, latest 30 kept per page.
--
-- elements: the page's full element JSON (array) at snapshot time; element_count is stored so the
-- history list does not have to download the elements.
-- Snapshots are immutable: RLS allows select / insert / delete for the owner, no update.
create table public.page_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page_id uuid not null,
  elements jsonb not null,
  element_count integer not null default 0,
  created_at timestamptz not null default now(),
  -- Composite FK: a snapshot must belong to a page of the same owner.
  foreign key (page_id, owner_id) references public.pages (id, owner_id) on delete cascade
);
create index page_snapshots_page_created_idx on public.page_snapshots (page_id, created_at desc);

alter table public.page_snapshots enable row level security;
create policy page_snapshots_select_own on public.page_snapshots for select to authenticated using (owner_id = auth.uid());
create policy page_snapshots_insert_own on public.page_snapshots for insert to authenticated with check (owner_id = auth.uid());
create policy page_snapshots_delete_own on public.page_snapshots for delete to authenticated using (owner_id = auth.uid());

-- Inserts a snapshot and prunes the page to its latest 30 in one call (one transaction).
-- SECURITY INVOKER: RLS applies to both statements.
create or replace function public.create_snapshot(p_page uuid, p_elements jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_elements is null or jsonb_typeof(p_elements) <> 'array' then
    raise exception 'p_elements must be a json array';
  end if;

  insert into public.page_snapshots (page_id, elements, element_count)
  values (p_page, p_elements, jsonb_array_length(p_elements));

  delete from public.page_snapshots
  where page_id = p_page
    and id not in (
      select s.id from public.page_snapshots s
      where s.page_id = p_page
      order by s.created_at desc, s.id desc
      limit 30
    );
end;
$$;

revoke execute on function public.create_snapshot(uuid, jsonb) from public, anon;
grant execute on function public.create_snapshot(uuid, jsonb) to authenticated;
