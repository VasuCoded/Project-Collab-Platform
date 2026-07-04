-- =============================================================================
-- Make cubicles actually private.
-- Cubicles were created non-restricted, so every member of a server could see
-- (and post in) everyone else's cubicle. A cubicle is meant to be a personal
-- focus space — only its owner should access it. Restrict the channel and grant
-- the owner an explicit view/edit override, both for new cubicles (trigger) and
-- existing ones (backfill).
-- =============================================================================

create or replace function public.handle_new_server_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type public.space_type; v_name text; v_channel uuid;
begin
  select type into v_type from public.spaces where id = new.space_id;
  if v_type = 'server' then
    select coalesce(display_name, 'Member') into v_name from public.profiles where id = new.user_id;
    insert into public.channels (space_id, type, name, position, owner_id, is_restricted)
      values (new.space_id, 'cubicle', v_name || '''s cubicle', 1000, new.user_id, true)
      returning id into v_channel;
    insert into public.channel_access_overrides (channel_id, user_id, can_view, can_edit)
      values (v_channel, new.user_id, true, true)
      on conflict (channel_id, user_id) do update set can_view = true, can_edit = true;
  end if;
  return new;
end;
$$;

-- Backfill: lock down every existing cubicle and give its owner access.
update public.channels set is_restricted = true where type = 'cubicle' and is_restricted = false;

insert into public.channel_access_overrides (channel_id, user_id, can_view, can_edit)
  select c.id, c.owner_id, true, true
  from public.channels c
  where c.type = 'cubicle' and c.owner_id is not null
  on conflict (channel_id, user_id) do update set can_view = true, can_edit = true;
