import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChannelColumn } from '@/components/channel-column'

export default async function SpaceLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params
  const supabase = await createClient()

  const { data: space } = await supabase.from('spaces').select('id, name, type').eq('id', spaceId).single()
  if (!space) notFound()

  const { data: channels } = await supabase
    .from('channels')
    .select('id, type, name, position')
    .eq('space_id', spaceId)
    .order('position')

  const spaceName =
    space.name ?? (space.type === 'private' ? 'Private' : space.type === 'dm' ? 'Direct message' : 'Server')

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0, height: '100%' }}>
      <ChannelColumn spaceName={spaceName} spaceId={spaceId} channels={channels ?? []} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>{children}</div>
    </div>
  )
}
