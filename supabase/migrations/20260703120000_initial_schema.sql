-- =============================================================================
-- Collab Platform — initial schema, RLS, functions & triggers
-- Three-space model (server / dm / private) built from one channel-type system.
-- Every table is RLS-locked; membership/permission logic lives in SECURITY
-- DEFINER helpers so policies never recurse on the tables they gate.
-- =============================================================================

-- ---------- ENUMS ----------
create type public.space_type   as enum ('server', 'dm', 'private');
create type public.channel_type as enum ('text','voice_video','whiteboard','todo','notes','reminders','docs_sheet','cubicle');
create type public.member_role  as enum ('owner','admin','moderator','member');
create type public.task_status  as enum ('todo','in_progress','done');

-- ---------- TABLES ----------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  status_line  text,                       -- "what they're working on"
  created_at   timestamptz not null default now()
);

create table public.spaces (
  id         uuid primary key default gen_random_uuid(),
  type       public.space_type not null,
  name       text,                          -- null for dm / private
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.space_members (
  space_id  uuid not null references public.spaces(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table public.channels (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  type          public.channel_type not null,
  name          text not null,
  position      int  not null default 0,
  owner_id      uuid references public.profiles(id) on delete cascade,  -- only set for cubicle
  embed_url     text,                                                   -- only for docs_sheet
  is_restricted boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.channel_access_overrides (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  can_view   boolean not null default false,
  can_edit   boolean not null default false,
  primary key (channel_id, user_id)         -- only populated when channel.is_restricted
);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  content    text not null,
  image_url  text,
  edited_at  timestamptz,
  created_at timestamptz not null default now()
);

create table public.reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.invites (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  code       text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  max_uses   int,
  uses_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  channel_id  uuid references public.channels(id) on delete set null,   -- postable from any channel
  title       text not null,
  description text,
  owner_id    uuid references public.profiles(id) on delete set null,   -- nullable = unassigned
  status      public.task_status not null default 'todo',
  due_at      timestamptz,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------- INDEXES ----------
create index idx_space_members_user on public.space_members(user_id);
create index idx_channels_space      on public.channels(space_id, position);
create index idx_overrides_channel   on public.channel_access_overrides(channel_id);
create index idx_messages_channel    on public.messages(channel_id, created_at);
create index idx_reactions_message   on public.reactions(message_id);
create index idx_tasks_space         on public.tasks(space_id);
create index idx_tasks_owner         on public.tasks(owner_id);
create index idx_invites_space       on public.invites(space_id);

-- =============================================================================
-- SECURITY DEFINER HELPERS
-- Called from RLS policies. DEFINER = they bypass RLS internally, so a policy
-- on space_members can safely ask "is this user a member?" without recursing.
-- =============================================================================
create or replace function public.is_space_member(p_space_id uuid, p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.space_members
                 where space_id = p_space_id and user_id = p_user_id);
$$;

create or replace function public.has_space_role(p_space_id uuid, p_user_id uuid, p_roles public.member_role[])
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.space_members
                 where space_id = p_space_id and user_id = p_user_id and role = any(p_roles));
$$;

create or replace function public.channel_space_id(p_channel_id uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select space_id from public.channels where id = p_channel_id;
$$;

create or replace function public.message_channel_id(p_message_id uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select channel_id from public.messages where id = p_message_id;
$$;

create or replace function public.can_view_channel(p_channel_id uuid, p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel_id
      and public.is_space_member(c.space_id, p_user_id)
      and (not c.is_restricted
           or exists (select 1 from public.channel_access_overrides o
                      where o.channel_id = c.id and o.user_id = p_user_id and o.can_view))
  );
$$;

create or replace function public.can_edit_channel(p_channel_id uuid, p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel_id
      and public.is_space_member(c.space_id, p_user_id)
      and (not c.is_restricted
           or exists (select 1 from public.channel_access_overrides o
                      where o.channel_id = c.id and o.user_id = p_user_id and o.can_edit))
  );
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles                 enable row level security;
alter table public.spaces                   enable row level security;
alter table public.space_members            enable row level security;
alter table public.channels                 enable row level security;
alter table public.channel_access_overrides enable row level security;
alter table public.messages                 enable row level security;
alter table public.reactions                enable row level security;
alter table public.invites                  enable row level security;
alter table public.tasks                    enable row level security;

-- profiles: readable by any signed-in user; you may only touch your own row
create policy profiles_select      on public.profiles for select to authenticated using (true);
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- spaces: members read; owner/admin edit; owner-only delete.
-- (inserts happen only via create_server_with_template / handle_new_user — both DEFINER)
create policy spaces_select on public.spaces for select to authenticated
  using (public.is_space_member(id, auth.uid()));
create policy spaces_update on public.spaces for update to authenticated
  using (public.has_space_role(id, auth.uid(), array['owner','admin']::public.member_role[]));
create policy spaces_delete on public.spaces for delete to authenticated
  using (public.has_space_role(id, auth.uid(), array['owner']::public.member_role[]));

-- space_members: members read; owner/admin manage; anyone can delete their own row (leave)
create policy sm_select on public.space_members for select to authenticated
  using (public.is_space_member(space_id, auth.uid()));
create policy sm_insert on public.space_members for insert to authenticated
  with check (public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]));
create policy sm_update on public.space_members for update to authenticated
  using (public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]));
create policy sm_delete on public.space_members for delete to authenticated
  using (public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[])
         or user_id = auth.uid());

