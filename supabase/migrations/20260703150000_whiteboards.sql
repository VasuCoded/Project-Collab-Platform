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
