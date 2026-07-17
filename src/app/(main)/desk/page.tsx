import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getProfile, getUnreadBySpace, getDmPeers } from '@/lib/supabase/queries'
import { Desk, type Team, type WaitingTask, type DeskDm } from '@/components/desk'

type Space = { id: string; type: string; name: string | null }
type Task = { id: string; space_id: string; title: string; status: string; owner_id: string | null; due_at: string | null }

export default async function DeskPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [profile, { data: spaces }, { data: members }, { data: tasks }, unread] = await Promise.all([
    getProfile(user.id),
    supabase.from('spaces').select('id, type, name').order('created_at'),
    supabase.from('space_members').select('space_id, user_id'),
    supabase.from('tasks').select('id, space_id, title, status, owner_id, due_at'),
    getUnreadBySpace(),
  ])

  const all = (spaces ?? []) as Space[]
  const servers = all.filter((s) => s.type === 'server')
  const dmSpaces = all.filter((s) => s.type === 'dm')
  const nameBySpace = new Map(all.map((s) => [s.id, s.name ?? 'Space']))

  // member counts per space
  const memberCount = new Map<string, number>()
  for (const m of (members ?? []) as { space_id: string; user_id: string }[]) {
    memberCount.set(m.space_id, (memberCount.get(m.space_id) ?? 0) + 1)
  }

  // open-task counts per space + the tasks that are on me. We also tally every
  // task assigned to me (done or not) so the desk can show a real completion rate
  // — the "waiting" list only holds open tasks, so it can't be counted for that.
  const openTaskCount = new Map<string, number>()
  const waiting: WaitingTask[] = []
  let myDone = 0
  let myTotal = 0
  for (const t of (tasks ?? []) as Task[]) {
    if (t.owner_id === user.id) {
      myTotal++
      if (t.status === 'done') myDone++
    }
    if (t.status !== 'done') {
      openTaskCount.set(t.space_id, (openTaskCount.get(t.space_id) ?? 0) + 1)
      if (t.owner_id === user.id) {
        waiting.push({ id: t.id, title: t.title, spaceId: t.space_id, spaceName: nameBySpace.get(t.space_id) ?? 'Space', due: t.due_at, status: t.status })
      }
    }
  }
  // soonest / most-overdue first; undated tasks sink to the bottom
  waiting.sort((a, b) => {
    if (a.due && b.due) return new Date(a.due).getTime() - new Date(b.due).getTime()
    if (a.due) return -1
    if (b.due) return 1
    return 0
  })

  const teams: Team[] = servers.map((s) => ({
    id: s.id,
    name: s.name ?? 'Team',
    members: memberCount.get(s.id) ?? 1,
    openTasks: openTaskCount.get(s.id) ?? 0,
    unread: unread.get(s.id)?.unread ?? 0,
  }))

  const peers = await getDmPeers(dmSpaces.map((d) => d.id), user.id)
  const dms: DeskDm[] = dmSpaces
    .map((d) => {
      const peer = peers.get(d.id)
      return {
        id: d.id,
        name: peer?.name ?? d.name ?? 'Direct message',
        avatar: peer?.avatar ?? null,
        unread: unread.get(d.id)?.unread ?? 0,
        lastAt: unread.get(d.id)?.last ?? null,
      }
    })
    // most recent conversations first
    .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
    .map((d) => ({ id: d.id, name: d.name, avatar: d.avatar, unread: d.unread }))

  return <Desk displayName={profile?.display_name ?? 'there'} teams={teams} waiting={waiting} dms={dms} completed={myDone} assigned={myTotal} />
}
