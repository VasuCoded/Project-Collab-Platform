-- =============================================================================
-- unread_summary: fix a regression + stop reading the whole message history.
--
-- 1) VISIBILITY REGRESSION. 20260704210000 restricted the unread count to
--    channels you can actually view, because other members' cubicles are
--    restricted — you can never open them, so you can never mark them read, so
--    they counted toward your unread forever as an unclearable dot. The later
--    "re-assert the read-state RPCs" migration recreated this function from the
--    pre-fix body and silently dropped that filter, bringing the bug back. The
--    filter is restored here, inlined: the space_members join already proves
--    membership, so calling can_view_channel() per channel would just re-check it.
--
-- 2) PERFORMANCE. The body did `left join public.messages` across every channel
--    of every space you belong to and then aggregated, so it read every message
--    you have ever been able to see. This function runs in the root layout, i.e.
--    on every navigation, so the whole app got linearly slower as people chatted.
--
--    Both aggregates are now lateral subqueries that ride idx_messages_channel
--    (channel_id, created_at):
--      - unread counts a range scan from last_read_at forward, so it touches
--        only genuinely unread rows (usually none) instead of the full channel.
--      - last_message_at is a backward index scan with limit 1, so it reads one
--        row per channel instead of scanning to compute max().
--
-- Results are unchanged: same unread definition (other people's messages newer
-- than your last read), same last_message_at (newest message, any author), and
-- empty channels still report 0 / null via the left joins.
-- =============================================================================

create or replace function public.unread_summary()
returns table (space_id uuid, unread bigint, last_message_at timestamptz)
language sql security definer set search_path = public stable as $$
  with visible as (
    select c.id, c.space_id
    from public.channels c
    join public.space_members sm
      on sm.space_id = c.space_id and sm.user_id = auth.uid()
    where not c.is_restricted
       or exists (
            select 1 from public.channel_access_overrides o
            where o.channel_id = c.id and o.user_id = auth.uid() and o.can_view
          )
  )
  select v.space_id,
         coalesce(sum(u.n), 0)::bigint as unread,
         max(l.created_at) as last_message_at
  from visible v
  left join public.read_state rs
    on rs.channel_id = v.id and rs.user_id = auth.uid()
  left join lateral (
    select count(*) as n
    from public.messages m
    where m.channel_id = v.id
      and m.created_at > coalesce(rs.last_read_at, 'epoch'::timestamptz)
      and m.author_id <> auth.uid()
  ) u on true
  left join lateral (
    select m.created_at
    from public.messages m
    where m.channel_id = v.id
    order by m.created_at desc
    limit 1
  ) l on true
  group by v.space_id;
$$;

grant execute on function public.unread_summary() to authenticated;
