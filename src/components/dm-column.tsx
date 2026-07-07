/* eslint-disable @next/next/no-img-element */
'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { startDm } from '@/app/(main)/actions'
import { useUI } from '@/components/ui-provider'
import { Badge } from '@/components/badge'
import type { DmListItem } from '@/lib/supabase/queries'

function initials(name: string | null) {
  return (name ?? '?').trim().slice(0, 2).toUpperCase() || '?'
}

export function DmColumn({ dms, me, activeId }: { dms: DmListItem[]; me: string; activeId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const ui = useUI()

  const [picking, setPicking] = useState(false)
  const [people, setPeople] = useState<{ id: string; name: string; username: string | null; avatar: string | null }[] | null>(null)
  const [pickQuery, setPickQuery] = useState('')
  const [handleQuery, setHandleQuery] = useState('')
  const [handleErr, setHandleErr] = useState<string | null>(null)
  const [startingDm, setStartingDm] = useState(false)

  const loadPeople = useCallback(async () => {
    const { data: rows } = await supabase.from('space_members').select('user_id').neq('user_id', me)
    const ids = [...new Set((rows ?? []).map((r) => r.user_id as string))]
    if (ids.length === 0) { setPeople([]); return }
    const { data: profs } = await supabase.from('profiles').select('id, display_name, username, avatar_url').in('id', ids)
    setPeople((profs ?? []).map((p) => ({ id: p.id, name: p.display_name ?? 'Member', username: p.username, avatar: p.avatar_url })).sort((a, b) => a.name.localeCompare(b.name)))
  }, [supabase, me])

  function openPicker() {
    setPicking(true)
    setPickQuery('')
    setHandleQuery('')
    setHandleErr(null)
    if (!people) loadPeople()
  }

  async function beginDm(userId: string) {
    if (startingDm) return
    setStartingDm(true)
    try {
      const id = await startDm(userId)
      setPicking(false)
      router.push(`/${id}`)
      router.refresh()
    } catch (e) {
      ui.alert(e instanceof Error ? e.message : 'Could not start DM', 'Error')
    } finally {
      setStartingDm(false)
    }
  }

  async function dmByUsername() {
    const handle = handleQuery.trim().toLowerCase().replace(/^@/, '')
    if (!handle || startingDm) return
    setHandleErr(null)
    const { data, error } = await supabase.from('profiles').select('id').eq('username', handle).maybeSingle()
    if (error) { setHandleErr(error.message); return }
    if (!data) { setHandleErr(`No one with @${handle}`); return }
    if (data.id === me) { setHandleErr("That's you."); return }
    setHandleQuery('')
    beginDm(data.id)
  }

  return (
    <aside className="dm-column" style={{ width: 260, flexShrink: 0, background: 'var(--sidebar)', borderRight: '1px solid var(--border)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>Messages</span>
        {picking && (
          <button
            onClick={() => setPicking(false)}
            title="Back"
            style={{ background: 'var(--border-soft)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 4, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}
          >
            ‹
          </button>
        )}
      </div>

      {picking ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 6, paddingLeft: 8 }}>
                <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>@</span>
                <input
                  autoFocus
                  value={handleQuery}
                  onChange={(e) => { setHandleQuery(e.target.value.replace(/^@/, '')); setHandleErr(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && dmByUsername()}
                  placeholder="username"
                  style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', padding: '6px 4px', color: 'var(--foreground)', fontSize: 12 }}
                />
              </div>
              <button onClick={dmByUsername} disabled={startingDm || !handleQuery.trim()} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '0 10px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                Add
              </button>
            </div>
            {handleErr && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4, fontFamily: 'var(--font-mono)', paddingLeft: 2 }}>{handleErr}</div>}
          </div>

          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 2px' }}>
            Team Members
          </div>
          <input
            value={pickQuery}
            onChange={(e) => setPickQuery(e.target.value)}
            placeholder="Filter by name..."
            style={{ background: 'var(--background)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '6px 8px', color: 'var(--foreground)', fontSize: 12, outline: 'none', marginBottom: 8 }}
          />

          {people === null && <div style={{ color: 'var(--muted)', fontSize: 11, padding: 12, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>LOADING...</div>}
          {people?.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 11, padding: 12, textAlign: 'center' }}>No team members found yet.</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {people
              ?.filter((p) => {
                const q = pickQuery.trim().toLowerCase()
                return !q || p.name.toLowerCase().includes(q) || (p.username ?? '').includes(q)
              })
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => beginDm(p.id)}
                  disabled={startingDm}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border-soft)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {p.avatar ? (
                    <img src={p.avatar} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--border-soft)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials(p.name)}</span>
                  )}
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {p.username && <span style={{ display: 'block', fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>@{p.username}</span>}
                  </span>
                </button>
              ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          <button
            onClick={openPicker}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, borderRadius: 6, border: 'none', background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 8 }}
          >
            <span style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>+</span>
            New Message
          </button>

          {dms.length === 0 && (
            <div style={{ color: 'var(--faint)', fontSize: 11, padding: '20px 12px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
              NO CONVERSATIONS
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {dms.map((d) => {
              const active = d.id === activeId
              const label = d.name ?? 'Direct message'
              return (
                <button
                  key={d.id}
                  onClick={() => { router.push(`/${d.id}`); router.refresh() }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 8, borderRadius: 6, border: 'none', background: active ? 'var(--accent-soft)' : 'transparent', color: 'var(--foreground)', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease' }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--border-soft)' }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  {d.avatar ? (
                    <img src={d.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border-soft)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{initials(label)}</span>
                  )}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: d.unread > 0 ? 700 : 500, color: d.unread > 0 || active ? 'var(--foreground)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  <Badge n={d.unread} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </aside>
  )
}
