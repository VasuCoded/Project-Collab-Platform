/* eslint-disable @next/next/no-img-element */
'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { startDm } from '@/app/(main)/actions'
import { useUI } from '@/components/ui-provider'
import { ContextMenu, type MenuItem } from '@/components/context-menu'
import type { SpaceMember } from '@/lib/supabase/queries'

const ASSIGNABLE = ['member', 'moderator', 'admin']

const COLLAPSE_KEY = 'membersCollapsed'
const collapseListeners = new Set<() => void>()
function subscribeCollapse(cb: () => void) {
  collapseListeners.add(cb)
  return () => { collapseListeners.delete(cb) }
}
function readCollapsed() {
  return localStorage.getItem(COLLAPSE_KEY) === '1'
}
function setCollapsedStore(v: boolean) {
  localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
  collapseListeners.forEach((l) => l())
}

const ROLE_ORDER = ['owner', 'admin', 'moderator', 'member']
const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admins', moderator: 'Moderators', member: 'Members' }

function initials(name: string) {
  return (name || '?').trim().slice(0, 2).toUpperCase() || '?'
}

export function MembersSidebar({ members, me, spaceId, myRole }: { members: SpaceMember[]; me: string; spaceId: string; myRole: string }) {
  const router = useRouter()
  const ui = useUI()
  const supabase = useMemo(() => createClient(), [])
  const [dmBusy, setDmBusy] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; member: SpaceMember } | null>(null)
  const collapsed = useSyncExternalStore(subscribeCollapse, readCollapsed, () => false)
  const canManage = myRole === 'owner' || myRole === 'admin'

  function toggle() {
    setCollapsedStore(!collapsed)
  }

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

  async function changeRole(userId: string, role: string) {
    const { error } = await supabase.rpc('set_member_role', { p_space_id: spaceId, p_user_id: userId, p_role: role })
    if (error) { ui.alert(error.message, 'Error'); return }
    ui.toast('Role updated.', 'success')
    router.refresh()
  }

  async function removeMember(userId: string, name: string) {
    const ok = await ui.confirm(`Remove ${name} from the team? This cannot be undone.`, 'Remove Member')
    if (!ok) return
    const { error } = await supabase.rpc('remove_member', { p_space_id: spaceId, p_user_id: userId })
    if (error) { ui.alert(error.message, 'Error'); return }
    ui.toast('Member removed.', 'success')
    router.refresh()
  }

  function menuItems(m: SpaceMember): MenuItem[] {
    const name = m.profiles?.display_name ?? 'Member'
    const self = m.user_id === me
    const items: MenuItem[] = []
    if (!self) items.push({ label: `Message ${name}`, onClick: () => message(m.user_id) })
    items.push({ label: 'Copy name', onClick: () => { navigator.clipboard?.writeText(name).then(() => ui.toast('Name copied.', 'success')).catch(() => {}) } })
    if (canManage && !self && m.role !== 'owner') {
      items.push('divider')
      for (const r of ASSIGNABLE) if (r !== m.role) items.push({ label: `Make ${r}`, onClick: () => changeRole(m.user_id, r) })
      items.push('divider')
      items.push({ label: 'Remove from team', danger: true, onClick: () => removeMember(m.user_id, name) })
    }
    return items
  }

  if (collapsed) {
    return (
      <aside style={{
        width: 48,
        flexShrink: 0,
        borderLeft: '1px solid var(--border)',
        background: 'var(--sidebar)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0',
        gap: 12
      }}>
        <button
          onClick={toggle}
          title="Show members"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
            borderRadius: 7,
            padding: 0
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-soft)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <span style={{
          background: 'var(--accent-soft)',
          color: 'var(--accent)',
          padding: '2px 7px',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)'
        }}>
          {members.length}
        </span>
        <span style={{
          writingMode: 'vertical-rl',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--faint)',
          fontFamily: 'var(--font-mono)',
          marginTop: 2
        }}>
          Members
        </span>
      </aside>
    )
  }

  return (
    <aside style={{
      width: 232,
      flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      background: 'var(--sidebar)',
      height: '100%',
      overflowY: 'auto',
      padding: '20px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }}>
      {/* Sidebar Header */}
      <div style={{
        padding: '0 8px 12px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--foreground)',
        fontFamily: 'var(--font-mono)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <span>Team Members</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 10,
          }}>
            {members.length}
          </span>
          <button
            onClick={toggle}
            title="Collapse members"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              border: 'none',
              background: 'transparent',
              color: 'var(--faint)',
              cursor: 'pointer',
              borderRadius: 6,
              padding: 0
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-soft)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </span>
      </div>

      {/* Member Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groups.map(({ role, list }) => {
          // Define role-specific border / dot color
          let roleColor = 'var(--border)';
          if (role === 'owner') roleColor = 'var(--warning)';
          else if (role === 'admin') roleColor = '#8b5cf6';
          else if (role === 'moderator') roleColor = '#3b82f6';

          return (
            <div key={role}>
              {/* Group Header */}
              <div style={{
                padding: '0 8px 6px',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--faint)',
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: roleColor }} />
                <span>{ROLE_LABEL[role] ?? role}</span>
                <span style={{ opacity: 0.5 }}>—</span>
                <span>{list.length}</span>
              </div>

              {/* Group List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {list.map((m) => {
                  const name = m.profiles?.display_name ?? 'Member'
                  const self = m.user_id === me
                  return (
                    <button
                      key={m.user_id}
                      onClick={() => message(m.user_id)}
                      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, member: m }) }}
                      disabled={self || dmBusy === m.user_id}
                      title={self ? 'You' : `Message ${name}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '8px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'transparent',
                        cursor: self ? 'default' : 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.12s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!self) {
                          e.currentTarget.style.background = 'var(--border-soft)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {/* Avatar with role outline */}
                      {m.profiles?.avatar_url ? (
                        <img src={m.profiles.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2px solid ${roleColor}` }} />
                      ) : (
                        <span style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--accent-soft)',
                          color: 'var(--accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          flexShrink: 0,
                          border: `2px solid ${roleColor}`
                        }}>
                          {initials(name)}
                        </span>
                      )}

                      {/* Display name & status */}
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--foreground)',
                        }}>
                          <span style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1
                          }}>
                            {name}
                          </span>
                          {self && (
                            <span style={{
                              fontSize: 9,
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--faint)',
                              fontWeight: 400,
                              textTransform: 'uppercase'
                            }}>
                              (You)
                            </span>
                          )}
                        </span>
                        {m.profiles?.status_line && (
                          <span style={{
                            display: 'block',
                            fontSize: 11,
                            color: 'var(--muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: 1,
                            fontStyle: 'italic'
                          }}>
                            &ldquo;{m.profiles.status_line}&rdquo;
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.member)} onClose={() => setMenu(null)} />
      )}
    </aside>
  )
}

