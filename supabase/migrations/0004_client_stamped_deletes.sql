-- Client-stamped tombstones. A delete carries the client's updated_at, so deletes and upserts from one
-- author are ordered by one clock (last-write-wins for both). Previously the server stamped a delete with
-- its own now(), which could be newer than a later undo's upsert and silently reject the restore.
--
-- p_deleted: jsonb array of {id, updated_at}. A delete applies only when d.updated_at >= the row's
-- updated_at; a delete for an id that was never saved matches no row and is a no-op (batches are
-- serialised oldest-first, so no older upsert of that id can still be in flight from the same device).
-- Upserts are unchanged. SECURITY INVOKER: RLS applies; owner and page guards are explicit.
drop function if exists public.save_elements(uuid, jsonb, uuid[]);

create or replace function public.save_elements(p_page uuid, p_rows jsonb, p_deleted jsonb)
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

  if p_deleted is not null and jsonb_typeof(p_deleted) = 'array' and jsonb_array_length(p_deleted) > 0 then
    update public.canvas_elements as ce
       set deleted = true,
           updated_at = d.updated_at
      from jsonb_to_recordset(p_deleted) as d(id uuid, updated_at timestamptz)
     where ce.id = d.id
       and ce.page_id = p_page
       and ce.owner_id = (select auth.uid())
       and d.updated_at >= ce.updated_at;
  end if;
end;
$$;

revoke execute on function public.save_elements(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_elements(uuid, jsonb, jsonb) to authenticated;
