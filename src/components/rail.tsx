'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { signOut } from '@/app/auth/actions'
import { createServer, startDm } from '@/app/(main)/actions'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'
import { useUI } from '@/components/ui-provider'
import { Badge } from '@/components/badge'

type Space = { id: string; type: string; name: string | null }
type Dm = { id: string; type: string; name: string | null; avatar: string | null; unread: number; lastAt: string | null }
type Profile = { display_name: string | null; avatar_url: string | null }

function initials(name: string | null) {
  return (name ?? '?').trim().slice(0, 2).toUpperCase() || '?'
}

function DeskGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
    </svg>
  )
}

function DmGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export function Rail({
  servers,
  dms,
  unread,
  privateSpace,
  profile,
  me,
}: {
  servers: Space[]
  dms: Dm[]
  unread: Record<string, number>
  privateSpace: Space | null
  profile: Profile
  me: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const ui = useUI()
  const supabase = useMemo(() => createClient(), [])
  const activeSpaceId = pathname.split('/')[1]
  const [busy, setBusy] = useState(false)
  const [dmOpen, setDmOpen] = useState(false)

  const [picking, setPicking] = useState(false)
  const [people, setPeople] = useState<{ id: string; name: string; username: string | null; avatar: string | null }[] | null>(null)
  const [pickQuery, setPickQuery] = useState('')
  const [startingDm, setStartingDm] = useState(false)
  const [handleQuery, setHandleQuery] = useState('')
  const [handleErr, setHandleErr] = useState<string | null>(null)

  const loadPeople = useCallback(async () => {
    const { data: rows } = await supabase.from('space_members').select('user_id').neq('user_id', me)
    const ids = [...new Set((rows ?? []).map((r) => r.user_id as string))]
    if (ids.length === 0) {
      setPeople([])
      return
    }
    const { data: profs } = await supabase.from('profiles').select('id, display_name, username, avatar_url').in('id', ids)
    setPeople((profs ?? []).map((p) => ({ id: p.id, name: p.display_name ?? 'Member', username: p.username, avatar: p.avatar_url })).sort((a, b) => a.name.localeCompare(b.name)))
  }, [supabase, me])

  async function dmByUsername() {
    const handle = handleQuery.trim().toLowerCase().replace(/^@/, '')
    if (!handle || startingDm) return
    setHandleErr(null)
    const { data, error } = await supabase.from('profiles').select('id').eq('username', handle).maybeSingle()
    if (error) {
      setHandleErr(error.message)
      return
    }
    if (!data) {
      setHandleErr(`No one with @${handle}`)
      return
    }
    if (data.id === me) {
      setHandleErr("That's you.")
      return
    }
    setHandleQuery('')
    beginDm(data.id)
  }

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
      setDmOpen(false)
      setPicking(false)
      router.push(`/${id}`)
      router.refresh()
    } catch (e) {
      ui.alert(e instanceof Error ? e.message : 'Could not start DM', 'Error')
    } finally {
      setStartingDm(false)
    }
  }

  const [unreadMap, setUnreadMap] = useState<Record<string, number>>(unread)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setUnreadMap(unread), [unread])

  const inDm = dms.some((d) => d.id === activeSpaceId)
  const totalUnread = dms.reduce((n, d) => n + (unreadMap[d.id] || 0), 0)

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshUnread = useCallback(async () => {
    const { data, error } = await supabase.rpc('unread_summary')
    if (error) return
    const next: Record<string, number> = {}
    for (const r of (data ?? []) as { space_id: string; unread: number }[]) next[r.space_id] = Number(r.unread) || 0
    setUnreadMap(next)
  }, [supabase])

  useEffect(() => {
    const ch = supabase
      .channel('rail:unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if ((payload.new as { author_id?: string }).author_id === me) return
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(refreshUnread, 800)
      })
      .subscribe()
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      supabase.removeChannel(ch)
    }
  }, [supabase, me, refreshUnread])

  useEffect(() => {
    const t = setTimeout(refreshUnread, 1000)
    return () => clearTimeout(t)
  }, [pathname, refreshUnread])

  async function onCreate() {
    const name = await ui.prompt('Enter new server name:', '', 'Create Server')
    if (!name || !name.trim()) return
    setBusy(true)
    try {
      const id = await createServer(name.trim())
      ui.toast(`Server "${name.trim()}" created!`, 'success')
      window.location.href = `/${id}`
    } catch (e) {
      ui.alert(e instanceof Error ? e.message : 'Could not create server', 'Error')
      setBusy(false)
    }
  }

  function openDm(id: string) {
    setDmOpen(false)
    setUnreadMap((prev) => ({ ...prev, [id]: 0 }))
    router.push(`/${id}`)
    router.refresh()
  }

  const getRailItemStyle = (active: boolean, isPlus = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: active ? 10 : 16,
    marginBottom: 10,
    background: active 
      ? 'var(--accent)' 
      : isPlus ? 'transparent' : 'var(--card)',
    color: active 
      ? '#fff' 
      : isPlus ? 'var(--accent)' : 'var(--foreground)',
    border: isPlus ? '1px dashed var(--border)' : '1px solid var(--border)',
    textDecoration: 'none',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'var(--font-mono), monospace',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    boxShadow: active ? '0 4px 12px var(--shadow-lg)' : 'none',
  })

  return (
    <>
      <nav
        style={{
          width: 72,
          background: 'var(--sidebar)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0',
          height: '100%',
          flexShrink: 0,
          zIndex: 30,
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          <Link 
            href="/desk" 
            title="Desk" 
            style={getRailItemStyle(pathname === '/desk')}
            className="rail-nav-item"
          >
            <DeskGlyph />
            {pathname === '/desk' && <span className="active-dot-left" />}
          </Link>

          <button
            onClick={() => { setDmOpen((o) => !o); setPicking(false) }}
            title="Direct Messages"
            style={getRailItemStyle(dmOpen || inDm)}
            className="rail-nav-item"
          >
            <DmGlyph />
            {(dmOpen || inDm) && <span className="active-dot-left" />}
            {totalUnread > 0 && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  borderRadius: 99,
                  background: 'var(--danger)',
                  color: '#fff',
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 0 2px var(--sidebar)',
                }}
              >
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>

          <div style={{ width: 24, height: 1, background: 'var(--border)', margin: '8px 0 12px' }} />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            {servers.map((space) => {
              const active = space.id === activeSpaceId
              const hasUnread = !active && (unreadMap[space.id] || 0) > 0
              return (
                <Link 
                  key={space.id} 
                  href={`/${space.id}`} 
                  title={space.name ?? 'Server'} 
                  style={getRailItemStyle(active)}
                  className="rail-nav-item"
                >
                  {initials(space.name ?? 'Server')}
                  {active && <span className="active-dot-left" />}
                  {hasUnread && (
                    <span aria-hidden style={{
                      position: 'absolute',
                      right: 2,
                      top: 2,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      boxShadow: '0 0 0 2px var(--sidebar)',
                    }} />
                  )}
                </Link>
              )
            })}
          </div>

          <button 
            onClick={onCreate} 
            disabled={busy} 
            title="Create Team" 
            style={getRailItemStyle(false, true)}
            className="rail-nav-item plus-btn"
          >
            <span style={{ fontSize: 18, fontWeight: 300 }}>+</span>
          </button>

          {privateSpace && (
            <Link 
              href={`/${privateSpace.id}`} 
              title="Personal Space" 
              style={getRailItemStyle(privateSpace.id === activeSpaceId)}
              className="rail-nav-item"
            >
              {initials(profile.display_name)}
              {privateSpace.id === activeSpaceId && <span className="active-dot-left" />}
            </Link>
          )}
        </div>

        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 14,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <ThemeToggle />
          
          <Link href="/settings" title="Profile Settings" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none', width: '100%' }}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: 8, border: pathname === '/settings' ? '2px solid var(--accent)' : '1px solid var(--border)', objectFit: 'cover', transition: 'all 0.15s' }} />
            ) : (
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: pathname === '/settings' ? 'var(--accent)' : 'var(--border-soft)',
                  color: pathname === '/settings' ? '#fff' : 'var(--foreground)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  transition: 'all 0.15s',
                }}
              >
                {initials(profile.display_name)}
              </div>
            )}
            <div
              style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: pathname === '/settings' ? 'var(--accent)' : 'var(--muted)', maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase', fontWeight: 600 }}
              title={profile.display_name ?? ''}
            >
              {profile.display_name}
            </div>
          </Link>

          <form action={signOut}>
            <button style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: 600 }}>
              Exit
            </button>
          </form>
        </div>
      </nav>

      {dmOpen && (
        <>
          <div onClick={() => { setDmOpen(false); setPicking(false) }} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0, 0, 0, 0.15)', backdropFilter: 'blur(2px)' }} />
          <div
            style={{
              position: 'fixed',
              left: 72,
              top: 0,
              bottom: 0,
              width: 280,
              zIndex: 41,
              background: 'var(--sidebar)',
              borderRight: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '4px 0 20px var(--shadow)',
              animation: 'drawer-slide 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
          >
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--foreground)', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {picking ? 'New Chat' : 'Messages'}
              </span>
              <button 
                onClick={() => (picking ? setPicking(false) : setDmOpen(false))} 
                title="Close" 
                style={{ background: 'var(--border-soft)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 4, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
              >
                {picking ? '‹' : '×'}
              </button>
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
                
                <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 2px 6px' }}>
                  Team Members
                </div>
                <input
                  value={pickQuery}
                  onChange={(e) => setPickQuery(e.target.value)}
                  placeholder="Filter by name..."
                  style={{ background: 'var(--background)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '6px 8px', color: 'var(--foreground)', fontSize: 12, outline: 'none', marginBottom: 8 }}
                />
                
                {people === null && <div style={{ color: 'var(--muted)', fontSize: 11, padding: '12px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>LOADING...</div>}
                {people?.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 11, padding: '12px', textAlign: 'center' }}>No team members found yet.</div>}
                
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
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px', borderRadius: 6, border: 'none', background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 8 }}
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
                    const active = d.id === activeSpaceId
                    const label = d.name ?? 'Direct message'
                    const unreadN = unreadMap[d.id] || 0
                    return (
                      <button
                        key={d.id}
                        onClick={() => openDm(d.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: 'none',
                          background: active ? 'var(--accent-soft)' : 'transparent',
                          color: 'var(--foreground)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--border-soft)' }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                      >
                        {d.avatar ? (
                          <img src={d.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <span
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: 'var(--border-soft)',
                              color: 'var(--muted)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              flexShrink: 0,
                            }}
                          >
                            {initials(label)}
                          </span>
                        )}
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: unreadN > 0 ? 700 : 500, color: unreadN > 0 ? 'var(--foreground)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                        <Badge n={unreadN} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        .rail-nav-item:hover {
          border-radius: 10px !important;
          background: var(--accent) !important;
          color: #fff !important;
          box-shadow: 0 4px 12px var(--shadow-lg);
        }
        .rail-nav-item:hover .active-dot-left,
        .rail-nav-item:active .active-dot-left {
          height: 16px !important;
        }
        .rail-nav-item.plus-btn:hover {
          background: var(--accent-soft) !important;
          color: var(--accent) !important;
          border-style: solid !important;
        }
        .active-dot-left {
          position: absolute;
          left: -4px;
          top: 50%;
          transform: translateY(-50%);
          width: 4px;
          height: 8px;
          background: var(--accent);
          border-radius: 0 4px 4px 0;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes drawer-slide {
          from { transform: translateX(-12px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}
