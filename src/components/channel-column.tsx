'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUI } from '@/components/ui-provider'

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

// Channel types a user can add to a server (cubicle is auto-managed; private/dm aren't servers).
const CREATABLE: { type: string; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'voice_video', label: 'Voice / Video' },
  { type: 'whiteboard', label: 'Whiteboard' },
  { type: 'todo', label: 'Tasks' },
  { type: 'notes', label: 'Notes' },
  { type: 'reminders', label: 'Reminders' },
  { type: 'docs_sheet', label: 'Shared Docs' },
]

export function ChannelColumn({
  spaceName,
  spaceId,
  channels,
  canInvite,
  canManage,
  isServer,
}: {
  spaceName: string
  spaceId: string
  channels: Channel[]
  canInvite: boolean
  canManage: boolean
  isServer: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const ui = useUI()
  const activeChannelId = pathname.split('/')[2]
  const supabase = useMemo(() => createClient(), [])

  const [open, setOpen] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('text')
  const [creating, setCreating] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  async function deleteChannel(id: string, name: string) {
    const ok = await ui.confirm(
      `Delete #${name}? This removes all its messages and content. This cannot be undone.`,
      'Delete Channel'
    )
    if (!ok) return
    const { error } = await supabase.from('channels').delete().eq('id', id)
    if (error) {
      ui.alert(error.message, 'Error')
      return
    }
    ui.toast(`#${name} deleted.`, 'success')
    if (id === activeChannelId) router.push(`/${spaceId}`)
    router.refresh()
  }

  async function createChannel() {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    const { data, error } = await supabase
      .from('channels')
      .insert({ space_id: spaceId, type: newType, name, position: channels.length })
      .select('id')
      .single()
    setCreating(false)
    if (error) {
      ui.alert(error.message, 'Error')
      return
    }
    ui.toast(`#${name} channel created!`, 'success')
    setNewName('')
    setAdding(false)
    router.push(`/${spaceId}/${data.id}`)
    router.refresh() // pull the new channel into the server-rendered list
  }

  async function toggleInvite() {
    const next = !open
    setOpen(next)
    if (!next || link || busy) return
    setBusy(true)
    const { data, error } = await supabase.rpc('generate_invite', { p_space_id: spaceId })
    setBusy(false)
    if (error) {
      ui.alert(error.message, 'Error')
      setOpen(false)
      return
    }
    setLink(`${window.location.origin}/join/${data}`)
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <aside className="app-channels" style={{ width: 220, background: 'var(--sidebar)', borderRight: '1px solid var(--border)', color: 'var(--muted)', height: '100%', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{spaceName}</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          {canInvite && (
            <button
              onClick={toggleInvite}
              title="Invite people"
              style={{ background: open ? 'var(--accent-hover)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.15s ease' }}
            >
              invite
            </button>
          )}
          {isServer && (
            <Link href={`/${spaceId}/members`} title="Members" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 12, transition: 'color 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted)'}>
              members
            </Link>
          )}
        </div>
      </div>

      {open && canInvite && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
          <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 6 }}>Anyone with this link can join this server.</div>
          {busy && !link ? (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>generating…</div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                style={{ flex: 1, minWidth: 0, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', color: 'var(--foreground)', fontSize: 12, outline: 'none' }}
              />
              <button onClick={copy} style={{ background: 'var(--border-soft)', color: copied ? 'var(--success)' : 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, flexShrink: 0, transition: 'all 0.15s ease' }}>
                {copied ? '✓' : 'copy'}
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {channels.length === 0 && <div style={{ color: 'var(--faint)', fontSize: 13, padding: 8 }}>No channels yet</div>}
        {channels.map((c) => {
          const active = c.id === activeChannelId
          const canDelete = canManage && c.type !== 'cubicle'
          return (
            <div
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: 6,
                background: active ? 'var(--accent-soft)' : 'transparent',
                marginBottom: 2,
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => {
                setHovered(c.id)
                if (!active) e.currentTarget.style.background = 'var(--border-soft)'
              }}
              onMouseLeave={(e) => {
                setHovered((h) => (h === c.id ? null : h))
                if (!active) e.currentTarget.style.background = 'transparent'
              }}
            >
              <Link
                href={`/${spaceId}/${c.id}`}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flex: 1,
                  minWidth: 0,
                  padding: '6px 10px',
                  textDecoration: 'none',
                  color: active ? 'var(--accent)' : 'var(--muted)',
                  fontWeight: active ? 600 : 400,
                  fontSize: 14,
                  transition: 'color 0.15s ease'
                }}
              >
                <span style={{ opacity: 0.7, width: 16, textAlign: 'center' }}>{typeIcon[c.type] ?? '#'}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </Link>
              {canDelete && hovered === c.id && (
                <button
                  onClick={() => deleteChannel(c.id, c.name)}
                  title={`Delete #${c.name}`}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: '0 8px', flexShrink: 0 }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted)'}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}

        {canManage && (
          <div style={{ marginTop: 6 }}>
            {adding ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 6px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createChannel()}
                  placeholder="channel name"
                  style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--foreground)', fontSize: 13, outline: 'none' }}
                />
                <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--foreground)', fontSize: 13, outline: 'none' }}>
                  {CREATABLE.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={createChannel} disabled={creating || !newName.trim()} style={{ flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 13, opacity: creating || !newName.trim() ? 0.6 : 1, transition: 'opacity 0.15s ease' }}>
                    {creating ? '…' : 'Create'}
                  </button>
                  <button onClick={() => { setAdding(false); setNewName('') }} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}>
                    ×
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '6px 10px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 14, cursor: 'pointer', transition: 'color 0.15s ease' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-hover)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--accent)'}>
                <span style={{ width: 16, textAlign: 'center' }}>+</span>
                <span>Add channel</span>
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
