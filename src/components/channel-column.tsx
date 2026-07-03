'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Channel = { id: string; type: string; name: string }

const typeIcon: Record<string, string> = {
  text: '#',
  voice_video: '🔊',
  whiteboard: '▧',
  todo: '☑',
  notes: '≡',
  reminders: '⏰',
  docs_sheet: '▤',
  cubicle: '◻',
}

export function ChannelColumn({
  spaceName,
  spaceId,
  channels,
}: {
  spaceName: string
  spaceId: string
  channels: Channel[]
}) {
  const pathname = usePathname()
  const activeChannelId = pathname.split('/')[2]

  return (
    <aside style={{ width: 220, background: '#191919', color: '#ddd', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #262626', fontWeight: 700, fontSize: 14, color: '#fff' }}>
        {spaceName}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {channels.length === 0 && <div style={{ color: '#666', fontSize: 13, padding: 8 }}>No channels yet</div>}
        {channels.map((c) => {
          const active = c.id === activeChannelId
          return (
            <Link
              key={c.id}
              href={`/${spaceId}/${c.id}`}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                padding: '6px 10px',
                borderRadius: 6,
                textDecoration: 'none',
                color: active ? '#fff' : '#a3a3a3',
                background: active ? '#2f2f3a' : 'transparent',
                fontSize: 14,
                marginBottom: 2,
              }}
            >
              <span style={{ opacity: 0.7, width: 16, textAlign: 'center' }}>{typeIcon[c.type] ?? '#'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            </Link>
          )
        })}
      </div>
    </aside>
  )
}
