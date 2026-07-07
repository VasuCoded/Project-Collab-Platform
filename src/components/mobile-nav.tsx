/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/app/auth/actions'
import { ThemeToggle } from '@/components/theme-toggle'
import { renderIcon } from '@/components/channel-column'

type Space = { id: string; type: string; name: string | null }
type Dm = { id: string; type: string; name: string | null; avatar: string | null; unread: number; lastAt: string | null }
type Profile = { display_name: string | null; avatar_url: string | null }
type ChannelRow = { id: string; name: string; type: string; space_id: string }

function initials(name: string | null) {
  return (name ?? '?').trim().slice(0, 2).toUpperCase() || '?'
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', padding: '14px 10px 6px' }}>
      {children}
    </div>
  )
}

function Row({ icon, label, sub, active, badge, onClick }: { icon: React.ReactNode; label: string; sub?: string | null; active?: boolean; badge?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '11px 10px', borderRadius: 10, border: 'none',
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--foreground)',
        cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: active ? 'var(--accent)' : 'var(--muted)' }}>
        {icon}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{sub}</span>}
      </span>
      {badge}
    </button>
  )
}

function InitialsBadge({ name, active }: { name: string | null; active: boolean }) {
  return (
    <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', background: active ? 'var(--accent)' : 'var(--card)', color: active ? '#fff' : 'var(--foreground)', border: '1px solid var(--border)' }}>
      {initials(name)}
    </span>
  )
}

function DmAvatar({ dm }: { dm: Dm }) {
  return dm.avatar ? (
    <img src={dm.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', background: 'var(--border-soft)', color: 'var(--muted)' }}>
      {initials(dm.name)}
    </span>
  )
}

const DeskIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="M15 3v18" /><path d="M3 9h18" /><path d="M3 15h18" />
  </svg>
)
const MembersIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const LockIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