-- channels: view gated by can_view_channel; owner/admin manage; cubicles owner-editable, never deletable
create policy channels_select on public.channels for select to authenticated
  using (public.can_view_channel(id, auth.uid()));
create policy channels_insert on public.channels for insert to authenticated
  with check (public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]));
create policy channels_update on public.channels for update to authenticated
  using (
    (type <> 'cubicle' and public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]))
    or (type = 'cubicle' and owner_id = auth.uid())
  );
create policy channels_delete on public.channels for delete to authenticated
  using (type <> 'cubicle' and public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]));

-- channel_access_overrides: affected user or owner/admin can read; owner/admin manage
create policy cao_select on public.channel_access_overrides for select to authenticated
  using (user_id = auth.uid()
         or public.has_space_role(public.channel_space_id(channel_id), auth.uid(), array['owner','admin']::public.member_role[]));
create policy cao_insert on public.channel_access_overrides for insert to authenticated
  with check (public.has_space_role(public.channel_space_id(channel_id), auth.uid(), array['owner','admin']::public.member_role[]));
create policy cao_update on public.channel_access_overrides for update to authenticated
  using (public.has_space_role(public.channel_space_id(channel_id), auth.uid(), array['owner','admin']::public.member_role[]));
create policy cao_delete on public.channel_access_overrides for delete to authenticated
  using (public.has_space_role(public.channel_space_id(channel_id), auth.uid(), array['owner','admin']::public.member_role[]));

-- messages: gated through the parent channel's view/edit permission
create policy messages_select on public.messages for select to authenticated
  using (public.can_view_channel(channel_id, auth.uid()));
create policy messages_insert on public.messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_edit_channel(channel_id, auth.uid()));
create policy messages_update on public.messages for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated
  using (author_id = auth.uid()
         or public.has_space_role(public.channel_space_id(channel_id), auth.uid(), array['owner','admin','moderator']::public.member_role[]));

-- reactions: gated through the message's channel
create policy reactions_select on public.reactions for select to authenticated
  using (public.can_view_channel(public.message_channel_id(message_id), auth.uid()));
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_edit_channel(public.message_channel_id(message_id), auth.uid()));
create policy reactions_delete on public.reactions for delete to authenticated
  using (user_id = auth.uid());

-- tasks: gated by parent channel when set, else by space membership
create policy tasks_select on public.tasks for select to authenticated
  using ((channel_id is not null and public.can_view_channel(channel_id, auth.uid()))
         or (channel_id is null and public.is_space_member(space_id, auth.uid())));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (created_by = auth.uid()
              and ((channel_id is not null and public.can_edit_channel(channel_id, auth.uid()))
                   or (channel_id is null and public.is_space_member(space_id, auth.uid()))));
