-- Row-level save of canvas elements with per-element last-write-wins.
--
-- p_rows: jsonb array of {id, type, data, z, updated_at}; data is the full element JSON.
-- An upsert only replaces a row whose updated_at is not newer (an older batch replayed late, or from
-- another device, never overwrites newer work). Deletes are tombstones (deleted = true) whose
-- updated_at is pushed strictly past the row's last value, so a late replay of an older upsert -- even
-- one carrying the very same updated_at -- cannot bring the element back. A delete for an id that was
-- never saved matches no row and is a no-op.
--
-- SECURITY INVOKER: RLS (owner_id = auth.uid()) applies to every statement. The composite FK
-- (page_id, owner_id) -> pages(id, owner_id) rejects rows for another user's page.
create or replace function public.save_elements(p_page uuid, p_rows jsonb, p_deleted uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_rows is not null and jsonb_typeof(p_rows) = 'array' and jsonb_array_length(p_rows) > 0 then
    insert into public.canvas_elements as ce (id, page_id, type, data, z, deleted, updated_at)
    select r.id, p_page, r.type, r.data, r.z, false, r.updated_at
    from jsonb_to_recordset(p_rows) as r(id uuid, type text, data jsonb, z double precision, updated_at timestamptz)
    on conflict (id) do update
      set type = excluded.type,
          data = excluded.data,
          z = excluded.z,
          deleted = false,
          updated_at = excluded.updated_at
      where excluded.updated_at >= ce.updated_at
        and ce.owner_id = (select auth.uid())
        and ce.page_id = excluded.page_id;
  end if;

  if p_deleted is not null and cardinality(p_deleted) > 0 then
    update public.canvas_elements as ce
       set deleted = true,
           updated_at = greatest(now(), ce.updated_at + interval '1 millisecond')
     where ce.id = any(p_deleted)
       and ce.page_id = p_page
       and ce.owner_id = (select auth.uid())
       and ce.deleted = false;
  end if;
end;
$$;

revoke execute on function public.save_elements(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.save_elements(uuid, jsonb, uuid[]) to authenticated;
