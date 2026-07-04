import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getProfile, getUnreadBySpace, getDmPeers } from '@/lib/supabase/queries'
import { Rail } from '@/components/rail'

export default async function MainLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [profile, { data: spaces }, unread] = await Promise.all([
    getProfile(user.id),
    supabase.from('spaces').select('id, type, name').order('created_at'),
    getUnreadBySpace(),
  ])

  if (!profile?.display_name) redirect('/onboarding')

  const all = spaces ?? []
  const servers = all.filter((s) => s.type === 'server')
  const dmSpaces = all.filter((s) => s.type === 'dm')
  const privateSpace = all.find((s) => s.type === 'private') ?? null

  // Resolve the person behind each DM + fold in unread counts, then show the most
  // recently active conversations first.
  const peers = await getDmPeers(dmSpaces.map((d) => d.id), user.id)
  const dms = dmSpaces
    .map((d) => ({
      id: d.id,
      type: d.type,
      name: peers.get(d.id)?.name ?? d.name,
      avatar: peers.get(d.id)?.avatar ?? null,
      unread: unread.get(d.id)?.unread ?? 0,
      lastAt: unread.get(d.id)?.last ?? null,
    }))
    .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <Rail servers={servers} dms={dms} privateSpace={privateSpace} profile={profile} me={user.id} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>{children}</div>
    </div>
  )
}
