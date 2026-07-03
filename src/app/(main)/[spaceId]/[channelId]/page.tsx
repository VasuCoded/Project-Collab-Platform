import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const placeholder: Record<string, { label: string; note: string }> = {
  text: { label: 'Text channel', note: 'Chat is coming soon.' },
  voice_video: { label: 'Voice / Video', note: 'Calls are coming later.' },
  whiteboard: { label: 'Whiteboard', note: 'Shared canvas is coming later.' },
  todo: { label: 'Tasks', note: 'Task board is coming later.' },
  notes: { label: 'Notes', note: 'Shared notes are coming later.' },
  reminders: { label: 'Reminders', note: 'Reminders are coming later.' },
  docs_sheet: { label: 'Shared Docs', note: 'Embedded docs are coming later.' },
  cubicle: { label: 'Cubicle', note: 'Personal workspace is coming later.' },
}

export default async function ChannelPage({ params }: { params: Promise<{ spaceId: string; channelId: string }> }) {
  const { channelId } = await params
  const supabase = await createClient()

  const { data: channel } = await supabase.from('channels').select('id, name, type').eq('id', channelId).single()
  if (!channel) notFound()

  const p = placeholder[channel.type] ?? { label: channel.name, note: 'Coming later.' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', fontWeight: 700 }}>{channel.name}</div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          color: '#999',
        }}
      >
        <div style={{ fontSize: 18, color: '#555' }}>{p.label}</div>
        <div style={{ fontSize: 14 }}>{p.note}</div>
      </div>
    </div>
  )
}
