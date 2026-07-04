-- =============================================================================
-- Direct messages — there was no way to start a 1:1 conversation. This adds an
-- idempotent "open a DM with this person" RPC: it returns the existing 1:1 dm
-- space if one exists, otherwise creates the space, both memberships, and a
-- single text channel to talk in. DEFINER so it can add the *other* person as a
-- member (sm_insert would otherwise require owner/admin).
-- =============================================================================
create or replace function public.create_or_get_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_space uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_other = v_uid then raise exception 'cannot DM yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'no such user';
  end if;

  -- Existing 1:1 dm: a dm space where both are members and there are exactly two.
  select s.id into v_space
  from public.spaces s
  join public.space_members a on a.space_id = s.id and a.user_id = v_uid
  join public.space_members b on b.space_id = s.id and b.user_id = p_other
  where s.type = 'dm'
    and (select count(*) from public.space_members m where m.space_id = s.id) = 2
  limit 1;

  if v_space is not null then
    return v_space;
  end if;

  insert into public.spaces (type, name, created_by)
    values ('dm', null, v_uid) returning id into v_space;
  insert into public.space_members (space_id, user_id, role)
    values (v_space, v_uid, 'member'), (v_space, p_other, 'member');
  insert into public.channels (space_id, type, name, position)
    values (v_space, 'text', 'direct', 0);

  return v_space;
end;
$$;

grant execute on function public.create_or_get_dm(uuid) to authenticated;
