'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { signOut } from '@/app/auth/actions'
import { createServer } from '@/app/(main)/actions'
import { createClient } from '@/lib/supabase/client'

type Space = { id: string; type: string; name: string | null }
type Dm = { id: string; type: string; name: string | null; avatar: string | null; unread: number; lastAt: string | null }
type Profile = { display_name: string | null; avatar_url: string | null }

function initials(name: string | null) {
  return (name ?? '?').trim().slice(0, 2).toUpperCase() || '?'
}

// The desk mark: a small workstation glyph so the top button reads "workspace",
// not "chat". Clicking it opens the desk (the `/` route).
function DeskGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 4h18" />
      <path d="M4 4v16" />
      <path d="M20 4v16" />
      <path d="M4 13h16" />
      <path d="M9 13v3" />
      <path d="M15 13v3" />
    </svg>
  )
}

// Speech-bubble glyph for the DMs button. This is the single entry point for all
// direct messages — individual DMs never get their own rail icon.
function DmGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  )
}

export function Rail({
  servers,
  dms,
  privateSpace,
  profile,
  me,
}: {
  servers: Space[]
  dms: Dm[]
  privateSpace: Space | null
  profile: Profile
  me: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const activeSpaceId = pathname.split('/')[1]
  const [busy, setBusy] = useState(false)
  const [dmOpen, setDmOpen] = useState(false)

  // Keep unread badges live: when a message from someone else lands in any
  // channel we can see, re-run the server layout (debounced) so the rail + desk
  // recompute unread without a manual navigation.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const ch = supabase
      .channel('rail:unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if ((payload.new as { author_id?: string }).author_id === me) return
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => router.refresh(), 800)
      })
      .subscribe()
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      supabase.removeChannel(ch)
    }
  }, [supabase, me, router])

  // A DM is "active" when the user is currently inside one of the dm spaces.
  const inDm = dms.some((d) => d.id === activeSpaceId)
  const totalUnread = dms.reduce((n, d) => n + (d.unread || 0), 0)

  async function onCreate() {
    const name = window.prompt('New server name')
    if (!name || !name.trim()) return
    setBusy(true)
    try {
      const id = await createServer(name.trim())
      window.location.href = `/${id}`
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not create server')
      setBusy(false)
    }
  }

  function openDm(id: string) {
    setDmOpen(false)
    router.push(`/${id}`)
  }

  const railItem = (active: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 12,
    marginBottom: 8,
    background: active ? '#4f46e5' : '#2a2a2a',
    color: '#fff',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    ...extra,
  })

  function serverIcon(space: Space) {
    const active = space.id === activeSpaceId
    return (
      <Link key={space.id} href={`/${space.id}`} title={space.name ?? 'Server'} style={railItem(active)}>
        {initials(space.name ?? 'Server')}
      </Link>
    )
  }

  return (
    <>
      <nav
        style={{
          width: 72,
          background: '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0',
          height: '100%',
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Desk — the home of the workspace. */}
          <Link href="/" title="Desk" style={railItem(pathname === '/')}>
            <DeskGlyph />
          </Link>

          {/* Direct messages — one button for all of them, opens the DM panel. */}
          <button
            onClick={() => setDmOpen((o) => !o)}
            title="Direct messages"
            style={railItem(dmOpen || inDm, { position: 'relative', color: dmOpen || inDm ? '#fff' : '#cfcfcf' })}
          >
            <DmGlyph />
            {totalUnread > 0 && (
              <span
                aria-hidden
                style={{ position: 'absolute', top: 6, right: 4, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0f0f0f' }}
              >
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>

          <div style={{ width: 32, height: 1, background: '#333', margin: '6px 0 10px' }} />

          {servers.map(serverIcon)}

          <button onClick={onCreate} disabled={busy} title="New server" style={railItem(false, { background: '#1c1c1c', color: '#6ee7b7', border: '1px dashed #333', fontSize: 22, lineHeight: 1, fontWeight: 400 })}>
            +
          </button>

          {privateSpace && (
            <Link href={`/${privateSpace.id}`} title="Me" style={railItem(privateSpace.id === activeSpaceId)}>
              {initials(profile.display_name)}
            </Link>
          )}
        </div>

        <div
          style={{
            borderTop: '1px solid #2a2a2a',
            paddingTop: 10,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: '#4f46e5',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {initials(profile.display_name)}
            </div>
          )}
          <div
            style={{ fontSize: 10, color: '#aaa', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={profile.display_name ?? ''}
          >
            {profile.display_name}
          </div>
          <form action={signOut}>
            <button style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', fontSize: 10 }}>Log out</button>
          </form>
        </div>
      </nav>

      {/* DM panel — slides in beside the rail, WhatsApp/Discord-style list of chats. */}
      {dmOpen && (
        <>
          <div onClick={() => setDmOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'fixed',
              left: 72,
              top: 0,
              bottom: 0,
              width: 300,
              zIndex: 41,
              background: '#141414',
              borderRight: '1px solid #262626',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '8px 0 24px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #262626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Direct messages</span>
              <button onClick={() => setDmOpen(false)} title="Close" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {dms.length === 0 && <div style={{ color: '#666', fontSize: 13, padding: '20px 12px', textAlign: 'center' }}>No conversations yet.</div>}
              {dms.map((d) => {
                const active = d.id === activeSpaceId
                const label = d.name ?? 'Direct message'
                return (
                  <button
                    key={d.id}
                    onClick={() => openDm(d.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '9px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: active ? '#232338' : 'transparent',
                      color: '#ededed',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {d.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <span
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: '#333',
                          color: '#ccc',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {initials(label)}
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: d.unread > 0 ? 700 : 500, color: d.unread > 0 ? '#fff' : '#ededed', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {d.unread > 0 && (
                      <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#4f46e5', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {d.unread > 99 ? '99+' : d.unread}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </>
  )
}
