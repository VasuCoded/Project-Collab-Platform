-- =============================================================================
-- Custom "Board" channel — a brand-native card canvas (sticky notes + live
-- cursors), separate from the Excalidraw whiteboard. Items live in one jsonb
-- row per board channel; live editing syncs over Realtime broadcast, this table
-- is the durable copy so the board survives reloads and late joiners.
-- =============================================================================

alter type public.channel_type add value if not exists 'board';

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