create policy tasks_update on public.tasks for update to authenticated
  using (owner_id = auth.uid() or created_by = auth.uid()
         or public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]))
  with check (owner_id = auth.uid() or created_by = auth.uid()
              or public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]));
create policy tasks_delete on public.tasks for delete to authenticated
  using (created_by = auth.uid()
         or public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]));

-- invites: owner/admin only. Redemption is via redeem_invite() (DEFINER), never a direct read/insert.
create policy invites_select on public.invites for select to authenticated
  using (public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]));
create policy invites_insert on public.invites for insert to authenticated
  with check (created_by = auth.uid() and public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]));
create policy invites_update on public.invites for update to authenticated
  using (public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]));
create policy invites_delete on public.invites for delete to authenticated
  using (public.has_space_role(space_id, auth.uid(), array['owner','admin']::public.member_role[]));

-- =============================================================================
-- TRIGGERS & RPCs
-- =============================================================================

-- New auth user -> profile row + a personal Private space they own (always exists)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_space_id uuid;
begin
  insert into public.profiles (id) values (new.id);
  insert into public.spaces (type, name, created_by)
    values ('private', 'Private', new.id) returning id into v_space_id;
  insert into public.space_members (space_id, user_id, role)
    values (v_space_id, new.id, 'owner');
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- New member of a Server -> auto-create their cubicle channel in that server
create or replace function public.handle_new_server_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type public.space_type; v_name text;
begin
  select type into v_type from public.spaces where id = new.space_id;
  if v_type = 'server' then
    select coalesce(display_name, 'Member') into v_name from public.profiles where id = new.user_id;
    insert into public.channels (space_id, type, name, position, owner_id)
      values (new.space_id, 'cubicle', v_name || '''s cubicle', 1000, new.user_id);
  end if;
  return new;
end;
$$;
drop trigger if exists on_space_member_added on public.space_members;
create trigger on_space_member_added
  after insert on public.space_members
  for each row execute function public.handle_new_server_member();

-- Create a Server from the Project HQ template (space + owner + default channels), one txn
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
    (v_space_id, 'text',       'general',       0),
    (v_space_id, 'text',       'announcements', 1),
    (v_space_id, 'docs_sheet', 'Shared Docs',   2),
    (v_space_id, 'todo',       'Tasks',         3);

  return v_space_id;
end;
$$;

-- Redeem an invite code: validate (exists / not expired / under max_uses), join, bump count — one txn.
-- Raises 'invite_not_found' | 'invite_expired' | 'invite_exhausted' for the UI to map.
create or replace function public.redeem_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_invite public.invites; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_invite from public.invites where code = p_code for update;
  if not found then raise exception 'invite_not_found'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if v_invite.max_uses is not null and v_invite.uses_count >= v_invite.max_uses then
    raise exception 'invite_exhausted';
  end if;

  insert into public.space_members (space_id, user_id, role)   -- fires cubicle trigger if it's a server
    values (v_invite.space_id, v_uid, 'member')
    on conflict (space_id, user_id) do nothing;

  update public.invites set uses_count = uses_count + 1 where id = v_invite.id;
  return v_invite.space_id;
end;
$$;

-- =============================================================================
-- GRANTS — the authenticated role needs table + function access; RLS still gates rows.
-- =============================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.is_space_member(uuid, uuid) to authenticated;
grant execute on function public.has_space_role(uuid, uuid, public.member_role[]) to authenticated;
grant execute on function public.channel_space_id(uuid) to authenticated;
grant execute on function public.message_channel_id(uuid) to authenticated;
grant execute on function public.can_view_channel(uuid, uuid) to authenticated;
grant execute on function public.can_edit_channel(uuid, uuid) to authenticated;
grant execute on function public.create_server_with_template(text) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
