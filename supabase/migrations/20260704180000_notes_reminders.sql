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
