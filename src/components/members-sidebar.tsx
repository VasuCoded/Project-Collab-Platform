/* eslint-disable @next/next/no-img-element */
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { startDm } from '@/app/(main)/actions'
import { useUI } from '@/components/ui-provider'
import type { SpaceMember } from '@/lib/supabase/queries'

const ROLE_ORDER = ['owner', 'admin', 'moderator', 'member']
const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admins', moderator: 'Moderators', member: 'Members' }

function initials(name: string) {
  return (name || '?').trim().slice(0, 2).toUpperCase() || '?'
}

export function MembersSidebar({ members, me }: { members: SpaceMember[]; me: string }) {
  const router = useRouter()
  const ui = useUI()
  const [dmBusy, setDmBusy] = useState<string | null>(null)

  const groups = useMemo(() => {
    const g: Record<string, SpaceMember[]> = {}
    for (const m of members) (g[m.role] ??= []).push(m)
    return ROLE_ORDER.filter((r) => g[r]?.length).map((r) => ({ role: r, list: g[r] }))
  }, [members])

  async function message(userId: string) {
    if (userId === me || dmBusy) return
    setDmBusy(userId)
    try {
      const id = await startDm(userId)
      router.push(`/${id}`)
      router.refresh()
    } catch (e) {
      ui.alert(e instanceof Error ? e.message : 'Could not open DM', 'Error')
      setDmBusy(null)
    }
  }

  return (
    <aside style={{ width: 232, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--sidebar)', height: '100%', overflowY: 'auto', padding: '14px 10px' }}>
      <div style={{ padding: '0 8px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
        Members — {members.length}
      </div>

      {groups.map(({ role, list }) => (
        <div key={role} style={{ marginBottom: 14 }}>
          <div style={{ padding: '0 8px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>
            {ROLE_LABEL[role] ?? role} — {list.length}
          </div>
          {list.map((m) => {
            const name = m.profiles?.display_name ?? 'Member'
            const self = m.user_id === me
            return (
              <button
                key={m.user_id}
                onClick={() => message(m.user_id)}
                disabled={self || dmBusy === m.user_id}
                title={self ? 'You' : `Message ${name}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', borderRadius: 6, border: 'none', background: 'transparent', cursor: self ? 'default' : 'pointer', textAlign: 'left', transition: 'background 0.12s ease' }}
                onMouseEnter={(e) => { if (!self) e.currentTarget.style.background = 'var(--border-soft)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {m.profiles?.avatar_url ? (
                  <img src={m.profiles.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border-soft)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{initials(name)}</span>
                )}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}{self && <span style={{ color: 'var(--faint)', fontWeight: 400 }}> (you)</span>}
                  </span>
                  {m.profiles?.status_line && (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.profiles.status_line}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </aside>
  )
}
