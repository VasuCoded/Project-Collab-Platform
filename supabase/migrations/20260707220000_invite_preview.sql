-- =============================================================================
-- invite_preview: look up a team behind an invite code without joining, so the
-- /join page can show the team name + member count (Discord-style invite card)
-- before the person accepts. SECURITY DEFINER so a non-member can read it.
-- =============================================================================

create or replace function public.invite_preview(p_code text)
returns table (space_id uuid, space_name text, member_count int, status text)
language plpgsql security definer set search_path = public stable as $$
declare v_invite public.invites; v_name text; v_count int;
begin
  select * into v_invite from public.invites where code = p_code;
  if not found then
    return query select null::uuid, null::text, 0, 'invalid';
    return;
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return query select v_invite.space_id, null::text, 0, 'expired';
    return;
  end if;
  if v_invite.max_uses is not null and v_invite.uses_count >= v_invite.max_uses then
    return query select v_invite.space_id, null::text, 0, 'exhausted';
    return;
  end if;
  select name into v_name from public.spaces where id = v_invite.space_id;
  select count(*)::int into v_count from public.space_members where space_id = v_invite.space_id;
  return query select v_invite.space_id, coalesce(v_name, 'a team'), v_count, 'ok';
end;
$$;

grant execute on function public.invite_preview(text) to authenticated;
