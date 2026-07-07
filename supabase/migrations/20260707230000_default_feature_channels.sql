-- =============================================================================
-- Make the product's features discoverable. A new team only shipped with
-- general / announcements / Shared Docs / Tasks, so the whiteboard, notes,
-- reminders, and voice channels never appeared — you couldn't launch a
-- whiteboard without first knowing to add one (and members can't add channels).
--
-- 1. New teams now come with a channel for every feature.
-- 2. Backfill existing teams with any feature channel they're missing.
-- =============================================================================

create or replace function public.create_server_with_template(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_space_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  insert into public.spaces (type, name, created_by)
    values ('server', p_name, v_uid) returning id into v_space_id;

  insert into public.space_members (space_id, user_id, role)   -- fires the cubicle trigger for the owner
    values (v_space_id, v_uid, 'owner');

  insert into public.channels (space_id, type, name, position) values
    (v_space_id, 'text',        'general',       0),
    (v_space_id, 'text',        'announcements', 1),
    (v_space_id, 'whiteboard',  'Whiteboard',    2),
    (v_space_id, 'todo',        'Tasks',         3),
    (v_space_id, 'notes',       'Notes',         4),
    (v_space_id, 'reminders',   'Reminders',     5),
    (v_space_id, 'voice_video', 'Voice',         6),
    (v_space_id, 'docs_sheet',  'Shared Docs',   7);

  return v_space_id;
end;
$$;

grant execute on function public.create_server_with_template(text) to authenticated;

-- Backfill: give every existing server any feature channel it doesn't have yet.
insert into public.channels (space_id, type, name, position)
select s.id, v.type, v.name, v.position
from public.spaces s
cross join (values
  ('whiteboard',  'Whiteboard', 20),
  ('todo',        'Tasks',      21),
  ('notes',       'Notes',      22),
  ('reminders',   'Reminders',  23),
  ('voice_video', 'Voice',      24)
) as v(type, name, position)
where s.type = 'server'
  and not exists (
    select 1 from public.channels c where c.space_id = s.id and c.type = v.type
  );