export function MobileNav({ servers, dms, privateSpace, profile }: { servers: Space[]; dms: Dm[]; privateSpace: Space | null; profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<number | null>(null)

  const activeSpaceId = pathname.split('/')[1] || ''
  const activeChannelId = pathname.split('/')[2] || ''

  useEffect(() => {
    let active = true
    const ids = [...servers.map((s) => s.id), ...(privateSpace ? [privateSpace.id] : [])]
    if (ids.length === 0) return
    ;(async () => {
      const { data } = await supabase.from('channels').select('id, name, type, space_id').in('space_id', ids).order('position')
      if (active) setChannels((data as ChannelRow[]) ?? [])
    })()
    return () => { active = false }
  }, [servers, privateSpace, supabase])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [open])

  const spaceById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of servers) m.set(s.id, s.name ?? 'Space')
    for (const d of dms) m.set(d.id, d.name ?? 'Direct message')
    if (privateSpace) m.set(privateSpace.id, 'Your space')
    return m
  }, [servers, dms, privateSpace])

  const currentChannel = channels.find((c) => c.id === activeChannelId)
  const spaceChannels = channels.filter((c) => c.space_id === activeSpaceId)
  const currentServer = servers.find((s) => s.id === activeSpaceId)

  const label = pathname === '/desk' ? 'Desk'
    : (currentChannel?.name ?? spaceById.get(activeSpaceId) ?? 'Menu')

  function close() { setOpen(false); setQuery('') }
  function go(path: string) { router.push(path); close() }

  const q = query.trim().toLowerCase()
  const matches = q
    ? {
        channels: channels.filter((c) => c.name.toLowerCase().includes(q)),
        spaces: servers.filter((s) => (s.name ?? '').toLowerCase().includes(q)),
        dms: dms.filter((d) => (d.name ?? '').toLowerCase().includes(q)),
      }
    : null

  return (
    <>
      <div className="mobile-topbar" style={{
        height: 52, flexShrink: 0, alignItems: 'center', gap: 8,
        padding: '0 12px', background: 'var(--sidebar)', borderBottom: '1px solid var(--border)',
      }}>
        <button
          onClick={() => setOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', color: 'var(--foreground)', cursor: 'pointer', padding: '6px 4px', minWidth: 0, flex: 1 }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }} aria-hidden>
            <span style={{ width: 17, height: 2, borderRadius: 2, background: 'var(--muted)' }} />
            <span style={{ width: 17, height: 2, borderRadius: 2, background: 'var(--muted)' }} />
            <span style={{ width: 11, height: 2, borderRadius: 2, background: 'var(--muted)' }} />
          </span>
          <span style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <span style={{ color: 'var(--faint)', fontSize: 13, flexShrink: 0 }}>⌄</span>
        </button>
        <span style={{ width: 28, height: 28, borderRadius: 7, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--border-soft)', border: '1px solid var(--border)' }}>
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--foreground)' }}>{initials(profile.display_name)}</span>}
        </span>
      </div>

      {open && (
        <div className="mobile-sheet-root">
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(2px)', animation: 'mn-fade 0.18s ease' }} />
          <div
            ref={sheetRef}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 201,
              maxHeight: '82dvh', display: 'flex', flexDirection: 'column',
              background: 'var(--card)', borderTop: '1px solid var(--border)',
              borderRadius: '18px 18px 0 0', boxShadow: '0 -14px 44px var(--shadow-lg)',
              animation: 'mn-up 0.24s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            <div
              onPointerDown={(e) => { dragStart.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
              onPointerMove={(e) => {
                if (dragStart.current == null || !sheetRef.current) return
                const dy = Math.max(0, e.clientY - dragStart.current)
                sheetRef.current.style.transition = 'none'
                sheetRef.current.style.transform = `translateY(${dy}px)`
              }}
              onPointerUp={(e) => {
                if (dragStart.current == null) return
                const dy = Math.max(0, e.clientY - dragStart.current)
                dragStart.current = null
                const el = sheetRef.current
                if (el) { el.style.transition = 'transform 0.2s ease'; el.style.transform = 'translateY(0)' }
                if (dy > 110) close()
              }}
              style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center', touchAction: 'none', cursor: 'grab' }}
            >
              <span style={{ width: 38, height: 4, borderRadius: 3, background: 'var(--border)' }} />
            </div>

            <div style={{ padding: '4px 14px 10px' }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to a channel or space…"
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 14, color: 'var(--foreground)', outline: 'none', fontFamily: 'var(--font-sans)' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', WebkitOverflowScrolling: 'touch' }}>
              {matches ? (
                (matches.channels.length + matches.spaces.length + matches.dms.length) === 0 ? (
                  <div style={{ color: 'var(--faint)', fontSize: 13, fontFamily: 'var(--font-mono)', padding: '18px 10px', textAlign: 'center' }}>Nothing matches “{query.trim()}”.</div>
                ) : (
                  <>
                    {matches.channels.map((c) => (
                      <Row key={c.id} icon={renderIcon(c.type)} label={c.name} sub={spaceById.get(c.space_id)} active={c.id === activeChannelId} onClick={() => go(`/${c.space_id}/${c.id}`)} />
                    ))}
                    {matches.spaces.map((s) => (
                      <Row key={s.id} icon={<InitialsBadge name={s.name} active={s.id === activeSpaceId} />} label={s.name ?? 'Space'} sub="Team" active={s.id === activeSpaceId} onClick={() => go(`/${s.id}`)} />
                    ))}
                    {matches.dms.map((d) => (
                      <Row key={d.id} icon={<DmAvatar dm={d} />} label={d.name ?? 'Direct message'} sub="Direct message" active={d.id === activeSpaceId} onClick={() => go(`/${d.id}`)} />
                    ))}
                  </>
                )
              ) : (
                <>
                  {currentServer && (
                    <>
                      <SectionLabel>{currentServer.name ?? 'Space'}</SectionLabel>
                      {spaceChannels.map((c) => (
                        <Row key={c.id} icon={renderIcon(c.type)} label={c.name} active={c.id === activeChannelId} onClick={() => go(`/${currentServer.id}/${c.id}`)} />
                      ))}
                      <Row icon={MembersIcon} label="Members" onClick={() => go(`/${currentServer.id}/members`)} />
                    </>
                  )}

                  <SectionLabel>Spaces</SectionLabel>
                  <Row icon={DeskIcon} label="Desk" active={pathname === '/desk'} onClick={() => go('/desk')} />
                  {servers.map((s) => (
                    <Row key={s.id} icon={<InitialsBadge name={s.name} active={s.id === activeSpaceId} />} label={s.name ?? 'Space'} active={s.id === activeSpaceId} onClick={() => go(`/${s.id}`)} />
                  ))}

                  {dms.length > 0 && (
                    <>
                      <SectionLabel>Direct messages</SectionLabel>
                      {dms.map((d) => (
                        <Row
                          key={d.id}
                          icon={<DmAvatar dm={d} />}
                          label={d.name ?? 'Direct message'}
                          active={d.id === activeSpaceId}
                          badge={d.unread > 0 ? <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99, background: 'var(--danger)', color: '#fff', fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{d.unread > 99 ? '99+' : d.unread}</span> : undefined}
                          onClick={() => go(`/${d.id}`)}
                        />
                      ))}
                    </>
                  )}

                  {privateSpace && (
                    <>
                      <SectionLabel>Your space</SectionLabel>
                      <Row icon={LockIcon} label="Private space" active={privateSpace.id === activeSpaceId} onClick={() => go(`/${privateSpace.id}`)} />
                    </>
                  )}
                </>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ThemeToggle />
              <button onClick={() => go('/settings')} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, background: 'none', border: 'none', color: 'var(--foreground)', cursor: 'pointer', padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600, textAlign: 'left', minWidth: 0 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--border-soft)', border: '1px solid var(--border)' }}>
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{initials(profile.display_name)}</span>}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name ?? 'Settings'}</span>
              </button>
              <form action={signOut}>
                <button type="submit" style={{ background: 'var(--border-soft)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', padding: '8px 12px', borderRadius: 8 }}>
                  Exit
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes mn-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes mn-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  )
}
