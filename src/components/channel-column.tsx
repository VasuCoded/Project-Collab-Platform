'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUI } from '@/components/ui-provider'
import { ContextMenu, type MenuItem } from '@/components/context-menu'

type Channel = { id: string; type: string; name: string }

function renderIcon(type: string) {
  switch (type) {
    case 'text':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="10" y1="3" x2="8" y2="21" />
          <line x1="16" y1="3" x2="14" y2="21" />
        </svg>
      )
    case 'voice_video':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      )
    case 'whiteboard':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      )
    case 'board':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      )
    case 'todo':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )
    case 'notes':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      )
    case 'reminders':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
    case 'docs_sheet':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
          <path d="M6 6h10" />
          <path d="M6 10h10" />
        </svg>
      )
    case 'cubicle':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      )
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
        </svg>
      )
  }
}

// Channel types a user can add to a server (cubicle is auto-managed; private/dm aren't servers).
const CREATABLE: { type: string; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'voice_video', label: 'Voice / Video' },
  { type: 'whiteboard', label: 'Whiteboard' },
  { type: 'board', label: 'Board' },
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
  const [menu, setMenu] = useState<{ x: number; y: number; channel: Channel } | null>(null)

  function copyChannelLink(id: string) {
    navigator.clipboard?.writeText(`${window.location.origin}/${spaceId}/${id}`)
    ui.toast('Link copied.', 'success')
  }

  function channelMenuItems(c: Channel): MenuItem[] {
    const items: MenuItem[] = [
      { label: 'Open', onClick: () => router.push(`/${spaceId}/${c.id}`) },
      { label: 'Copy link', onClick: () => copyChannelLink(c.id) },
    ]
    if (canManage && c.type !== 'cubicle') {
      items.push('divider', { label: 'Delete channel', onClick: () => deleteChannel(c.id, c.name), danger: true })
    }
    return items
  }

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
    <aside className="app-channels" style={{
      width: 230,
      background: 'var(--sidebar)',
      borderRight: '1px solid var(--border)',
      color: 'var(--muted)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0
    }}>
      {/* Sidebar Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10
        }}>
          <span style={{
            fontFamily: 'var(--display-font)',
            fontWeight: 800,
            fontSize: 16,
            color: 'var(--foreground)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {spaceName}
          </span>
        </div>

        {/* Action pills bar */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canInvite && (
            <button
              onClick={toggleInvite}
              title="Invite people"
              style={{
                flex: 1,
                background: open ? 'var(--accent-hover)' : 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
                textAlign: 'center'
              }}
            >
              invite
            </button>
          )}
          {isServer && (
            <Link
              href={`/${spaceId}/members`}
              title="Members"
              style={{
                flex: 1,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--foreground)',
                textAlign: 'center',
                textDecoration: 'none',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border-soft)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--card)'}
            >
              members
            </Link>
          )}
        </div>
      </div>

      {open && canInvite && (
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--background)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          <div style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
            [ Server Invite Link ]
          </div>
          {busy && !link ? (
            <div style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>generating...</div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '5px 8px',
                  color: 'var(--foreground)',
                  fontSize: 11.5,
                  fontFamily: 'var(--font-mono)',
                  outline: 'none'
                }}
              />
              <button
                onClick={copy}
                style={{
                  background: 'var(--accent-soft)',
                  color: copied ? 'var(--success)' : 'var(--accent)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '5px 10px',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                  transition: 'all 0.15s ease'
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Channels List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        {channels.length === 0 && (
          <div style={{ color: 'var(--faint)', fontSize: 12, padding: '12px 8px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
            [ No channels yet ]
          </div>
        )}
        {channels.map((c) => {
          const active = c.id === activeChannelId
          const canDelete = canManage && c.type !== 'cubicle'
          return (
            <div
              key={c.id}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, channel: c }) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: 8,
                background: active ? 'var(--accent-soft)' : 'transparent',
                marginBottom: 4,
                position: 'relative',
                transition: 'background 0.12s ease'
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
              {/* Active left indicator bar */}
              {active && (
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: '20%',
                  height: '60%',
                  width: 3,
                  background: 'var(--accent)',
                  borderRadius: '0 4px 4px 0'
                }} />
              )}

              <Link
                href={`/${spaceId}/${c.id}`}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flex: 1,
                  minWidth: 0,
                  padding: '8px 12px 8px 14px',
                  textDecoration: 'none',
                  color: active ? 'var(--accent)' : 'var(--foreground)',
                  fontWeight: active ? 700 : 500,
                  fontSize: 13.5,
                  transition: 'color 0.12s ease'
                }}
              >
                <span style={{
                  opacity: active ? 1 : 0.5,
                  width: 18,
                  height: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: active ? 'var(--accent)' : 'var(--muted)',
                  flexShrink: 0
                }}>
                  {renderIcon(c.type)}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
              </Link>
              {canDelete && hovered === c.id && (
                <button
                  onClick={() => deleteChannel(c.id, c.name)}
                  title={`Delete #${c.name}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: '0 10px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%'
                  }}
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
          <div style={{ marginTop: 8, padding: '0 4px' }}>
            {adding ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '12px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                boxShadow: '0 2px 8px var(--shadow)'
              }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>
                  New Channel
                </div>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createChannel()}
                  placeholder="channel-name"
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: 'var(--foreground)',
                    fontSize: 12.5,
                    outline: 'none',
                    transition: 'border-color 0.15s ease'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                />
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 8px',
                    color: 'var(--foreground)',
                    fontSize: 12.5,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {CREATABLE.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    onClick={createChannel}
                    disabled={creating || !newName.trim()}
                    style={{
                      flex: 1,
                      background: 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 10px',
                      cursor: (creating || !newName.trim()) ? 'default' : 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                      opacity: creating || !newName.trim() ? 0.6 : 1,
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    {creating ? '...' : 'Create'}
                  </button>
                  <button
                    onClick={() => { setAdding(false); setNewName('') }}
                    style={{
                      background: 'var(--border-soft)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px dashed var(--border)',
                  background: 'transparent',
                  color: 'var(--accent)',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-hover)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <span>+</span>
                <span>Add Channel</span>
              </button>
            )}
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={channelMenuItems(menu.channel)} onClose={() => setMenu(null)} />
      )}
    </aside>
  )
}
