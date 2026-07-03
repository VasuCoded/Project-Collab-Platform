'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { signOut } from '@/app/auth/actions'
import { createServer } from '@/app/(main)/actions'

type Space = { id: string; type: string; name: string | null }
type Profile = { display_name: string | null; avatar_url: string | null }

function initials(name: string | null) {
  return (name ?? '?').trim().slice(0, 2).toUpperCase() || '?'
}

export function Rail({
  servers,
  dms,
  privateSpace,
  profile,
}: {
  servers: Space[]
  dms: Space[]
  privateSpace: Space | null
  profile: Profile
}) {
  const pathname = usePathname()
  const activeSpaceId = pathname.split('/')[1]
  const [busy, setBusy] = useState(false)

  async function onCreate() {
    const name = window.prompt('New server name')
    if (!name || !name.trim()) return
    setBusy(true)
    try {
      await createServer(name.trim())
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not create server')
      setBusy(false)
    }
  }

  function icon(space: Space, label: string) {
    const active = space.id === activeSpaceId
    return (
      <Link
        key={space.id}
        href={`/${space.id}`}
        title={label}
        style={{
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
        }}
      >
        {initials(label)}
      </Link>
    )
  }

  return (
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
        {servers.map((s) => icon(s, s.name ?? 'Server'))}

        <button
          onClick={onCreate}
          disabled={busy}
          title="New server"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            marginBottom: 8,
            background: '#1c1c1c',
            color: '#6ee7b7',
            border: '1px dashed #333',
            cursor: 'pointer',
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          +
        </button>

        {(dms.length > 0 || privateSpace) && <div style={{ width: 32, height: 1, background: '#333', margin: '6px 0 10px' }} />}
        {dms.map((s) => icon(s, s.name ?? 'DM'))}
        {privateSpace && icon(privateSpace, 'Me')}
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
  )
}
