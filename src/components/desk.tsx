'use client'

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createServer } from '@/app/(main)/actions'
import { useUI } from '@/components/ui-provider'

export type Team = { id: string; name: string; members: number; openTasks: number; unread: number }
export type WaitingTask = { id: string; title: string; spaceId: string; spaceName: string; due: string | null; status: string }
export type DeskDm = { id: string; name: string; avatar: string | null; unread: number }

function initials(name: string) {
  return (name || '?').trim().slice(0, 2).toUpperCase() || '?'
}

function dueLabel(iso: string | null): { text: string; overdue: boolean } | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const now = Date.now()
  const diff = then - now
  const overdue = diff < 0
  const mins = Math.round(Math.abs(diff) / 60000)
  const hrs = Math.round(mins / 60)
  const days = Math.round(hrs / 24)
  let mag: string
  if (mins < 60) mag = `${Math.max(mins, 1)}m`
  else if (hrs < 24) mag = `${hrs}h`
  else mag = `${days}d`
  return { text: overdue ? `${mag} overdue` : mag, overdue }
}

function Badge({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span style={{
      minWidth: 16,
      height: 16,
      padding: '0 5px',
      borderRadius: 4,
      background: 'var(--accent)',
      color: '#fff',
      fontSize: 10,
      fontFamily: 'var(--font-mono), monospace',
      fontWeight: 700,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

export function Desk({
  displayName,
  teams,
  waiting,
  dms,
}: {
  displayName: string
  teams: Team[]
  waiting: WaitingTask[]
  dms: DeskDm[]
}) {
  const router = useRouter()
  const ui = useUI()
  const [busy, setBusy] = useState(false)
  const [dmFilter, setDmFilter] = useState<'all' | 'unread'>('all')
  const [formattedDate, setFormattedDate] = useState('')

  // Scratchpad state
  const [scratch, setScratch] = useState('')

  // Dynamic mock telemetry state
  const [telemetry, setTelemetry] = useState({ latency: '14ms', cpu: '2%', time: '' })

  useEffect(() => {
    // Format Date
    const today = new Date()
    const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
    setFormattedDate(today.toLocaleDateString('en-US', options))

    // Load scratchpad
    const saved = localStorage.getItem('collab_desk_scratchpad')
    if (saved) setScratch(saved)

    // Live telemetry update
    const interval = setInterval(() => {
      const ms = Math.floor(Math.random() * 8) + 12
      const cpuVal = Math.floor(Math.random() * 4) + 1
      const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      setTelemetry({
        latency: `${ms}ms`,
        cpu: `${cpuVal}%`,
        time: now
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  const handleScratchChange = (val: string) => {
    setScratch(val)
    localStorage.setItem('collab_desk_scratchpad', val)
  }

  const blockedCount = waiting.length
  const shownDms = dmFilter === 'unread' ? dms.filter((d) => d.unread > 0) : dms

  async function onCreate() {
    const name = await ui.prompt('Enter new team name:', '', 'Create Team')
    if (!name || !name.trim()) return
    setBusy(true)
    try {
      const id = await createServer(name.trim())
      ui.toast(`Team "${name.trim()}" created successfully!`, 'success')
      router.push(`/${id}`)
    } catch (e) {
      ui.alert(e instanceof Error ? e.message : 'Could not create team', 'Error')
      setBusy(false)
    }
  }



  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      height: '100%',
      overflowY: 'auto',
      background: 'var(--background)',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
    }}>
      {/* Background blueprint grid - extremely subtle */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'linear-gradient(to right, var(--border-soft) 1px, transparent 1px), linear-gradient(to bottom, var(--border-soft) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        pointerEvents: 'none',
        opacity: 0.4,
      }} />

      <div style={{
        position: 'relative',
        maxWidth: 1080,
        margin: '0 auto',
        padding: '40px 32px 80px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>

        {/* PREMIUM COMPACT HEADER */}
        <header style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '20px 24px',
          boxShadow: '0 1px 3px var(--shadow)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <h1 style={{
                fontSize: 24,
                fontWeight: 800,
                color: 'var(--foreground)',
                fontFamily: 'var(--display-font)',
                margin: 0,
                letterSpacing: '-0.02em',
              }}>
                Your Desk
              </h1>
              {formattedDate && (
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--faint)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  // {formattedDate}
                </span>
              )}
            </div>

            <p style={{
              fontSize: 13,
              color: 'var(--muted)',
              margin: '4px 0 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span>Welcome back, <strong style={{ color: 'var(--foreground)', fontWeight: 600 }}>{displayName}</strong>.</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--faint)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {teams.length} {teams.length === 1 ? 'team' : 'teams'} active
              </span>
            </p>
          </div>

          <button
            onClick={onCreate}
            disabled={busy}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: '1px solid var(--accent-hover)',
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
          >
            <span>+ New Team</span>
          </button>
        </header>

        {/* METRICS & SYSTEM TELEMETRY ROW */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '16px 20px',
          boxShadow: '0 1px 3px var(--shadow)',
        }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Action Rate
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)', marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {waiting.filter(t => t.status === 'done').length} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>of {waiting.length} completed</span>
            </div>
            <div style={{ height: 3, background: 'var(--border-soft)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: 'var(--accent)',
                width: waiting.length > 0 ? `${(waiting.filter(t => t.status === 'done').length / waiting.length) * 100}%` : '100%',
                borderRadius: 2,
              }} />
            </div>
          </div>

          <div style={{ borderLeft: '1px solid var(--border-soft)', paddingLeft: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active Load
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)', marginTop: 4 }}>
              {teams.length} Workspaces
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
              Total Members: {teams.reduce((acc, t) => acc + t.members, 0)}
            </div>
          </div>

          <div style={{ borderLeft: '1px solid var(--border-soft)', paddingLeft: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Sync Status
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.5s infinite' }} />
              Live Connected
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
              Ping: {telemetry.latency}
            </div>
          </div>

          <div style={{ borderLeft: '1px solid var(--border-soft)', paddingLeft: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Local Time
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              {telemetry.time || '--:--:--'}
            </div>

          </div>
        </section>

        {/* 2-COLUMN SPLIT GRID */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr',
          gap: 24,
          alignItems: 'start',
        }}>

          {/* LEFT SIDE: TASKS & TEAMS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* SECTION 01: WAITING ON YOU */}
            <section style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              boxShadow: '0 1px 3px var(--shadow)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
                borderBottom: '1px solid var(--border-soft)',
                paddingBottom: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>[01]</span>
                  <h2 style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    margin: 0,
                  }}>
                    Waiting on you
                  </h2>
                </div>
                {blockedCount > 0 && (
                  <span style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--danger)',
                    background: 'var(--danger-soft)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontWeight: 700,
                  }}>
                    {blockedCount} PENDING
                  </span>
                )}
              </div>

              {waiting.length === 0 ? (
                <div style={{
                  padding: '24px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  gap: 12,
                }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                      All Caught Up
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                      No tasks require your immediate attention right now.
                    </p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {waiting.map((t) => {
                    const due = dueLabel(t.due)
                    return (
                      <Link
                        key={t.id}
                        href={`/${t.spaceId}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          padding: '12px 14px',
                          textDecoration: 'none',
                          borderRadius: 6,
                          border: '1px solid var(--border-soft)',
                          background: 'var(--background)',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)'
                          e.currentTarget.style.background = 'var(--card)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-soft)'
                          e.currentTarget.style.background = 'var(--background)'
                        }}
                      >
                        <span style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: due?.overdue ? 'var(--danger)' : 'var(--accent)',
                          flexShrink: 0,
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: 'block',
                            color: 'var(--foreground)',
                            fontSize: 13,
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {t.title}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span style={{ color: 'var(--muted)', fontSize: 11 }}>{t.spaceName}</span>
                            <span style={{ color: 'var(--faint)', fontSize: 10 }}>•</span>
                            <span style={{ color: 'var(--faint)', fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{t.status}</span>
                          </div>
                        </div>
                        {due && (
                          <span style={{
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: due.overdue ? 'var(--danger-soft)' : 'var(--accent-soft)',
                            color: due.overdue ? 'var(--danger)' : 'var(--accent)',
                            border: `1px solid ${due.overdue ? 'rgba(178, 58, 38, 0.1)' : 'rgba(14, 92, 70, 0.1)'}`,
                          }}>
                            {due.text}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>

            {/* SECTION 02: YOUR TEAMS */}
            <section style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              boxShadow: '0 1px 3px var(--shadow)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 20,
                borderBottom: '1px solid var(--border-soft)',
                paddingBottom: 10,
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>[02]</span>
                <h2 style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  margin: '0 0 0 8px',
                }}>
                  Your Teams
                </h2>
              </div>

              {teams.length === 0 ? (
                <div style={{
                  padding: '24px 0',
                  color: 'var(--muted)',
                  fontSize: 13,
                  textAlign: 'center',
                  border: '1px dashed var(--border)',
                  borderRadius: 6,
                }}>
                  No active teams. Create one to start collaborating.
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 12,
                }}>
                  {teams.map((tm) => (
                    <div
                      key={tm.id}
                      style={{
                        background: 'var(--background)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: 8,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 12,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)'
                        e.currentTarget.style.boxShadow = '0 2px 8px var(--shadow)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-soft)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          width: 28,
                          height: 28,
                          borderRadius: 4,
                          background: 'var(--accent-soft)',
                          color: 'var(--accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 800,
                          fontFamily: 'var(--font-mono)',
                          flexShrink: 0,
                        }}>
                          {initials(tm.name)}
                        </span>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{
                            color: 'var(--foreground)',
                            fontSize: 13,
                            fontWeight: 700,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {tm.name}
                          </div>
                          <div style={{
                            color: 'var(--faint)',
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            marginTop: 2,
                          }}>
                            {tm.members} {tm.members === 1 ? 'MEMBER' : 'MEMBERS'}
                          </div>
                        </div>

                        <Badge n={tm.unread} />
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid var(--border-soft)',
                        paddingTop: 10,
                        marginTop: 4,
                      }}>
                        <span style={{
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                          color: tm.openTasks > 0 ? 'var(--foreground)' : 'var(--faint)',
                          fontWeight: tm.openTasks > 0 ? 600 : 400,
                        }}>
                          {tm.openTasks > 0 ? `${tm.openTasks} ACTIVE` : 'NO TASKS'}
                        </span>

                        <Link
                          href={`/${tm.id}`}
                          style={{
                            background: 'var(--accent)',
                            color: '#fff',
                            textDecoration: 'none',
                            borderRadius: 4,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>

          {/* RIGHT SIDE: DMs & SCRATCHPAD */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* SECTION 03: DIRECT MESSAGES */}
            <section style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              boxShadow: '0 1px 3px var(--shadow)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
                borderBottom: '1px solid var(--border-soft)',
                paddingBottom: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>[03]</span>
                  <h2 style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    margin: 0,
                  }}>
                    Direct Messages
                  </h2>
                </div>

                {/* Toggle filter */}
                <div style={{
                  display: 'flex',
                  background: 'var(--background)',
                  padding: 2,
                  borderRadius: 4,
                  border: '1px solid var(--border-soft)',
                }}>
                  {(['all', 'unread'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setDmFilter(f)}
                      style={{
                        background: dmFilter === f ? 'var(--card)' : 'transparent',
                        color: dmFilter === f ? 'var(--foreground)' : 'var(--muted)',
                        border: 'none',
                        borderRadius: 3,
                        padding: '3px 8px',
                        fontSize: 10,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {shownDms.length === 0 ? (
                  <div style={{
                    padding: '32px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    gap: 12,
                  }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'var(--border-soft)',
                      color: 'var(--faint)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                        No conversations
                      </h3>
                      <p style={{ margin: '4px 0 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                        Start direct messages with team members in the sidebar.
                      </p>
                    </div>
                  </div>
                ) : (
                  shownDms.map((d) => (
                    <Link
                      key={d.id}
                      href={`/${d.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        textDecoration: 'none',
                        borderRadius: 6,
                        transition: 'all 0.15s ease',
                        background: d.unread > 0 ? 'var(--accent-soft)' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (d.unread === 0) e.currentTarget.style.background = 'var(--border-soft)'
                      }}
                      onMouseLeave={(e) => {
                        if (d.unread === 0) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {d.avatar ? (
                        <img
                          src={d.avatar}
                          alt=""
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            flexShrink: 0,
                            border: d.unread > 0 ? '2px solid var(--accent)' : '1px solid var(--border)',
                          }}
                        />
                      ) : (
                        <span style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: d.unread > 0 ? 'var(--accent)' : 'var(--border-soft)',
                          color: d.unread > 0 ? '#fff' : 'var(--muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          flexShrink: 0,
                        }}>
                          {initials(d.name)}
                        </span>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: d.unread > 0 ? 'var(--foreground)' : 'var(--muted)',
                          fontSize: 13,
                          fontWeight: d.unread > 0 ? 700 : 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {d.name}
                        </div>
                      </div>

                      <Badge n={d.unread} />
                    </Link>
                  ))
                )}
              </div>
            </section>

            {/* NEW SECTION 05: PERSONAL SCRATCHPAD */}
            <section style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              boxShadow: '0 1px 3px var(--shadow)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
                borderBottom: '1px solid var(--border-soft)',
                paddingBottom: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>[05]</span>
                  <h2 style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--muted)',
                    margin: 0,
                  }}>
                    Desk Scratchpad
                  </h2>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)', textTransform: 'uppercase' }}>
                  local auto-save
                </span>
              </div>

              <textarea
                value={scratch}
                onChange={(e) => handleScratchChange(e.target.value)}
                placeholder="Draft daily action plans, ideas, or quick todo items here..."
                style={{
                  width: '100%',
                  height: 100,
                  boxSizing: 'border-box',
                  background: 'var(--background)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 6,
                  padding: 12,
                  color: 'var(--foreground)',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.5,
                  resize: 'none',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-soft)'}
              />
            </section>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}
