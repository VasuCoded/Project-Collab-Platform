import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getCurrentUser, getMyRole, getSpace, getSpaceChannels, getDmList, getSpaceMembers } from '@/lib/supabase/queries'
import { ChannelColumn } from '@/components/channel-column'
import { DmColumn } from '@/components/dm-column'
import { MembersSidebar } from '@/components/members-sidebar'

export default async function SpaceLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params
  const user = await getCurrentUser() // cache hit: resolved in the main layout

  const [space, channels, role] = await Promise.all([
    getSpace(spaceId),
    getSpaceChannels(spaceId),
    user ? getMyRole(spaceId, user.id) : Promise.resolve(null),
  ])
  if (!space) notFound()

  // A DM shows the whole conversation list as its column, not a "# direct" channel.
  if (space.type === 'dm' && user) {
    const dms = await getDmList(user.id)
    return (
      <div style={{ display: 'flex', flex: 1, minWidth: 0, height: '100%' }}>
        <DmColumn dms={dms} me={user.id} activeId={spaceId} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>{children}</div>
      </div>
    )
  }

  const spaceName = space.type === 'private' ? 'Your space' : (space.name ?? 'Server')
  // invite + member management only make sense in a server.
  const canInvite = space.type === 'server' && (role === 'owner' || role === 'admin')
  // channel add/delete: server admins, or you in your own private space.
  const canManage =
    (space.type === 'server' && (role === 'owner' || role === 'admin')) || (space.type === 'private' && role === 'owner')

  const members = space.type === 'server' && user ? await getSpaceMembers(spaceId) : []

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0, height: '100%' }}>
      <ChannelColumn spaceName={spaceName} spaceId={spaceId} channels={channels} canInvite={canInvite} canManage={canManage} isServer={space.type === 'server'} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>{children}</div>
      {space.type === 'server' && user && <MembersSidebar members={members} me={user.id} />}
    </div>
  )
}
