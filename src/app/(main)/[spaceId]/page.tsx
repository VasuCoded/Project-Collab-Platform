import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function SpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params
  const supabase = await createClient()

  const { data: channels } = await supabase
    .from('channels')
    .select('id')
    .eq('space_id', spaceId)
    .order('position')
    .limit(1)

  if (channels && channels.length > 0) {
    redirect(`/${spaceId}/${channels[0].id}`)
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#888',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      No channels here yet.
    </div>
  )
}
