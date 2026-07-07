-- =============================================================================
-- leave_space: let a member remove themselves from a team (used by the
-- right-click "Leave team" action). The owner can't leave — they'd orphan the
-- team — so that's blocked. SECURITY DEFINER so RLS on space_members doesn't
-- get in the way of a self-delete.
-- =============================================================================

create or replace function public.leave_space(p_space_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role public.member_role;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select role into v_role from public.space_members where space_id = p_space_id and user_id = v_uid;
  if v_role is null then raise exception 'not a member'; end if;
  if v_role = 'owner' then raise exception 'the owner cannot leave the team'; end if;
  delete from public.space_members where space_id = p_space_id and user_id = v_uid;
end;
$$;

grant execute on function public.leave_space(uuid) to authenticated;
