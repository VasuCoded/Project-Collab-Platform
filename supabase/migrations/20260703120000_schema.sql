-- =============================================================================
-- Collab platform — full schema, squashed into one file.
-- Run top-to-bottom on a fresh database to reproduce the whole schema. The live
-- database already has this applied. New DB changes get appended at the bottom
-- (the appended sections are idempotent / re-runnable).
-- =============================================================================

-- ===== 20260703120000_initial_schema.sql =====

-- =============================================================================
-- Collab Platform — initial schema, RLS, functions & triggers
-- Three-space model (server / dm / private) built from one channel-type system.
-- Every table is RLS-locked; membership/permission logic lives in SECURITY
-- DEFINER helpers so policies never recurse on the tables they gate.
-- =============================================================================

-- ---------- ENUMS ----------
create type public.space_type   as enum ('server', 'dm', 'private');
create type public.channel_type as enum ('text','voice_video','whiteboard','board','todo','notes','reminders','docs_sheet','cubicle');
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

-- Add a channel through a DEFINER function (same pattern as create_server_with_template).
-- The direct client insert is blocked by the channels RLS policy, so the "Add Channel"
-- UI calls this instead; it does its own owner/admin check and inserts as definer.
create or replace function public.create_channel(p_space_id uuid, p_type text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_pos int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.has_space_role(p_space_id, v_uid, array['owner','admin']::public.member_role[]) then
    raise exception 'only owners and admins can add channels';
  end if;
  select coalesce(max(position) + 1, 0) into v_pos from public.channels where space_id = p_space_id;
  insert into public.channels (space_id, type, name, position)
    values (p_space_id, p_type::public.channel_type, p_name, v_pos)
    returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.create_channel(uuid, text, text) to authenticated;

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

-- ===== 20260703120100_storage_avatars.sql =====

-- Avatars bucket for profile pictures.
-- Public read; each user may only write inside their own <uid>/ folder.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users upload to their own avatar folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users update their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== 20260703130000_chat_realtime.sql =====

-- Storage bucket for message images (public read; any signed-in user may upload).
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

create policy "chat images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'chat-images');

create policy "signed-in users upload chat images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-images');

-- Enable realtime (postgres_changes) for live messages and reactions.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reactions') then
    alter publication supabase_realtime add table public.reactions;
  end if;
end $$;

-- ===== 20260703140000_membership_rpcs.sql =====

-- Generate an invite code for a space (owner/admin only).
create or replace function public.generate_invite(p_space_id uuid, p_max_uses int default null, p_expires_at timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_code text;
begin
  if not public.has_space_role(p_space_id, v_uid, array['owner','admin']::public.member_role[]) then
    raise exception 'not allowed';
  end if;
  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  insert into public.invites (space_id, code, created_by, max_uses, expires_at)
    values (p_space_id, v_code, v_uid, p_max_uses, p_expires_at);
  return v_code;
end;
$$;

-- Change a member's role (owner/admin only; never the owner, never yourself, never to owner).
create or replace function public.set_member_role(p_space_id uuid, p_user_id uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_target public.member_role;
begin
  if not public.has_space_role(p_space_id, v_uid, array['owner','admin']::public.member_role[]) then
    raise exception 'not allowed';
  end if;
  if p_user_id = v_uid then raise exception 'cannot change your own role'; end if;
  if p_role = 'owner' then raise exception 'cannot assign owner'; end if;
  select role into v_target from public.space_members where space_id = p_space_id and user_id = p_user_id;
  if v_target is null then raise exception 'not a member'; end if;
  if v_target = 'owner' then raise exception 'cannot change the owner'; end if;
  update public.space_members set role = p_role where space_id = p_space_id and user_id = p_user_id;
end;
$$;

-- Remove a member (owner/admin only; never the owner, never yourself).
create or replace function public.remove_member(p_space_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_target public.member_role;
begin
  if not public.has_space_role(p_space_id, v_uid, array['owner','admin']::public.member_role[]) then
    raise exception 'not allowed';
  end if;
  if p_user_id = v_uid then raise exception 'use leave, not remove, on yourself'; end if;
  select role into v_target from public.space_members where space_id = p_space_id and user_id = p_user_id;
  if v_target = 'owner' then raise exception 'cannot remove the owner'; end if;
  delete from public.space_members where space_id = p_space_id and user_id = p_user_id;
end;
$$;

grant execute on function public.generate_invite(uuid, int, timestamptz) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.member_role) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- ===== 20260703150000_whiteboards.sql =====

-- Persisted Excalidraw scene, one row per whiteboard channel.
-- Live drawing syncs peer-to-peer over Realtime broadcast; this table is the
-- durable copy, so the board is still there on reload and for people who join later.
create table if not exists public.whiteboards (
  channel_id uuid primary key references public.channels(id) on delete cascade,
  elements   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.whiteboards enable row level security;

-- Same gate as messages: you can read or write a board if you can view or edit its channel.
create policy whiteboards_select on public.whiteboards for select to authenticated
  using (public.can_view_channel(channel_id, auth.uid()));
create policy whiteboards_insert on public.whiteboards for insert to authenticated
  with check (public.can_edit_channel(channel_id, auth.uid()));
create policy whiteboards_update on public.whiteboards for update to authenticated
  using (public.can_edit_channel(channel_id, auth.uid()))
  with check (public.can_edit_channel(channel_id, auth.uid()));

-- ===== 20260703160000_whiteboard_in_template.sql =====

-- Add a Whiteboard channel to the default server template, so every new server
-- ships with the embedded collaborative canvas alongside chat, docs, and tasks.
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
    (v_space_id, 'whiteboard', 'Whiteboard',    3),
    (v_space_id, 'todo',       'Tasks',         4);

  return v_space_id;
end;
$$;

-- ===== 20260704170000_read_state.sql =====

-- =============================================================================
-- Read state — per-user, per-channel "last seen" marker so the app can compute
-- unread counts for the rail DM dot, the desk DM list, and team activity.
-- =============================================================================

create table public.read_state (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  channel_id   uuid not null references public.channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

create index idx_read_state_user on public.read_state(user_id);

alter table public.read_state enable row level security;

-- You only ever see or touch your own read markers.
create policy read_state_select on public.read_state for select to authenticated
  using (user_id = auth.uid());
create policy read_state_insert on public.read_state for insert to authenticated
  with check (user_id = auth.uid());
create policy read_state_update on public.read_state for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy read_state_delete on public.read_state for delete to authenticated
  using (user_id = auth.uid());

-- Stamp a channel as read up to "now" for the current user.
create or replace function public.mark_channel_read(p_channel_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.read_state (user_id, channel_id, last_read_at)
    values (auth.uid(), p_channel_id, now())
    on conflict (user_id, channel_id) do update set last_read_at = now();
end;
$$;

-- Per-space unread summary for the current user: how many messages (from other
-- people) landed after their last read, plus the space's most recent activity.
-- DEFINER + the membership join keep it scoped to the caller's own spaces.
create or replace function public.unread_summary()
returns table (space_id uuid, unread bigint, last_message_at timestamptz)
language sql security definer set search_path = public stable as $$
  select c.space_id,
         count(m.id) filter (
           where m.author_id <> auth.uid()
             and m.created_at > coalesce(rs.last_read_at, 'epoch'::timestamptz)
         ) as unread,
         max(m.created_at) as last_message_at
  from public.channels c
  join public.space_members sm
    on sm.space_id = c.space_id and sm.user_id = auth.uid()
  left join public.messages m
    on m.channel_id = c.id
  left join public.read_state rs
    on rs.channel_id = c.id and rs.user_id = auth.uid()
  group by c.space_id;
$$;

grant select, insert, update, delete on public.read_state to authenticated;
grant execute on function public.mark_channel_read(uuid) to authenticated;
grant execute on function public.unread_summary() to authenticated;

-- ===== 20260704180000_notes_reminders.sql =====

-- =============================================================================
-- Notes + Reminders channel backing tables.
-- Both are gated through the parent channel's view/edit permission, reusing the
-- can_view_channel / can_edit_channel helpers so they inherit the same access
-- model as messages and tasks.
-- =============================================================================

-- ---------- NOTES ----------
-- One shared, continuously-saved document per `notes` channel.
create table public.channel_notes (
  channel_id uuid primary key references public.channels(id) on delete cascade,
  content    text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.channel_notes enable row level security;

create policy notes_select on public.channel_notes for select to authenticated
  using (public.can_view_channel(channel_id, auth.uid()));
create policy notes_insert on public.channel_notes for insert to authenticated
  with check (public.can_edit_channel(channel_id, auth.uid()));
create policy notes_update on public.channel_notes for update to authenticated
  using (public.can_edit_channel(channel_id, auth.uid()))
  with check (public.can_edit_channel(channel_id, auth.uid()));

-- ---------- REMINDERS ----------
create table public.reminders (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  title      text not null,
  remind_at  timestamptz,
  done       boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index idx_reminders_channel on public.reminders(channel_id, remind_at);

alter table public.reminders enable row level security;

create policy reminders_select on public.reminders for select to authenticated
  using (public.can_view_channel(channel_id, auth.uid()));
create policy reminders_insert on public.reminders for insert to authenticated
  with check (created_by = auth.uid() and public.can_edit_channel(channel_id, auth.uid()));
create policy reminders_update on public.reminders for update to authenticated
  using (public.can_edit_channel(channel_id, auth.uid()))
  with check (public.can_edit_channel(channel_id, auth.uid()));
create policy reminders_delete on public.reminders for delete to authenticated
  using (created_by = auth.uid()
         or public.has_space_role(public.channel_space_id(channel_id), auth.uid(), array['owner','admin','moderator']::public.member_role[]));

grant select, insert, update, delete on public.channel_notes to authenticated;
grant select, insert, update, delete on public.reminders to authenticated;

-- Live sync for both.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_notes') then
    alter publication supabase_realtime add table public.channel_notes;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reminders') then
    alter publication supabase_realtime add table public.reminders;
  end if;
end $$;

-- ===== 20260704190000_direct_messages.sql =====

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

-- ===== 20260704200000_private_cubicles.sql =====

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

-- ===== 20260704210000_unread_visibility_and_tasks_realtime.sql =====

-- =============================================================================
-- Two fixes surfaced during review:
--
-- 1) unread_summary counted messages in EVERY channel of a space you belong to,
--    ignoring channel visibility. Once cubicles became restricted, other members'
--    cubicle messages (which you can never open, so never mark read) counted
--    toward your unread forever — a permanent, unclearable dot. Restrict the
--    count to channels you can actually view.
--
-- 2) The Tasks board subscribes to realtime on the tasks table, but tasks was
--    never added to the realtime publication, so cross-member task updates never
--    streamed. Publish it.
-- =============================================================================

create or replace function public.unread_summary()
returns table (space_id uuid, unread bigint, last_message_at timestamptz)
language sql security definer set search_path = public stable as $$
  with visible as (
    select c.id, c.space_id
    from public.channels c
    join public.space_members sm on sm.space_id = c.space_id and sm.user_id = auth.uid()
    where public.can_view_channel(c.id, auth.uid())
  )
  select v.space_id,
         count(m.id) filter (
           where m.author_id <> auth.uid()
             and m.created_at > coalesce(rs.last_read_at, 'epoch'::timestamptz)
         ) as unread,
         max(m.created_at) as last_message_at
  from visible v
  left join public.messages m on m.channel_id = v.id
  left join public.read_state rs on rs.channel_id = v.id and rs.user_id = auth.uid()
  group by v.space_id;
$$;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

-- ===== 20260704220000_usernames.sql =====

-- =============================================================================
-- Usernames — a unique, lowercase handle so people can be found and DM'd without
-- already sharing a space. display_name stays the free-form label; username is
-- the stable identifier.
-- =============================================================================

alter table public.profiles add column if not exists username text;

-- Case-insensitive uniqueness. Usernames are stored lowercase, but index on
-- lower() so it holds regardless.
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

-- 3–20 chars, lowercase letters / digits / underscore. NULL allowed (checks pass
-- on NULL) so the column can exist before everyone has one.
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

-- Backfill existing users with a stable default handle (unique via the id).
update public.profiles
  set username = 'u' || substr(replace(id::text, '-', ''), 1, 10)
  where username is null;

-- New users get a default handle at signup (they can change it in settings).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_space_id uuid;
begin
  insert into public.profiles (id, username)
    values (new.id, 'u' || substr(replace(new.id::text, '-', ''), 1, 10));
  insert into public.spaces (type, name, created_by)
    values ('private', 'Private', new.id) returning id into v_space_id;
  insert into public.space_members (space_id, user_id, role)
    values (v_space_id, new.id, 'owner');
  return new;
end;
$$;

-- ===== updates (idempotent) =====

-- =============================================================================
-- Collab platform — all DB changes in one idempotent file. Safe to run once,
-- safe to re-run. Paste into the Supabase SQL editor. This is the single source
-- for schema changes; new commands get appended here (not committed to the repo).
-- Covers: cubicle wall, DM read-state, admin promotion, invite preview, default
-- feature channels, private-space channels, the custom Board channel, and
-- leave_space.
-- =============================================================================

-- ####################################################################

-- =============================================================================
-- Collab platform — all schema updates in one file. Idempotent: safe to run
-- once on any database, and safe to re-run. Paste into the Supabase SQL editor
-- (or `supabase db push`). Covers: cubicle wall + DM read-state + admin
-- promotion RPCs, invite preview, default feature channels, and the personal
-- Private-space channels.
-- =============================================================================


-- ####################################################################
-- from 20260707200000_cubicle_wall_and_read_sync.sql
-- ####################################################################

-- =============================================================================
-- Cubicle wall + read-state / membership RPC re-sync (one migration).
--
-- Three things in one file so a behind live DB catches up in a single run:
--
--  1. Cubicle model change. A cubicle is no longer a locked personal space.
--     It's a member-visible personal wall: everyone in the server can VIEW it,
--     only the owner can EDIT its notes, and anyone can POST to a small message
--     window on it. So: un-restrict cubicles (everyone can view + post messages),
--     but gate the cubicle's note document to the owner alone.
--
--  2. Re-assert the read-state RPCs (mark_channel_read / unread_summary) so DM
--     and channel unread actually clears on read even if the original migration
--     never reached this database.
--
--  3. Re-assert the membership RPCs (set_member_role / remove_member) so an owner
--     can promote a teammate to admin (who can then manage channels).
--
-- Everything here is idempotent — safe to run on a fresh or partial database.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CUBICLE = MEMBER-VISIBLE WALL
-- ---------------------------------------------------------------------------

-- New server member -> cubicle that everyone can see (is_restricted = false).
create or replace function public.handle_new_server_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type public.space_type; v_name text;
begin
  select type into v_type from public.spaces where id = new.space_id;
  if v_type = 'server' then
    select coalesce(display_name, 'Member') into v_name from public.profiles where id = new.user_id;
    insert into public.channels (space_id, type, name, position, owner_id, is_restricted)
      values (new.space_id, 'cubicle', v_name || '''s cubicle', 1000, new.user_id, false);
  end if;
  return new;
end;
$$;

-- Backfill: open every existing cubicle back up to the whole server.
update public.channels set is_restricted = false where type = 'cubicle' and is_restricted = true;

-- The cubicle's note document is owner-editable only; every other channel type
-- keeps the shared can_edit_channel rule. Notes stay viewable by anyone who can
-- view the channel (unchanged), so members can read a cubicle's notes.
drop policy if exists notes_insert on public.channel_notes;
drop policy if exists notes_update on public.channel_notes;

create policy notes_insert on public.channel_notes for insert to authenticated
  with check (
    case
      when (select c.type from public.channels c where c.id = channel_id) = 'cubicle'
        then (select c.owner_id from public.channels c where c.id = channel_id) = auth.uid()
      else public.can_edit_channel(channel_id, auth.uid())
    end
  );

create policy notes_update on public.channel_notes for update to authenticated
  using (
    case
      when (select c.type from public.channels c where c.id = channel_id) = 'cubicle'
        then (select c.owner_id from public.channels c where c.id = channel_id) = auth.uid()
      else public.can_edit_channel(channel_id, auth.uid())
    end
  )
  with check (
    case
      when (select c.type from public.channels c where c.id = channel_id) = 'cubicle'
        then (select c.owner_id from public.channels c where c.id = channel_id) = auth.uid()
      else public.can_edit_channel(channel_id, auth.uid())
    end
  );

-- ---------------------------------------------------------------------------
-- 2. READ STATE (re-assert)
-- ---------------------------------------------------------------------------

create table if not exists public.read_state (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  channel_id   uuid not null references public.channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
create index if not exists idx_read_state_user on public.read_state(user_id);
alter table public.read_state enable row level security;

drop policy if exists read_state_select on public.read_state;
drop policy if exists read_state_insert on public.read_state;
drop policy if exists read_state_update on public.read_state;
drop policy if exists read_state_delete on public.read_state;
create policy read_state_select on public.read_state for select to authenticated using (user_id = auth.uid());
create policy read_state_insert on public.read_state for insert to authenticated with check (user_id = auth.uid());
create policy read_state_update on public.read_state for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy read_state_delete on public.read_state for delete to authenticated using (user_id = auth.uid());

create or replace function public.mark_channel_read(p_channel_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.read_state (user_id, channel_id, last_read_at)
    values (auth.uid(), p_channel_id, now())
    on conflict (user_id, channel_id) do update set last_read_at = now();
end;
$$;

create or replace function public.unread_summary()
returns table (space_id uuid, unread bigint, last_message_at timestamptz)
language sql security definer set search_path = public stable as $$
  select c.space_id,
         count(m.id) filter (
           where m.author_id <> auth.uid()
             and m.created_at > coalesce(rs.last_read_at, 'epoch'::timestamptz)
         ) as unread,
         max(m.created_at) as last_message_at
  from public.channels c
  join public.space_members sm
    on sm.space_id = c.space_id and sm.user_id = auth.uid()
  left join public.messages m
    on m.channel_id = c.id
  left join public.read_state rs
    on rs.channel_id = c.id and rs.user_id = auth.uid()
  group by c.space_id;
$$;

grant select, insert, update, delete on public.read_state to authenticated;
grant execute on function public.mark_channel_read(uuid) to authenticated;
grant execute on function public.unread_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. MEMBERSHIP RPCs (re-assert, so promotion to admin works)
-- ---------------------------------------------------------------------------

create or replace function public.set_member_role(p_space_id uuid, p_user_id uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_target public.member_role;
begin
  if not public.has_space_role(p_space_id, v_uid, array['owner','admin']::public.member_role[]) then
    raise exception 'not allowed';
  end if;
  if p_user_id = v_uid then raise exception 'cannot change your own role'; end if;
  if p_role = 'owner' then raise exception 'cannot assign owner'; end if;
  select role into v_target from public.space_members where space_id = p_space_id and user_id = p_user_id;
  if v_target is null then raise exception 'not a member'; end if;
  if v_target = 'owner' then raise exception 'cannot change the owner'; end if;
  update public.space_members set role = p_role where space_id = p_space_id and user_id = p_user_id;
end;
$$;

create or replace function public.remove_member(p_space_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_target public.member_role;
begin
  if not public.has_space_role(p_space_id, v_uid, array['owner','admin']::public.member_role[]) then
    raise exception 'not allowed';
  end if;
  if p_user_id = v_uid then raise exception 'use leave, not remove, on yourself'; end if;
  select role into v_target from public.space_members where space_id = p_space_id and user_id = p_user_id;
  if v_target = 'owner' then raise exception 'cannot remove the owner'; end if;
  delete from public.space_members where space_id = p_space_id and user_id = p_user_id;
end;
$$;

grant execute on function public.set_member_role(uuid, uuid, public.member_role) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- ####################################################################
-- from 20260707220000_invite_preview.sql
-- ####################################################################

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

-- ####################################################################
-- from 20260707230000_default_feature_channels.sql
-- ####################################################################

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
select s.id, v.type::public.channel_type, v.name, v.position
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
    select 1 from public.channels c where c.space_id = s.id and c.type = v.type::public.channel_type
  );

-- ####################################################################
-- from 20260707240000_private_space_channels.sql
-- ####################################################################

-- =============================================================================
-- Make the Private space actually useful. It shipped empty with only an
-- "add channel" prompt, so it read as broken. Now it's a real personal
-- workspace: every account's Private space comes with Notes, Tasks, and
-- Reminders, visible only to that person.
--
-- 1. New signups get the default private channels.
-- 2. Backfill existing Private spaces with any of these they're missing.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_space_id uuid;
begin
  insert into public.profiles (id) values (new.id);
  insert into public.spaces (type, name, created_by)
    values ('private', 'Private', new.id) returning id into v_space_id;
  insert into public.space_members (space_id, user_id, role)
    values (v_space_id, new.id, 'owner');
  insert into public.channels (space_id, type, name, position) values
    (v_space_id, 'notes',     'Notes',     0),
    (v_space_id, 'todo',      'Tasks',     1),
    (v_space_id, 'reminders', 'Reminders', 2);
  return new;
end;
$$;

-- Backfill: give every existing Private space the personal channels it lacks.
insert into public.channels (space_id, type, name, position)
select s.id, v.type::public.channel_type, v.name, v.position
from public.spaces s
cross join (values
  ('notes',     'Notes',     0),
  ('todo',      'Tasks',     1),
  ('reminders', 'Reminders', 2)
) as v(type, name, position)
where s.type = 'private'
  and not exists (
    select 1 from public.channels c where c.space_id = s.id and c.type = v.type::public.channel_type
  );

-- ####################################################################

-- =============================================================================
-- Custom "Board" channel — a brand-native card canvas (sticky notes + live
-- cursors), separate from the Excalidraw whiteboard. Items live in one jsonb
-- row per board channel; live editing syncs over Realtime broadcast, this table
-- is the durable copy so the board survives reloads and late joiners.
-- =============================================================================


create table if not exists public.boards (
  channel_id uuid primary key references public.channels(id) on delete cascade,
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.boards enable row level security;

drop policy if exists boards_select on public.boards;
drop policy if exists boards_insert on public.boards;
drop policy if exists boards_update on public.boards;
create policy boards_select on public.boards for select to authenticated
  using (public.can_view_channel(channel_id, auth.uid()));
create policy boards_insert on public.boards for insert to authenticated
  with check (public.can_edit_channel(channel_id, auth.uid()));
create policy boards_update on public.boards for update to authenticated
  using (public.can_edit_channel(channel_id, auth.uid()))
  with check (public.can_edit_channel(channel_id, auth.uid()));

grant select, insert, update, delete on public.boards to authenticated;

-- ####################################################################

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
